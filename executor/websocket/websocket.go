package websocket

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"supalytics-executor/runner"

	"github.com/gorilla/websocket"
	"github.com/supabase-community/supabase-go"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 512 * 1024 // 512KB
)

// MessageType represents different types of messages sent to the client
type MessageType string

const (
	MessageTypeMetadata MessageType = "metadata"
	MessageTypeColumns  MessageType = "columns"
	MessageTypeRow      MessageType = "row"
	MessageTypeError    MessageType = "error"
	MessageTypeComplete MessageType = "complete"
	MessageTypeStatus   MessageType = "status"
	MessageTypeCancel   MessageType = "cancel"
)

// QueryRequest represents a single query execution request
type QueryRequest struct {
	QueryID      string                 `json:"queryId"`
	StreamID     string                 `json:"streamId"`
	TemplateData map[string]interface{} `json:"templateData"`
}

// CancelRequest represents a request to cancel a running query
type CancelRequest struct {
	StreamID string `json:"streamId"`
}

// WSMessage represents the standardized message format
type WSMessage struct {
	Type     MessageType            `json:"type"`
	StreamID string                 `json:"streamId"`
	Payload  map[string]interface{} `json:"payload,omitempty"`
}

// QueryMetadata represents the metadata about a query execution
type QueryMetadata struct {
	TotalRows int64    `json:"totalRows"`
	Columns   []string `json:"columns"`
}

// QueryTask represents a query execution task in the queue
type QueryTask struct {
	Request    *QueryRequest
	CancelFunc context.CancelFunc
	ExecutedAt time.Time
	Status     string // "queued", "running", "completed", "failed", "cancelled"
}

// ConnectionState manages state for a single WebSocket connection
type ConnectionState struct {
	Conn         *websocket.Conn
	QueryQueue   chan *QueryTask
	ActiveTasks  map[string]*QueryTask
	TasksMutex   sync.RWMutex
	WriteMutex   sync.Mutex
	QueueWorkers int
}

type Config struct {
	SupabaseURL   string `toml:"supabase_url"`
	SupabaseKey   string `toml:"supabase_key"`
	Port          string `toml:"port" default:"8080"`
	MaxWorkers    int    `toml:"max_workers" default:"3"`
	QueueCapacity int    `toml:"queue_capacity" default:"100"`
}

// Server represents the WebSocket server
type Server struct {
	config        Config
	supaClient    *supabase.Client
	upgrader      websocket.Upgrader
	activeConns   sync.Map
	maxWorkers    int
	queueCapacity int
}

// NewServer creates a new WebSocket server instance
func NewServer(cfg Config) (*Server, error) {
	client, err := supabase.NewClient(cfg.SupabaseURL, cfg.SupabaseKey, nil)
	if err != nil {
		return nil, fmt.Errorf("initialize Supabase client: %w", err)
	}

	return &Server{
		config:        cfg,
		supaClient:    client,
		maxWorkers:    cfg.MaxWorkers,
		queueCapacity: cfg.QueueCapacity,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true // Configure appropriately for production
			},
		},
	}, nil
}

// NewConnectionState creates a new connection state
func NewConnectionState(conn *websocket.Conn, queueCapacity int) *ConnectionState {
	return &ConnectionState{
		Conn:         conn,
		QueryQueue:   make(chan *QueryTask, queueCapacity),
		ActiveTasks:  make(map[string]*QueryTask),
		QueueWorkers: 0,
	}
}

// handleHealth handles health check requests
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("healthy"))
}

// handleWebSocket handles WebSocket connections
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	connState := NewConnectionState(conn, s.queueCapacity)
	connID := fmt.Sprintf("%p", conn)
	s.activeConns.Store(connID, connState)

	defer func() {
		s.cleanupConnection(connState)
		s.activeConns.Delete(connID)
		conn.Close()
	}()

	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	for i := 0; i < s.maxWorkers; i++ {
		go s.startQueueWorker(ctx, connState)
	}

	go s.writePingMessages(conn, connState)

	for {
		var msg struct {
			Type         MessageType            `json:"type"`
			StreamID     string                 `json:"streamId"`
			QueryID      string                 `json:"queryId,omitempty"`
			TemplateData map[string]interface{} `json:"templateData,omitempty"`
		}

		err := conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway,
				websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket read error: %v", err)
			}
			return
		}

		if msg.Type == MessageTypeCancel {
			if err := s.handleCancelRequest(connState, &CancelRequest{StreamID: msg.StreamID}); err != nil {
				s.sendError(conn, msg.StreamID, err.Error(), connState)
			}
			continue
		}

		// Handle regular query request
		req := &QueryRequest{
			QueryID:      msg.QueryID,
			StreamID:     msg.StreamID,
			TemplateData: msg.TemplateData,
		}

		if err := s.queueQuery(ctx, connState, req); err != nil {
			s.sendError(conn, req.StreamID, err.Error(), connState)
		}
	}
}

// handleCancelRequest handles the cancellation of a running or queued query
func (s *Server) handleCancelRequest(connState *ConnectionState, req *CancelRequest) error {
	if req.StreamID == "" {
		return errors.New("streamId is required")
	}

	connState.TasksMutex.Lock()
	defer connState.TasksMutex.Unlock()

	task, exists := connState.ActiveTasks[req.StreamID]
	if !exists {
		return fmt.Errorf("stream %s not found", req.StreamID)
	}

	// Cancel the task and update its status
	task.CancelFunc()
	task.Status = "cancelled"
	delete(connState.ActiveTasks, req.StreamID)

	// Send cancellation status
	s.sendStatus(connState.Conn, req.StreamID, "cancelled", connState)

	return nil
}

// queueQuery adds a new query to the execution queue
func (s *Server) queueQuery(ctx context.Context, connState *ConnectionState, req *QueryRequest) error {
	if req.StreamID == "" || req.QueryID == "" {
		return errors.New("streamId and queryId are required")
	}

	ctx, cancel := context.WithCancel(ctx)
	task := &QueryTask{
		Request:    req,
		CancelFunc: cancel,
		Status:     "queued",
	}

	connState.TasksMutex.Lock()
	if _, exists := connState.ActiveTasks[req.StreamID]; exists {
		connState.TasksMutex.Unlock()
		return fmt.Errorf("stream %s already exists", req.StreamID)
	}
	connState.ActiveTasks[req.StreamID] = task
	connState.TasksMutex.Unlock()

	// Send status update
	s.sendStatus(connState.Conn, req.StreamID, "queued", connState)

	select {
	case connState.QueryQueue <- task:
		return nil
	default:
		connState.TasksMutex.Lock()
		delete(connState.ActiveTasks, req.StreamID)
		connState.TasksMutex.Unlock()
		cancel()
		return errors.New("query queue is full")
	}
}

// startQueueWorker processes queries from the queue
func (s *Server) startQueueWorker(ctx context.Context, connState *ConnectionState) {
	connState.TasksMutex.Lock()
	connState.QueueWorkers++
	connState.TasksMutex.Unlock()

	defer func() {
		connState.TasksMutex.Lock()
		connState.QueueWorkers--
		connState.TasksMutex.Unlock()
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case task := <-connState.QueryQueue:
			if task == nil {
				continue
			}

			task.Status = "running"
			task.ExecutedAt = time.Now()
			s.sendStatus(connState.Conn, task.Request.StreamID, "running", connState)

			err := s.executeQuery(ctx, task.Request.StreamID, connState, task)

			if err != nil {
				task.Status = "failed"
				s.sendError(connState.Conn, task.Request.StreamID, err.Error(), connState)
				s.sendStatus(connState.Conn, task.Request.StreamID, "failed", connState)
			} else {
				task.Status = "completed"
				s.sendStatus(connState.Conn, task.Request.StreamID, "completed", connState)
			}

			connState.TasksMutex.Lock()
			delete(connState.ActiveTasks, task.Request.StreamID)
			connState.TasksMutex.Unlock()
			task.CancelFunc()
		}
	}
}

// executeQuery processes a single query
func (s *Server) executeQuery(ctx context.Context, streamID string, connState *ConnectionState, task *QueryTask) error {
	stream, err := runner.ExecuteQuery(ctx, task.Request.QueryID, task.Request.TemplateData, s.supaClient)
	fmt.Println("Executing: ", streamID)
	if err != nil {
		return fmt.Errorf("execute query: %w", err)
	}
	defer stream.Close()

	var totalRows int64

	err = stream.Stream(func(cols []string, row []interface{}) error {
		if cols != nil {
			metadata := QueryMetadata{
				Columns:   cols,
				TotalRows: 0,
			}
			msg := WSMessage{
				Type:     MessageTypeMetadata,
				StreamID: streamID,
				Payload: map[string]interface{}{
					"metadata": metadata,
				},
			}
			if err := s.sendMessage(connState.Conn, msg, connState); err != nil {
				return err
			}
		} else if row != nil {
			totalRows++
			msg := WSMessage{
				Type:     MessageTypeRow,
				StreamID: streamID,
				Payload: map[string]interface{}{
					"data": row,
				},
			}
			if err := s.sendMessage(connState.Conn, msg, connState); err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		return err
	}

	completeMsg := WSMessage{
		Type:     MessageTypeComplete,
		StreamID: streamID,
		Payload: map[string]interface{}{
			"totalRows": totalRows,
		},
	}
	return s.sendMessage(connState.Conn, completeMsg, connState)
}

// cleanupConnection handles connection cleanup
func (s *Server) cleanupConnection(connState *ConnectionState) {
	connState.TasksMutex.Lock()
	defer connState.TasksMutex.Unlock()

	for _, task := range connState.ActiveTasks {
		task.CancelFunc()
	}

	close(connState.QueryQueue)
}

// writePingMessages sends periodic ping messages
func (s *Server) writePingMessages(conn *websocket.Conn, connState *ConnectionState) {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for range ticker.C {
		connState.WriteMutex.Lock()
		conn.SetWriteDeadline(time.Now().Add(writeWait))
		if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
			connState.WriteMutex.Unlock()
			return
		}
		connState.WriteMutex.Unlock()
	}
}

// sendMessage sends a message to the WebSocket connection
func (s *Server) sendMessage(conn *websocket.Conn, msg WSMessage, connState *ConnectionState) error {
	connState.WriteMutex.Lock()
	defer connState.WriteMutex.Unlock()

	conn.SetWriteDeadline(time.Now().Add(writeWait))
	return conn.WriteJSON(msg)
}

// sendError sends an error message to the client
func (s *Server) sendError(conn *websocket.Conn, streamID string, message string, connState *ConnectionState) {
	msg := WSMessage{
		Type:     MessageTypeError,
		StreamID: streamID,
		Payload: map[string]interface{}{
			"error": message,
		},
	}
	s.sendMessage(conn, msg, connState)
}

// sendStatus sends a status update message to the client
func (s *Server) sendStatus(conn *websocket.Conn, streamID string, status string, connState *ConnectionState) {
	msg := WSMessage{
		Type:     MessageTypeStatus,
		StreamID: streamID,
		Payload: map[string]interface{}{
			"status": status,
		},
	}
	s.sendMessage(conn, msg, connState)
}

// Start initializes and starts the server
func (s *Server) Start() error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/health", s.handleHealth)

	server := &http.Server{
		Addr:    ":" + s.config.Port,
		Handler: mux,
	}

	serverClosed := make(chan struct{})

	go func() {
		log.Printf("Server starting on port %s", s.config.Port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("HTTP server error: %v", err)
		}
		close(serverClosed)
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case <-stop:
		log.Println("Received shutdown signal")
	case <-ctx.Done():
		log.Println("Context cancelled")
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	s.activeConns.Range(func(key, value interface{}) bool {
		if connState, ok := value.(*ConnectionState); ok {
			s.cleanupConnection(connState)
		}
		return true
	})

	if err := server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("server shutdown: %w", err)
	}

	<-serverClosed
	return nil
}

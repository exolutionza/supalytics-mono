package main

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

	"github.com/BurntSushi/toml"
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

// Config holds the configuration details
type Config struct {
	SupabaseURL string `toml:"supabase_url"`
	SupabaseKey string `toml:"supabase_key"`
	Port        string `toml:"port" default:"8080"`
}

// QueryRequest represents the JSON structure sent by the client
type QueryRequest struct {
	QueryID      string                 `json:"queryId"`
	TemplateData map[string]interface{} `json:"templateData"`
}

// Server represents the WebSocket server
type Server struct {
	config     Config
	supaClient *supabase.Client
	upgrader   websocket.Upgrader
	// activeConns tracks all active connections for graceful shutdown
	activeConns sync.Map
}

// NewServer creates a new WebSocket server instance
func NewServer(cfg Config) (*Server, error) {
	client, err := supabase.NewClient(cfg.SupabaseURL, cfg.SupabaseKey, nil)
	if err != nil {
		return nil, fmt.Errorf("initialize Supabase client: %w", err)
	}

	return &Server{
		config:     cfg,
		supaClient: client,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true // Configure appropriately for production
			},
		},
	}, nil
}

// Start initializes and starts the server
func (s *Server) Start() error {
	// Create a context that we can cancel for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Set up HTTP server
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/health", s.handleHealth)

	server := &http.Server{
		Addr:    ":" + s.config.Port,
		Handler: mux,
	}

	// Channel to wait for server shutdown
	serverClosed := make(chan struct{})

	// Start server in goroutine
	go func() {
		log.Printf("Server starting on port %s", s.config.Port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("HTTP server error: %v", err)
		}
		close(serverClosed)
	}()

	// Handle graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case <-stop:
		log.Println("Received shutdown signal")
	case <-ctx.Done():
		log.Println("Context cancelled")
	}

	// Initiate graceful shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// Close all active WebSocket connections
	s.activeConns.Range(func(key, value interface{}) bool {
		if conn, ok := value.(*websocket.Conn); ok {
			conn.WriteControl(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseGoingAway, "server shutdown"),
				time.Now().Add(writeWait))
			conn.Close()
		}
		return true
	})

	// Shutdown HTTP server
	if err := server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("server shutdown: %w", err)
	}

	<-serverClosed
	return nil
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

	// Store connection in active connections map
	connID := fmt.Sprintf("%p", conn)
	s.activeConns.Store(connID, conn)
	defer func() {
		s.activeConns.Delete(connID)
		conn.Close()
	}()

	// Configure WebSocket connection
	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	// Start ping worker
	go s.writePingMessages(conn)

	// Handle incoming messages
	for {
		var req QueryRequest
		err := conn.ReadJSON(&req)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway,
				websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket read error: %v", err)
			}
			return
		}

		// Handle the query request
		if err := s.handleQueryRequest(r.Context(), conn, &req); err != nil {
			s.sendError(conn, err.Error())
			// Don't return here - allow connection to stay open for more requests
		}
	}
}

// handleQueryRequest processes a single query request
func (s *Server) handleQueryRequest(ctx context.Context, conn *websocket.Conn, req *QueryRequest) error {
	if req.QueryID == "" {
		return errors.New("queryId is required")
	}

	stream, err := runner.ExecuteQuery(ctx, req.QueryID, req.TemplateData, s.supaClient)
	if err != nil {
		return fmt.Errorf("execute query: %w", err)
	}
	defer stream.Close()

	return stream.Stream(func(columns []string, row []interface{}) error {
		message := make(map[string]interface{})
		if columns != nil {
			message["columns"] = columns
		} else {
			message["row"] = row
		}

		conn.SetWriteDeadline(time.Now().Add(writeWait))
		return conn.WriteJSON(message)
	})
}

// writePingMessages sends periodic ping messages to keep the connection alive
func (s *Server) writePingMessages(conn *websocket.Conn) {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for range ticker.C {
		conn.SetWriteDeadline(time.Now().Add(writeWait))
		if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
			return
		}
	}
}

// sendError sends an error message to the client
func (s *Server) sendError(conn *websocket.Conn, message string) {
	conn.SetWriteDeadline(time.Now().Add(writeWait))
	conn.WriteJSON(map[string]string{"error": message})
}

func main() {
	// Load configuration
	var cfg Config
	if _, err := toml.DecodeFile("config.toml", &cfg); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Create and start server
	server, err := NewServer(cfg)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	if err := server.Start(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

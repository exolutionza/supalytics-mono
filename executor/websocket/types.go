package websocket

import (
	"context"
	"sync"
	"time"

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
	maxMessageSize = 64 * 1024 * 1024 // 64MB

	// Number of rows to accumulate before sending a batch
	batchSize = 250
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

// Config represents the server configuration
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

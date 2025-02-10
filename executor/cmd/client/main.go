package main

import (
	"log"
	"time"

	"github.com/gorilla/websocket"
)

// MessageType represents different types of messages received from the server
type MessageType string

const (
	MessageTypeMetadata MessageType = "metadata"
	MessageTypeColumns  MessageType = "columns"
	MessageTypeRow      MessageType = "row"
	MessageTypeError    MessageType = "error"
	MessageTypeComplete MessageType = "complete"
)

// WSMessage represents the standardized message format
type WSMessage struct {
	Type    MessageType            `json:"type"`
	Payload map[string]interface{} `json:"payload,omitempty"`
}

// QueryRequest represents the JSON structure sent to the server
type QueryRequest struct {
	QueryID      string                 `json:"queryId"`
	TemplateData map[string]interface{} `json:"templateData"`
}

func main() {
	url := "ws://localhost:8080/ws"
	log.Printf("Connecting to %s", url)

	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		log.Fatalf("Dial error: %v", err)
	}
	defer conn.Close()

	// Prepare the query request
	req := QueryRequest{
		QueryID: "aec65753-66e0-473a-aabb-edcfc7a16421",
		TemplateData: map[string]interface{}{
			"Con": "connectors",
		},
	}

	// Send the query request
	if err := conn.WriteJSON(req); err != nil {
		log.Fatalf("Error sending query request: %v", err)
	}
	log.Printf("Sent query request: %+v", req)

	// Set read deadline
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))

	var totalRows int64
	var metadata map[string]interface{}

	// Read and process messages
	for {
		var msg WSMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Printf("Read error: %v", err)
			break
		}

		switch msg.Type {
		case MessageTypeMetadata:
			metadata = msg.Payload
			log.Printf("Received metadata: %v", metadata)

		case MessageTypeRow:
			if data, ok := msg.Payload["data"].([]interface{}); ok {
				log.Printf("Received row: %v", data)
			}

		case MessageTypeError:
			if errMsg, ok := msg.Payload["error"].(string); ok {
				log.Printf("Error received: %s", errMsg)
			}
			return

		case MessageTypeComplete:
			if total, ok := msg.Payload["totalRows"].(float64); ok {
				totalRows = int64(total)
				log.Printf("Query complete. Total rows: %d", totalRows)
			}
			return

		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}
}

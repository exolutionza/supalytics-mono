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
	MessageTypeStatus   MessageType = "status"
)

// WSMessage represents the standardized message format
type WSMessage struct {
	Type     MessageType            `json:"type"`
	StreamID string                 `json:"streamId"`
	Payload  map[string]interface{} `json:"payload,omitempty"`
}

// QueryRequest represents the JSON structure sent to the server
type QueryRequest struct {
	QueryID      string                 `json:"queryId"`
	StreamID     string                 `json:"streamId"`
	TemplateData map[string]interface{} `json:"templateData"`
}

func executeQuery(conn *websocket.Conn, queryID string, streamID string, templateData map[string]interface{}) {
	// Prepare the query request
	req := QueryRequest{
		QueryID:      queryID,
		StreamID:     streamID,
		TemplateData: templateData,
	}

	// Send the query request
	if err := conn.WriteJSON(req); err != nil {
		log.Printf("Error sending query request for stream %s: %v", streamID, err)
		return
	}
	log.Printf("Sent query request for stream %s: %+v", streamID, req)
}

func main() {
	url := "ws://localhost:8080/ws"
	log.Printf("Connecting to %s", url)

	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		log.Fatalf("Dial error: %v", err)
	}
	defer conn.Close()

	// Template data for our queries
	templateData1 := map[string]interface{}{
		"Con": "connectors",
	}
	// Template data for our queries
	templateData2 := map[string]interface{}{}
	// Execute first query
	executeQuery(conn, "aec65753-66e0-473a-aabb-edcfc7a16421", "stream1", templateData1)

	// Execute second query after a short delay
	// time.Sleep(2 * time.Second)
	executeQuery(conn, "df279904-9271-4e7c-87f5-76ff5ee23bb9", "stream2", templateData2)

	// Track completion of both streams
	completedStreams := make(map[string]bool)
	var totalRows int64

	// Set read deadline
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))

	// Read and process messages
	for {
		var msg WSMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Printf("Read error: %v", err)
			break
		}

		// Log the stream ID with each message
		streamLog := func(format string, args ...interface{}) {
			newArgs := make([]interface{}, len(args)+1)
			newArgs[0] = msg.StreamID
			copy(newArgs[1:], args)
			log.Printf("[Stream %s] "+format, newArgs...)
		}

		switch msg.Type {
		case MessageTypeMetadata:
			streamLog("Received metadata: %v", msg.Payload)

		case MessageTypeRow:
			if data, ok := msg.Payload["data"].([]interface{}); ok {
				streamLog("Received row: %v", data)
			}

		case MessageTypeError:
			if errMsg, ok := msg.Payload["error"].(string); ok {
				streamLog("Error received: %s", errMsg)
			}
			completedStreams[msg.StreamID] = true

		case MessageTypeComplete:
			if total, ok := msg.Payload["totalRows"].(float64); ok {
				rows := int64(total)
				totalRows += rows
				streamLog("Query complete. Stream rows: %d", rows)
			}
			completedStreams[msg.StreamID] = true

		case MessageTypeStatus:
			if status, ok := msg.Payload["status"].(string); ok {
				streamLog("Status update: %s", status)
			}

		default:
			streamLog("Unknown message type: %s", msg.Type)
		}

		// Check if both streams are complete
		if len(completedStreams) == 2 {
			log.Printf("All streams complete. Total rows across streams: %d", totalRows)
			return
		}
	}
}

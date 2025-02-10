package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

// QueryRequest represents the JSON structure sent to the server.
type QueryRequest struct {
	QueryID      string                 `json:"queryId"`
	TemplateData map[string]interface{} `json:"templateData"`
}

func main() {
	// Connect to the WebSocket endpoint.
	// Change the URL as needed for your deployment.
	url := "ws://localhost:8080/ws"
	log.Printf("Connecting to %s", url)
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		log.Fatalf("Dial error: %v", err)
	}
	defer conn.Close()

	// Prepare the query request with dynamic queryId and templateData.
	req := QueryRequest{
		QueryID: "aec65753-66e0-473a-aabb-edcfc7a16421",
		TemplateData: map[string]interface{}{
			"Con": "connectors",
		},
	}

	// Send the query request.
	if err := conn.WriteJSON(req); err != nil {
		log.Fatalf("Error sending query request: %v", err)
	}
	log.Printf("Sent query request: %+v", req)

	// Optionally, set a read deadline.
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))

	// Read and print messages until the connection is closed.
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Printf("Read error: %v", err)
			break
		}

		// Unmarshal message into a generic map so we can inspect it.
		var response map[string]interface{}
		if err := json.Unmarshal(message, &response); err != nil {
			log.Printf("JSON unmarshal error: %v", err)
			continue
		}
		fmt.Printf("Received: %v\n", response)
	}
}

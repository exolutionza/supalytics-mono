package main

import (
	"context"
	"fmt"
	"log"

	executor "supalytics-executor/runner"

	"github.com/BurntSushi/toml"
	"github.com/supabase-community/supabase-go"
)

// Config holds the configuration details from config.toml.
type Config struct {
	SupabaseURL string `toml:"supabase_url"`
	SupabaseKey string `toml:"supabase_key"`
	// Add any other configuration fields as needed.
}

func main() {
	// Load configuration from config.toml.
	var cfg Config
	if _, err := toml.DecodeFile("config.toml", &cfg); err != nil {
		log.Fatalf("Failed to load config.toml: %v", err)
	}

	// Create a Supabase client using the config values.
	client, err := supabase.NewClient(cfg.SupabaseURL, cfg.SupabaseKey, &supabase.ClientOptions{})
	if err != nil {
		log.Fatalf("Cannot initialize client: %v", err)
	}

	// Replace with your actual query ID from the queries table.
	queryID := "aec65753-66e0-473a-aabb-edcfc7a16421"

	// Define the template data to be used for templating the query content.
	templateData := map[string]interface{}{
		"Con": "connectors",
		// Add more key-value pairs as needed.
	}

	// Create a context.
	ctx := context.Background()

	// Call the ExecuteQuery function which returns a StreamResult.
	stream, err := executor.ExecuteQuery(ctx, queryID, templateData, client)
	if err != nil {
		log.Fatalf("Query execution failed: %v", err)
	}
	// Ensure that the stream is closed when we're done.
	defer stream.Close()

	// Process the streamed results.
	err = stream.Stream(func(columns []string, row []interface{}) error {
		// If columns are provided, print them (they may be sent once as a header).
		if columns != nil {
			fmt.Println("Columns:", columns)
		} else {
			// Otherwise, print each row as it comes.
			fmt.Println("Row:", row)
		}
		return nil
	})
	if err != nil {
		log.Fatalf("Streaming failed: %v", err)
	}
}

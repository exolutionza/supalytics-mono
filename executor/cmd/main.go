package main

import (
	"log"

	"supalytics-executor/websocket"

	"github.com/BurntSushi/toml"
)

func main() {
	var cfg websocket.Config
	if _, err := toml.DecodeFile("config.toml", &cfg); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Set defaults if not configured
	if cfg.MaxWorkers == 0 {
		cfg.MaxWorkers = 3
	}
	if cfg.QueueCapacity == 0 {
		cfg.QueueCapacity = 100
	}

	server, err := websocket.NewServer(cfg)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	if err := server.Start(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

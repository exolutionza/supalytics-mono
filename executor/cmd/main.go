package main

import (
	"context"
	"fmt"
	"log"
	connector "supalytics-executor/drivers"
	"supalytics-executor/drivers/postgres"
	"time"

	_ "github.com/lib/pq"
)

const (
	dbHost     = "aws-0-eu-central-1.pooler.supabase.com"
	dbPort     = 6543
	dbUser     = "postgres.djdqojnjcolkhiazvfve"
	dbPassword = "_9Z4qWDiCBRZ2fu"
	dbName     = "postgres"
)

func main() {
	// Create postgres config
	pgConfig := &postgres.Config{
		Host:            dbHost,
		Port:            dbPort,
		Database:        dbName,
		Username:        dbUser,
		Password:        dbPassword,
		MaxOpenConns:    10,
		MaxIdleConns:    5,
		ConnMaxLifetime: 5 * time.Minute,
	}

	// Convert to JSON
	configJSON, err := pgConfig.ToJSON()
	if err != nil {
		log.Fatalf("Failed to marshal config: %v", err)
	}

	// Create connector
	conn, err := connector.New(connector.PostgresType, configJSON)
	if err != nil {
		log.Fatalf("Failed to create connector: %v", err)
	}
	fmt.Println(conn)

	// Connect to database
	ctx := context.Background()
	if err := conn.Connect(ctx); err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()
	fmt.Println("connected")

	// Test query
	result, err := conn.Query(ctx, "SELECT version()")
	if err != nil {
		log.Fatalf("Query failed: %v", err)
	}
	fmt.Println(result)
	// Print results
	err = result.Stream(func(columns []string, row []interface{}) error {
		if columns != nil {
			fmt.Println("Columns:", columns)
			return nil
		}
		fmt.Println("Row:", row)
		return nil
	})
	if err != nil {
		log.Fatalf("Failed to stream results: %v", err)
	}

}

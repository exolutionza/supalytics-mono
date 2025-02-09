// runner/executor.go
package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"text/template"
	"time"

	// Import the shared driver package.
	"supalytics-executor/driver"

	// Import the driver implementations.
	"supalytics-executor/drivers/athena"
	"supalytics-executor/drivers/bigquery"
	"supalytics-executor/drivers/postgres"

	// Import the Supabase client package.
	"github.com/supabase-community/supabase-go"
)

// init registers all available driver factories explicitly.
func init() {
	driver.Register(driver.PostgresType, postgres.New)
	driver.Register(driver.BigQueryType, bigquery.New)
	driver.Register(driver.AthenaType, athena.New)
}

// Connector represents a row from the connectors table.
type Connector struct {
	ID                  string          `json:"id"`
	OrganizationID      string          `json:"organization_id"`
	Name                string          `json:"name"`
	Type                string          `json:"type"`
	Config              json.RawMessage `json:"config"`
	Status              string          `json:"status"`
	LastConnectionCheck time.Time       `json:"last_connection_check"`
	CreatedAt           time.Time       `json:"created_at"`
	UpdatedAt           time.Time       `json:"updated_at"`
}

// Query represents a row from the queries table.
type Query struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organization_id"`
	ConnectorID    string    `json:"connector_id"`
	Name           string    `json:"name"`
	Content        string    `json:"content"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// queryResultWrapper wraps *driver.QueryResult so that it implements driver.Result.
type queryResultWrapper struct {
	qr *driver.QueryResult
}

// Stream implements the driver.Result interface by delegating to the underlying QueryResult field.
func (q *queryResultWrapper) Stream(callback func(columns []string, row []interface{}) error) error {
	if q.qr.Stream == nil {
		return fmt.Errorf("stream function not implemented")
	}
	return q.qr.Stream(callback)
}

// StreamResult is a wrapper that exposes the underlying driver's
// streaming result and also allows the caller to close the connection.
type StreamResult struct {
	driver.Result
	drv driver.Driver
}

// Close calls the underlying driver's Close method.
func (sr *StreamResult) Close() error {
	return sr.drv.Close()
}

// ExecuteQuery fetches a query row by its ID, templates its content using the provided templateData,
// retrieves the corresponding connector, and then executes the templated query.
// The caller is responsible for closing the returned StreamResult.
func ExecuteQuery(ctx context.Context, queryID string, templateData interface{}, supaClient *supabase.Client) (*StreamResult, error) {
	// Step 1: Retrieve the query from the "queries" table.
	var queries []Query
	queryResp, _, err := supaClient.
		From("queries").
		Select("*", "exact", false).
		Eq("id", queryID).
		Execute()
	if err != nil {
		return nil, fmt.Errorf("failed to query queries table: %w", err)
	}
	if err := json.Unmarshal(queryResp, &queries); err != nil {
		return nil, fmt.Errorf("failed to unmarshal query response: %w", err)
	}
	if len(queries) == 0 {
		return nil, errors.New("query not found")
	}
	qr := queries[0]

	// Step 2: Use text/template to process the query content with the provided templateData.
	tmpl, err := template.New("queryTemplate").Parse(qr.Content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse query template: %w", err)
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, templateData); err != nil {
		return nil, fmt.Errorf("failed to execute query template: %w", err)
	}
	finalQuery := buf.String()

	// Step 3: Retrieve the connector using the connector_id from the query row.
	var connectors []Connector
	connectorResp, _, err := supaClient.
		From("connectors").
		Select("*", "exact", false).
		Eq("id", qr.ConnectorID).
		Execute()
	if err != nil {
		return nil, fmt.Errorf("failed to query connector: %w", err)
	}
	if err := json.Unmarshal(connectorResp, &connectors); err != nil {
		return nil, fmt.Errorf("failed to unmarshal connectors response: %w", err)
	}
	if len(connectors) == 0 {
		return nil, errors.New("connector not found")
	}
	connector := connectors[0]

	// Step 4: Choose the appropriate driver based on the connector type.
	var drv driver.Driver
	switch driver.DriverType(connector.Type) {
	case driver.PostgresType:
		// Unmarshal connector config into Postgres config.
		var pgConfig postgres.Config
		if err := json.Unmarshal(connector.Config, &pgConfig); err != nil {
			return nil, fmt.Errorf("failed to unmarshal postgres config: %w", err)
		}
		configJSON, err := pgConfig.ToJSON()
		if err != nil {
			return nil, fmt.Errorf("failed to marshal postgres config: %w", err)
		}
		drv, err = driver.New(driver.PostgresType, configJSON)
		if err != nil {
			return nil, fmt.Errorf("failed to create postgres driver: %w", err)
		}

	case driver.BigQueryType:
		// Unmarshal connector config into BigQuery config.
		bqConfig, err := bigquery.FromJSON(connector.Config)
		if err != nil {
			return nil, fmt.Errorf("failed to unmarshal bigquery config: %w", err)
		}
		configJSON, err := bqConfig.ToJSON()
		if err != nil {
			return nil, fmt.Errorf("failed to marshal bigquery config: %w", err)
		}
		drv, err = driver.New(driver.BigQueryType, configJSON)
		if err != nil {
			return nil, fmt.Errorf("failed to create bigquery driver: %w", err)
		}

	case driver.AthenaType:
		// Unmarshal connector config into Athena config.
		athenaConfig, err := athena.FromJSON(connector.Config)
		if err != nil {
			return nil, fmt.Errorf("failed to unmarshal athena config: %w", err)
		}
		configJSON, err := athenaConfig.ToJSON()
		if err != nil {
			return nil, fmt.Errorf("failed to marshal athena config: %w", err)
		}
		drv, err = driver.New(driver.AthenaType, configJSON)
		if err != nil {
			return nil, fmt.Errorf("failed to create athena driver: %w", err)
		}

	default:
		return nil, fmt.Errorf("unsupported connector type: %s", connector.Type)
	}

	// Step 5: Connect to the underlying data source.
	if err := drv.Connect(ctx); err != nil {
		return nil, fmt.Errorf("failed to connect using driver: %w", err)
	}
	// Do not defer drv.Close() here because the connection needs to remain open until the caller is done processing the stream.

	// Step 6: Execute the templated query.
	result, err := drv.Query(ctx, finalQuery)
	if err != nil {
		drv.Close()
		return nil, fmt.Errorf("query execution failed: %w", err)
	}

	// Wrap the QueryResult in our queryResultWrapper to satisfy the driver.Result interface.
	wrappedResult := &queryResultWrapper{qr: result}

	// Wrap and return the stream. The caller is responsible for calling Close().
	return &StreamResult{
		Result: wrappedResult,
		drv:    drv,
	}, nil
}

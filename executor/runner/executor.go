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

	"supalytics-executor/driver"
	"supalytics-executor/drivers/athena"
	"supalytics-executor/drivers/bigquery"
	"supalytics-executor/drivers/postgres"

	"github.com/supabase-community/supabase-go"
)

// Common errors
var (
	ErrQueryNotFound     = errors.New("query not found")
	ErrConnectorNotFound = errors.New("connector not found")
	ErrUnsupportedType   = errors.New("unsupported connector type")
)

// init registers all available driver factories
func init() {
	driver.Register(driver.PostgresType, postgres.New)
	driver.Register(driver.BigQueryType, bigquery.New)
	driver.Register(driver.AthenaType, athena.New)
}

// Connector represents a database connection configuration
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

// Query represents a database query configuration
type Query struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organization_id"`
	ConnectorID    string    `json:"connector_id"`
	Name           string    `json:"name"`
	Content        string    `json:"content"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// StreamResult wraps a query result and its associated driver
type StreamResult struct {
	driver.Result
	drv driver.Driver
}

// Close closes the underlying driver connection
func (sr *StreamResult) Close() error {
	if sr.drv != nil {
		return sr.drv.Close()
	}
	return nil
}

// queryResultWrapper adapts driver.QueryResult to driver.Result
type queryResultWrapper struct {
	qr *driver.QueryResult
}

func (q *queryResultWrapper) Stream(callback func(columns []string, row []interface{}) error) error {
	if q.qr == nil || q.qr.Stream == nil {
		return errors.New("stream function not implemented")
	}
	return q.qr.Stream(callback)
}

// ExecuteQuery processes and runs a query, returning a streaming result
func ExecuteQuery(ctx context.Context, queryID string, templateData interface{}, supaClient *supabase.Client) (*StreamResult, error) {
	query, err := fetchQuery(ctx, queryID, supaClient)
	if err != nil {
		return nil, fmt.Errorf("fetch query: %w", err)
	}

	finalQuery, err := renderTemplate(query.Content, templateData)
	if err != nil {
		return nil, fmt.Errorf("render template: %w", err)
	}

	connector, err := fetchConnector(ctx, query.ConnectorID, supaClient)
	if err != nil {
		return nil, fmt.Errorf("fetch connector: %w", err)
	}

	drv, err := createDriver(connector)
	if err != nil {
		return nil, fmt.Errorf("create driver: %w", err)
	}

	// Connect and execute query
	if err := drv.Connect(ctx); err != nil {
		drv.Close()
		return nil, fmt.Errorf("connect: %w", err)
	}

	result, err := drv.Query(ctx, finalQuery)
	if err != nil {
		drv.Close()
		return nil, fmt.Errorf("execute query: %w", err)
	}

	return &StreamResult{
		Result: &queryResultWrapper{qr: result},
		drv:    drv,
	}, nil
}

// fetchQuery retrieves a query by ID from Supabase
func fetchQuery(ctx context.Context, queryID string, client *supabase.Client) (*Query, error) {
	var queries []Query
	resp, _, err := client.From("queries").Select("*", "exact", false).Eq("id", queryID).Execute()
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(resp, &queries); err != nil {
		return nil, err
	}

	if len(queries) == 0 {
		return nil, ErrQueryNotFound
	}

	return &queries[0], nil
}

// fetchConnector retrieves a connector by ID from Supabase
func fetchConnector(ctx context.Context, connectorID string, client *supabase.Client) (*Connector, error) {
	var connectors []Connector
	resp, _, err := client.From("connectors").Select("*", "exact", false).Eq("id", connectorID).Execute()
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(resp, &connectors); err != nil {
		return nil, err
	}

	if len(connectors) == 0 {
		return nil, ErrConnectorNotFound
	}

	return &connectors[0], nil
}

// renderTemplate processes the query template with provided data
func renderTemplate(queryContent string, data interface{}) (string, error) {
	tmpl, err := template.New("queryTemplate").Parse(queryContent)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}

	return buf.String(), nil
}

// createDriver instantiates the appropriate database driver based on connector type
func createDriver(connector *Connector) (driver.Driver, error) {
	switch driver.DriverType(connector.Type) {
	case driver.PostgresType:
		return createPostgresDriver(connector.Config)
	case driver.BigQueryType:
		return createBigQueryDriver(connector.Config)
	case driver.AthenaType:
		return createAthenaDriver(connector.Config)
	default:
		return nil, fmt.Errorf("%w: %s", ErrUnsupportedType, connector.Type)
	}
}

func createPostgresDriver(config json.RawMessage) (driver.Driver, error) {
	var pgConfig postgres.Config
	if err := json.Unmarshal(config, &pgConfig); err != nil {
		return nil, err
	}

	configJSON, err := pgConfig.ToJSON()
	if err != nil {
		return nil, err
	}

	return driver.New(driver.PostgresType, configJSON)
}

func createBigQueryDriver(config json.RawMessage) (driver.Driver, error) {
	bqConfig, err := bigquery.FromJSON(config)
	if err != nil {
		return nil, err
	}

	configJSON, err := bqConfig.ToJSON()
	if err != nil {
		return nil, err
	}

	return driver.New(driver.BigQueryType, configJSON)
}

func createAthenaDriver(config json.RawMessage) (driver.Driver, error) {
	athenaConfig, err := athena.FromJSON(config)
	if err != nil {
		return nil, err
	}

	configJSON, err := athenaConfig.ToJSON()
	if err != nil {
		return nil, err
	}

	return driver.New(driver.AthenaType, configJSON)
}

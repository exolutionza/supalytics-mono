// connector.go
package connector

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"time"
)

type ConnectorType string

const (
	PostgresType  ConnectorType = "postgres"
	MySQLType     ConnectorType = "mysql"
	SQLiteType    ConnectorType = "sqlite3"
	SQLServerType ConnectorType = "sqlserver"
	OracleType    ConnectorType = "oracle"
	BigQueryType  ConnectorType = "bigquery"
	AthenaType    ConnectorType = "athena"
	ODBCType      ConnectorType = "odbc"
)

// RowStream is a function that yields rows one at a time
type RowStream func(yield func(columns []string, row []interface{}) error) error

// QueryResult represents the result of a query
type QueryResult struct {
	Stream  RowStream `json:"-"`       // Streaming interface for results
	Columns []string  `json:"columns"` // Column names (optional, may be set by Stream)
	Error   string    `json:"error,omitempty"`
}

// Connector interface defines methods all connectors must implement
type Connector interface {
	Connect(ctx context.Context) error
	Query(ctx context.Context, query string, args ...interface{}) (*QueryResult, error)
	Close() error
}

// Factory function type for creating new connectors
type ConnectorFactory func(config json.RawMessage) (Connector, error)

// Registry to store connector factories
var connectorRegistry = make(map[ConnectorType]ConnectorFactory)

// Register adds a new connector factory to the registry
func Register(connType ConnectorType, factory ConnectorFactory) {
	connectorRegistry[connType] = factory
}

// New creates a new connector instance based on the configuration
func New(connType ConnectorType, config json.RawMessage) (Connector, error) {
	factory, ok := connectorRegistry[connType]
	if !ok {
		return nil, fmt.Errorf("unsupported connector type: %s", connType)
	}
	return factory(config)
}

// BaseConnector implements common functionality for all connectors
type BaseConnector struct {
	DB *sql.DB
}

// ExecuteQuery executes a query and returns results in a streaming format
func (b *BaseConnector) ExecuteQuery(ctx context.Context, query string, args ...interface{}) (*QueryResult, error) {
	rows, err := b.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return &QueryResult{Error: err.Error()}, err
	}

	// Get columns
	columns, err := rows.Columns()
	if err != nil {
		rows.Close()
		return &QueryResult{Error: fmt.Sprintf("failed to get columns: %v", err)}, err
	}

	return &QueryResult{
		Columns: columns,
		Stream: func(yield func(columns []string, row []interface{}) error) error {
			defer rows.Close()

			// Stream rows
			values := make([]interface{}, len(columns))
			scanArgs := make([]interface{}, len(columns))
			for i := range values {
				scanArgs[i] = &values[i]
			}

			for rows.Next() {
				err := rows.Scan(scanArgs...)
				if err != nil {
					return fmt.Errorf("failed to scan row: %w", err)
				}

				row := make([]interface{}, len(columns))
				for i, v := range values {
					row[i] = convertValue(v)
				}

				if err := yield(nil, row); err != nil {
					if err == io.EOF {
						return nil
					}
					return err
				}
			}

			if err = rows.Err(); err != nil {
				return fmt.Errorf("error during row iteration: %w", err)
			}

			return nil
		},
	}, nil
}

// Close closes the database connection
func (b *BaseConnector) Close() error {
	if b.DB != nil {
		return b.DB.Close()
	}
	return nil
}

// convertValue handles conversion of sql.RawBytes and other types to appropriate Go types
func convertValue(v interface{}) interface{} {
	switch v := v.(type) {
	case []byte:
		return string(v)
	case time.Time:
		return v.Format(time.RFC3339)
	case nil:
		return nil
	default:
		return v
	}
}

// StreamToSlice is a helper function to collect all rows from a stream into memory
func StreamToSlice(stream RowStream) ([]string, [][]interface{}, error) {
	var columns []string
	var rows [][]interface{}

	err := stream(func(cols []string, row []interface{}) error {
		if cols != nil {
			columns = cols
			return nil
		}
		rows = append(rows, row)
		return nil
	})

	return columns, rows, err
}

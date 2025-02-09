// driver/driver.go
package driver

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"time"
)

// DriverType represents a driver type.
type DriverType string

const (
	PostgresType  DriverType = "postgres"
	MySQLType     DriverType = "mysql"
	SQLiteType    DriverType = "sqlite3"
	SQLServerType DriverType = "sqlserver"
	OracleType    DriverType = "oracle"
	BigQueryType  DriverType = "bigquery"
	AthenaType    DriverType = "athena"
	ODBCType      DriverType = "odbc"
)

// RowStream is a function type that yields rows one at a time.
type RowStream func(yield func(columns []string, row []interface{}) error) error

// QueryResult represents the result of a query.
type QueryResult struct {
	Stream  RowStream `json:"-"`       // Streaming interface for results
	Columns []string  `json:"columns"` // Column names (optional, may be set by Stream)
	Error   string    `json:"error,omitempty"`
}

// Driver defines methods all drivers must implement.
type Driver interface {
	Connect(ctx context.Context) error
	Query(ctx context.Context, query string, args ...interface{}) (*QueryResult, error)
	Close() error
}

type Result interface {
	// Stream iterates over the result set.
	// The provided callback function is invoked with the column names (if available)
	// and a row of data. The callback should return an error if row processing fails.
	Stream(func(columns []string, row []interface{}) error) error
}

// DriverFactory is a function type for creating new drivers.
type DriverFactory func(config json.RawMessage) (Driver, error)

// driverRegistry holds the driver factories.
var driverRegistry = make(map[DriverType]DriverFactory)

// Register registers a new driver factory in the registry.
func Register(typ DriverType, factory DriverFactory) {
	driverRegistry[typ] = factory
}

// New creates a new driver instance based on the driver type and configuration.
func New(typ DriverType, config json.RawMessage) (Driver, error) {
	factory, ok := driverRegistry[typ]
	if !ok {
		return nil, fmt.Errorf("unsupported driver type: %s", typ)
	}
	return factory(config)
}

// BaseDriver implements common functionality for all drivers.
type BaseDriver struct {
	DB *sql.DB
}

// ExecuteQuery executes a query and returns results in a streaming format.
func (b *BaseDriver) ExecuteQuery(ctx context.Context, query string, args ...interface{}) (*QueryResult, error) {
	rows, err := b.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return &QueryResult{Error: err.Error()}, err
	}

	// Get columns.
	columns, err := rows.Columns()
	if err != nil {
		rows.Close()
		return &QueryResult{Error: fmt.Sprintf("failed to get columns: %v", err)}, err
	}

	return &QueryResult{
		Columns: columns,
		Stream: func(yield func(columns []string, row []interface{}) error) error {
			defer rows.Close()

			// Prepare slices for scanning.
			values := make([]interface{}, len(columns))
			scanArgs := make([]interface{}, len(columns))
			for i := range values {
				scanArgs[i] = &values[i]
			}

			// Iterate over rows.
			for rows.Next() {
				err := rows.Scan(scanArgs...)
				if err != nil {
					return fmt.Errorf("failed to scan row: %w", err)
				}

				// Convert scanned values.
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

// Close closes the database connection.
func (b *BaseDriver) Close() error {
	if b.DB != nil {
		return b.DB.Close()
	}
	return nil
}

// convertValue converts values to appropriate Go types.
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

// StreamToSlice is a helper to collect all rows from a stream into memory.
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

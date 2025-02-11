package postgres

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	driver "supalytics-executor/driver"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type Driver struct {
	driver.BaseDriver
	config *Config
	conn   *pgx.Conn
}

func init() {
	driver.Register(driver.PostgresType, New)
}

func New(config json.RawMessage) (driver.Driver, error) {
	cfg, err := FromJSON(config)
	if err != nil {
		return nil, err
	}

	return &Driver{config: cfg}, nil
}

func (d *Driver) buildConfig() (*pgx.ConnConfig, error) {
	// Build connection string and parse config
	connString := d.config.BuildDSN()
	config, err := pgx.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("failed to parse connection string: %w", err)
	}

	// Set reasonable timeout values
	config.ConnectTimeout = 10 * time.Second

	// ->  ERROR: prepared statement "..." already exists (SQLSTATE 42P05)
	// https://github.com/jackc/pgx/issues/1847#issuecomment-2211786103
	config.DefaultQueryExecMode = pgx.QueryExecModeCacheDescribe

	// Initialize RuntimeParams if nil
	if config.RuntimeParams == nil {
		config.RuntimeParams = make(map[string]string)
	}

	// Set timeouts
	config.RuntimeParams["statement_timeout"] = "30000"
	config.RuntimeParams["lock_timeout"] = "10000"

	// If no SSL cert is provided, disable SSL/TLS
	if d.config.SSLRootCert == "" {
		config.TLSConfig = nil
		config.RuntimeParams["sslmode"] = "disable"
		return config, nil
	}

	// Configure TLS if certificates are provided
	rootCertPool := x509.NewCertPool()
	if ok := rootCertPool.AppendCertsFromPEM([]byte(d.config.SSLRootCert)); !ok {
		return nil, fmt.Errorf("failed to append CA certificate")
	}

	tlsConfig := &tls.Config{
		RootCAs:    rootCertPool,
		MinVersion: tls.VersionTLS12,
	}

	if d.config.SSLCert != "" && d.config.SSLKey != "" {
		clientCert, err := tls.X509KeyPair(
			[]byte(d.config.SSLCert),
			[]byte(d.config.SSLKey),
		)
		if err != nil {
			return nil, fmt.Errorf("failed to load client certificate: %w", err)
		}
		tlsConfig.Certificates = []tls.Certificate{clientCert}
	}

	config.TLSConfig = tlsConfig
	return config, nil
}

func (d *Driver) Connect(ctx context.Context) error {
	// Create a timeout context
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	config, err := d.buildConfig()
	if err != nil {
		return fmt.Errorf("failed to build config: %w", err)
	}

	// Create single connection with timeout context
	conn, err := pgx.ConnectConfig(ctx, config)
	if err != nil {
		return fmt.Errorf("failed to create connection: %w", err)
	}

	// Test the connection with timeout
	if err := conn.Ping(ctx); err != nil {
		conn.Close(ctx)
		return fmt.Errorf("failed to ping postgres: %w", err)
	}

	d.conn = conn
	return nil
}

func (d *Driver) Query(ctx context.Context, query string, args ...interface{}) (*driver.QueryResult, error) {
	// Execute query
	rows, err := d.conn.Query(ctx, query, args...)
	if err != nil {
		// Instead of returning a QueryResult with an error message and nil Stream,
		// return a proper error.
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}

	return &driver.QueryResult{
		// Set the Stream field to a function that yields the header once and then the rows.
		Stream: d.streamResults(ctx, rows),
	}, nil
}

// streamResults returns a RowStream that first yields the header (columns)
// once (with a nil row) and then yields each row with nil columns.
// streamResults streams rows from pgx, converts each value using our helper, and yields the rows.
func (d *Driver) streamResults(ctx context.Context, rows pgx.Rows) driver.RowStream {
	// Obtain the type map from the pgx connection.
	tm := rows.Conn().TypeMap()

	return func(yield func(columns []string, row []interface{}) error) error {
		defer rows.Close()

		// Get the field descriptions.
		fields := rows.FieldDescriptions()

		// Build header using field names (names are []byte, so convert to string).
		header := make([]string, len(fields))
		for i, fd := range fields {
			header[i] = string(fd.Name)
		}

		// Yield header.
		if err := yield(header, nil); err != nil {
			return err
		}

		// Process each row.
		for rows.Next() {
			values, err := rows.Values()
			if err != nil {
				return fmt.Errorf("failed to read row: %w", err)
			}

			// Convert row values using our helper.
			converted, err := ConvertRowValues(fields, values, tm)
			if err != nil {
				return err
			}

			// Yield the converted row.
			if err := yield(nil, converted); err != nil {
				return err
			}
		}

		if err := rows.Err(); err != nil {
			return fmt.Errorf("error reading rows: %w", err)
		}

		return nil
	}
}

func (d *Driver) Close() error {
	if d.conn != nil {
		return d.conn.Close(context.Background())
	}
	return nil
}

// isRetryableError checks if the error is retryable.
func isRetryableError(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "40001", // serialization_failure
			"40P01", // deadlock_detected
			"55P03", // lock_not_available
			"57P01", // admin_shutdown
			"57P02", // crash_shutdown
			"57P03": // cannot_connect_now
			return true
		}
	}
	return false
}

func (d *Driver) Execute(ctx context.Context, query string, args ...interface{}) error {
	_, err := d.conn.Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("failed to execute query: %w", err)
	}
	return nil
}

func (d *Driver) Ping(ctx context.Context) error {
	return d.conn.Ping(ctx)
}

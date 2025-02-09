// bigquery/driver.go
package bigquery

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	driver "supalytics-executor/driver"

	"time"

	"cloud.google.com/go/bigquery"
	"cloud.google.com/go/civil"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
)

type Driver struct {
	driver.BaseDriver
	client  *bigquery.Client
	config  *Config
	dataset *bigquery.Dataset
}

func init() {
	driver.Register(driver.BigQueryType, New)
}

func New(config json.RawMessage) (driver.Driver, error) {
	cfg, err := FromJSON(config)
	if err != nil {
		return nil, err
	}
	return &Driver{config: cfg}, nil
}

func (d *Driver) Connect(ctx context.Context) error {
	var opts []option.ClientOption

	if d.config.Credentials != "" {
		opts = append(opts, option.WithCredentialsJSON([]byte(d.config.Credentials)))
	} else if d.config.KeyFile != "" {
		opts = append(opts, option.WithCredentialsFile(d.config.KeyFile))
	}

	if d.config.Location != "" {
		opts = append(opts, option.WithEndpoint(fmt.Sprintf("https://bigquery.%s.googleapis.com", strings.ToLower(d.config.Location))))
	}

	client, err := bigquery.NewClient(ctx, d.config.ProjectID, opts...)
	if err != nil {
		return fmt.Errorf("failed to create bigquery client: %w", err)
	}

	d.client = client
	d.dataset = client.Dataset(d.config.Dataset)
	return nil
}

func (d *Driver) Query(ctx context.Context, query string, args ...interface{}) (*driver.QueryResult, error) {
	query = replaceQueryPlaceholders(query, args...)

	q := d.client.Query(query)
	if d.config.MaxBillingTier > 0 {
		q.MaxBillingTier = d.config.MaxBillingTier
	}

	// Run the query
	job, err := q.Run(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to run query: %w", err)
	}

	status, err := job.Wait(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for job: %w", err)
	}

	if err := status.Err(); err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}

	return &driver.QueryResult{
		Stream: d.streamResults(ctx, job),
	}, nil
}

func (d *Driver) streamResults(ctx context.Context, job *bigquery.Job) driver.RowStream {
	return func(yield func(columns []string, row []interface{}) error) error {
		it, err := job.Read(ctx)
		if err != nil {
			return fmt.Errorf("failed to read results: %w", err)
		}

		// Get and yield schema first
		schema := it.Schema
		columns := make([]string, len(schema))
		for i, field := range schema {
			columns[i] = field.Name
		}

		// Stream rows
		for {
			var values []bigquery.Value
			err := it.Next(&values)
			if err == iterator.Done {
				break
			}
			if err != nil {
				return fmt.Errorf("failed to read row: %w", err)
			}

			row := make([]interface{}, len(values))
			for i, v := range values {
				row[i] = convertBigQueryValue(v)
			}

			if err := yield(columns, row); err != nil {
				if err == io.EOF {
					return nil
				}
				return err
			}
		}

		return nil
	}
}

func (d *Driver) Close() error {
	if d.client != nil {
		return d.client.Close()
	}
	return nil
}

// replaceQueryPlaceholders replaces ? with actual values
func replaceQueryPlaceholders(query string, args ...interface{}) string {
	for _, arg := range args {
		switch v := arg.(type) {
		case string:
			query = strings.Replace(query, "?", fmt.Sprintf("'%s'", v), 1)
		default:
			query = strings.Replace(query, "?", fmt.Sprint(v), 1)
		}
	}
	return query
}

// convertBigQueryValue converts BigQuery values to standard Go types
// convertBigQueryValue converts BigQuery values to standard Go types
func convertBigQueryValue(v bigquery.Value) interface{} {
	switch v := v.(type) {
	case time.Time:
		return v
	case civil.Date:
		return v
	case civil.Time:
		return v.String()
	case nil:
		return nil
	default:
		return v
	}
}

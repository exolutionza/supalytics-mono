// athena/driver.go
package athena

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"supalytics-executor/driver"

	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/athena"
	"github.com/aws/aws-sdk-go-v2/service/athena/types"
)

type Driver struct {
	driver.BaseDriver
	client *athena.Client
	config *Config
}

func init() {
	driver.Register(driver.AthenaType, New)
}

func New(config json.RawMessage) (driver.Driver, error) {
	cfg, err := FromJSON(config)
	if err != nil {
		return nil, err
	}
	return &Driver{config: cfg}, nil
}

func (d *Driver) Connect(ctx context.Context) error {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return fmt.Errorf("failed to load AWS config: %w", err)
	}

	cfg.Region = d.config.Region

	if d.config.AccessKeyID != "" && d.config.SecretAccessKey != "" {
		cfg.Credentials = credentials.NewStaticCredentialsProvider(
			d.config.AccessKeyID,
			d.config.SecretAccessKey,
			d.config.SessionToken,
		)
	}

	d.client = athena.NewFromConfig(cfg)
	return nil
}

func (d *Driver) Query(ctx context.Context, query string, args ...interface{}) (*driver.QueryResult, error) {
	// Start query execution
	startInput := &athena.StartQueryExecutionInput{
		QueryString: &query,
		QueryExecutionContext: &types.QueryExecutionContext{
			Database: &d.config.Database,
			Catalog:  &d.config.Catalog,
		},
		ResultConfiguration: &types.ResultConfiguration{
			OutputLocation: &d.config.OutputLocation,
		},
		WorkGroup: &d.config.WorkGroup,
	}

	startOutput, err := d.client.StartQueryExecution(ctx, startInput)
	if err != nil {
		return nil, fmt.Errorf("failed to start query: %w", err)
	}

	queryID := startOutput.QueryExecutionId

	// Wait for query completion
	for {
		statusOutput, err := d.client.GetQueryExecution(ctx, &athena.GetQueryExecutionInput{
			QueryExecutionId: queryID,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to get query status: %w", err)
		}

		state := statusOutput.QueryExecution.Status.State
		if state == types.QueryExecutionStateFailed ||
			state == types.QueryExecutionStateCancelled {
			return nil, fmt.Errorf("query failed: %s", *statusOutput.QueryExecution.Status.StateChangeReason)
		}

		if state == types.QueryExecutionStateSucceeded {
			break
		}

		time.Sleep(time.Second)
	}

	return &driver.QueryResult{
		Stream: d.streamResults(ctx, queryID),
	}, nil
}

func (d *Driver) streamResults(ctx context.Context, queryID *string) driver.RowStream {
	return func(yield func(columns []string, row []interface{}) error) error {
		var columnInfo []types.ColumnInfo
		var nextToken *string
		firstPage := true

		for {
			input := &athena.GetQueryResultsInput{
				QueryExecutionId: queryID,
				NextToken:        nextToken,
			}

			output, err := d.client.GetQueryResults(ctx, input)
			if err != nil {
				return fmt.Errorf("failed to get query results: %w", err)
			}

			// Get column info from first page
			if firstPage {
				columnInfo = output.ResultSet.ResultSetMetadata.ColumnInfo
				columns := make([]string, len(columnInfo))
				for i, col := range columnInfo {
					columns[i] = *col.Name
				}
				firstPage = false

				// Skip header row in first page
				output.ResultSet.Rows = output.ResultSet.Rows[1:]
			}

			// Stream rows
			for _, row := range output.ResultSet.Rows {
				rowData := make([]interface{}, len(row.Data))
				for i, data := range row.Data {
					rowData[i] = convertAthenaValue(data.VarCharValue, columnInfo[i].Type)
				}

				if err := yield(nil, rowData); err != nil {
					if err == io.EOF {
						return nil
					}
					return err
				}
			}

			nextToken = output.NextToken
			if nextToken == nil {
				break
			}
		}

		return nil
	}
}

func (d *Driver) Close() error {
	// No connection to close for Athena
	return nil
}

// convertAthenaValue converts Athena string values to appropriate Go types
func convertAthenaValue(value *string, dataType *string) interface{} {
	if value == nil || dataType == nil {
		return nil
	}

	switch *dataType {
	case "bigint", "integer":
		var num int64
		fmt.Sscanf(*value, "%d", &num)
		return num
	case "double", "float":
		var num float64
		fmt.Sscanf(*value, "%f", &num)
		return num
	case "boolean":
		return *value == "true"
	case "timestamp":
		t, _ := time.Parse(time.RFC3339Nano, *value)
		return t
	default:
		return *value
	}
}

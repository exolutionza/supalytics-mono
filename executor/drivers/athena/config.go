// athena/config.go
package athena

import (
	"encoding/json"
	"fmt"
)

// Config holds Athena-specific configuration
type Config struct {
	Region          string `json:"region"`
	Database        string `json:"database"`
	OutputLocation  string `json:"output_location"` // S3 bucket for query results
	AccessKeyID     string `json:"access_key_id,omitempty"`
	SecretAccessKey string `json:"secret_access_key,omitempty"`
	SessionToken    string `json:"session_token,omitempty"`
	WorkGroup       string `json:"workgroup,omitempty"`
	Catalog         string `json:"catalog,omitempty"` // Default: AwsDataCatalog
}

// FromJSON creates a Config from JSON data
func FromJSON(data json.RawMessage) (*Config, error) {
	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse athena config: %w", err)
	}

	// Validate required fields
	if config.Region == "" {
		return nil, fmt.Errorf("region is required")
	}
	if config.Database == "" {
		return nil, fmt.Errorf("database is required")
	}
	if config.OutputLocation == "" {
		return nil, fmt.Errorf("output_location is required")
	}

	// Set defaults
	if config.Catalog == "" {
		config.Catalog = "AwsDataCatalog"
	}
	if config.WorkGroup == "" {
		config.WorkGroup = "primary"
	}

	return &config, nil
}

// ToJSON converts Config to JSON
func (c *Config) ToJSON() (json.RawMessage, error) {
	data, err := json.Marshal(c)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal athena config: %w", err)
	}
	return data, nil
}

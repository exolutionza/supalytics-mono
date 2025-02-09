// bigquery/config.go
package bigquery

import (
	"encoding/json"
	"fmt"
)

// Config holds BigQuery-specific configuration
type Config struct {
	ProjectID      string `json:"project_id"`
	Dataset        string `json:"dataset"`
	Credentials    string `json:"credentials,omitempty"` // JSON credentials content
	KeyFile        string `json:"key_file,omitempty"`    // Path to credentials file
	Location       string `json:"location,omitempty"`    // e.g., "US", "EU"
	MaxBillingTier int    `json:"max_billing_tier,omitempty"`
}

// FromJSON creates a Config from JSON data
func FromJSON(data json.RawMessage) (*Config, error) {
	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse bigquery config: %w", err)
	}

	// Validate required fields
	if config.ProjectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}
	if config.Dataset == "" {
		return nil, fmt.Errorf("dataset is required")
	}
	if config.Credentials == "" && config.KeyFile == "" {
		return nil, fmt.Errorf("either credentials or key_file must be provided")
	}

	return &config, nil
}

// ToJSON converts Config to JSON
func (c *Config) ToJSON() (json.RawMessage, error) {
	data, err := json.Marshal(c)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal bigquery config: %w", err)
	}
	return data, nil
}

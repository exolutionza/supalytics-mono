// postgres/config.go
package postgres

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Config holds PostgreSQL-specific configuration
type Config struct {
	Host            string        `json:"host"`
	Port            int           `json:"port"`
	Database        string        `json:"database"`
	Username        string        `json:"username"`
	Password        string        `json:"password"`
	SSLMode         string        `json:"ssl_mode,omitempty"`
	SSLCert         string        `json:"ssl_cert,omitempty"`
	SSLKey          string        `json:"ssl_key,omitempty"`
	SSLRootCert     string        `json:"ssl_root_cert,omitempty"`
	SearchPath      string        `json:"search_path,omitempty"`
	ApplicationName string        `json:"application_name,omitempty"`
	MaxOpenConns    int           `json:"max_open_conns,omitempty"`
	MaxIdleConns    int           `json:"max_idle_conns,omitempty"`
	ConnMaxLifetime time.Duration `json:"conn_max_lifetime,omitempty"`
}

// Validate checks if the configuration is valid
func (c *Config) Validate() error {
	if c.Host == "" {
		return fmt.Errorf("host is required")
	}
	if c.Port == 0 {
		c.Port = 5432 // Default PostgreSQL port
	}
	if c.Database == "" {
		return fmt.Errorf("database is required")
	}
	if c.Username == "" {
		return fmt.Errorf("username is required")
	}
	if c.SSLMode == "" {
		c.SSLMode = "disable" // Default SSL mode
	}

	// Validate SSL configuration
	if c.SSLMode != "disable" && c.SSLMode != "require" &&
		c.SSLMode != "verify-ca" && c.SSLMode != "verify-full" {
		return fmt.Errorf("invalid ssl_mode: %s", c.SSLMode)
	}

	if (c.SSLCert != "" || c.SSLKey != "") && (c.SSLCert == "" || c.SSLKey == "") {
		return fmt.Errorf("both ssl_cert and ssl_key must be provided if one is specified")
	}

	// Validate connection pool settings
	if c.MaxOpenConns < 0 {
		return fmt.Errorf("max_open_conns must be >= 0")
	}
	if c.MaxIdleConns < 0 {
		return fmt.Errorf("max_idle_conns must be >= 0")
	}
	if c.MaxIdleConns > c.MaxOpenConns && c.MaxOpenConns != 0 {
		return fmt.Errorf("max_idle_conns cannot be greater than max_open_conns")
	}

	return nil
}

// FromJSON creates a Config from JSON data
func FromJSON(data json.RawMessage) (*Config, error) {
	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse postgres config: %w", err)
	}

	// Set default values
	if config.MaxOpenConns == 0 {
		config.MaxOpenConns = 10 // Default max open connections
	}
	if config.MaxIdleConns == 0 {
		config.MaxIdleConns = 2 // Default max idle connections
	}
	if config.ConnMaxLifetime == 0 {
		config.ConnMaxLifetime = 5 * time.Minute // Default connection lifetime
	}

	if err := config.Validate(); err != nil {
		return nil, err
	}

	return &config, nil
}

// ToJSON converts Config to JSON
func (c *Config) ToJSON() (json.RawMessage, error) {
	if err := c.Validate(); err != nil {
		return nil, err
	}

	data, err := json.Marshal(c)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal postgres config: %w", err)
	}
	return data, nil
}

// BuildDSN builds the PostgreSQL connection string in standard postgres:// format
func (c *Config) BuildDSN() string {
	// Handle default port if not specified
	port := c.Port
	if port == 0 {
		port = 5432
	}

	// Create the base connection URL with credentials and host info
	baseURL := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(c.Username, c.Password),
		Host:   fmt.Sprintf("%s:%d", c.Host, port),
		Path:   c.Database,
	}

	// Build query parameters
	query := url.Values{}

	// Add SSL parameters
	if c.SSLMode != "" {
		query.Add("sslmode", c.SSLMode)
	}
	if c.SSLCert != "" {
		query.Add("sslcert", c.SSLCert)
	}
	if c.SSLKey != "" {
		query.Add("sslkey", c.SSLKey)
	}
	if c.SSLRootCert != "" {
		query.Add("sslrootcert", c.SSLRootCert)
	}

	// Add optional parameters
	if c.SearchPath != "" {
		query.Add("search_path", c.SearchPath)
	}
	if c.ApplicationName != "" {
		query.Add("application_name", c.ApplicationName)
	}

	// Set query string if we have parameters
	if len(query) > 0 {
		baseURL.RawQuery = query.Encode()
	}

	return baseURL.String()
}

// ParseDSN parses a PostgreSQL connection string into a Config struct
func ParseDSN(dsn string) (*Config, error) {
	// Parse the URL
	u, err := url.Parse(dsn)
	if err != nil {
		return nil, fmt.Errorf("invalid DSN: %w", err)
	}

	// Ensure it's a postgres URL
	if u.Scheme != "postgres" {
		return nil, fmt.Errorf("invalid scheme: %s", u.Scheme)
	}

	// Parse port from host
	host := u.Hostname()
	port := 5432 // default PostgreSQL port
	if portStr := u.Port(); portStr != "" {
		p, err := strconv.Atoi(portStr)
		if err != nil {
			return nil, fmt.Errorf("invalid port: %w", err)
		}
		port = p
	}

	// Get username and password
	username := u.User.Username()
	password, _ := u.User.Password()

	// Create config
	config := &Config{
		Username: username,
		Password: password,
		Host:     host,
		Port:     port,
		Database: strings.TrimPrefix(u.Path, "/"),
	}

	// Parse query parameters
	query := u.Query()
	config.SSLMode = query.Get("sslmode")
	config.SSLCert = query.Get("sslcert")
	config.SSLKey = query.Get("sslkey")
	config.SSLRootCert = query.Get("sslrootcert")
	config.SearchPath = query.Get("search_path")
	config.ApplicationName = query.Get("application_name")

	return config, nil
}

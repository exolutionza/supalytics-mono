// pgxhelpers.go
package postgres

import (
	"fmt"
	"math/big"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/jackc/pgx/v5/pgtype"
)

// ConvertValue converts a single column value based on its PostgreSQL OID.
// It uses the provided typeMap (from pgx.Conn.TypeMap, which in v5 is a *pgtype.Map)
// to try to determine a human‐readable type name and perform an appropriate conversion.
// If typeMap is nil or does not contain info for the given OID, the conversion falls
// back to a hard-coded switch on the OID.
func ConvertValue(oid uint32, val interface{}, typeMap *pgtype.Map) (interface{}, error) {
	// If the value is nil, return nil.
	if val == nil {
		return nil, nil
	}

	// If we have type information from the typeMap, try to use that.
	if typeMap != nil {
		if typeInfo, ok := typeMap.TypeForOID(oid); ok {
			switch typeInfo.Name {
			case "uuid":
				return convertUUID(val)
			case "timestamp", "timestamptz":
				return convertTimestamp(val)
			case "numeric":
				return convertNumeric(val)
			// Add more named type cases as needed.
			default:
				return val, nil
			}
		}
	}

	// Fallback: convert based solely on the OID.
	switch oid {
	// PostgreSQL default UUID OID is 2950.
	case 2950:
		return convertUUID(val)
	// For timestamps: common OIDs are 1114 (timestamp without time zone) and 1184 (timestamptz)
	case 1114, 1184:
		return convertTimestamp(val)
	// Numeric – PostgreSQL numeric OID is typically 1700.
	case 1700:
		return convertNumeric(val)
	default:
		return val, nil
	}
}

// ConvertRowValues converts an entire slice of row values using their corresponding
// field descriptions (from rows.FieldDescriptions()) and the connection’s type map.
// It returns a new slice with the converted values.
func ConvertRowValues(fields []pgconn.FieldDescription, values []interface{}, typeMap *pgtype.Map) ([]interface{}, error) {
	if len(fields) != len(values) {
		return nil, fmt.Errorf("mismatch between fields count (%d) and values count (%d)", len(fields), len(values))
	}

	converted := make([]interface{}, len(values))
	for i, val := range values {
		cv, err := ConvertValue(fields[i].DataTypeOID, val, typeMap)
		if err != nil {
			return nil, fmt.Errorf("failed to convert value for column %q: %w", string(fields[i].Name), err)
		}
		converted[i] = cv
	}
	return converted, nil
}

// convertUUID converts a value to a uuid.UUID.
// It supports values that are []byte, string, or a [16]uint8 array.
func convertUUID(val interface{}) (interface{}, error) {
	// Print out the type for debugging purposes.
	fmt.Printf("Raw value: %#v\n", val)
	fmt.Printf("Raw type: %T\n", val)
	var uuidStr string
	switch v := val.(type) {
	case []byte:
		fmt.Println("Matched []byte")
		// If the byte slice is exactly 16 bytes, treat it as a binary UUID.
		if len(v) == 16 {
			var u uuid.UUID
			copy(u[:], v)
			return u, nil
		}
		uuidStr = string(v)
	case string:
		uuidStr = v
	case [16]byte:
		return uuid.UUID(v), nil
	default:
		fmt.Println("Falling back to default case")
		uuidStr = fmt.Sprintf("%v", v)
	}
	parsed, err := uuid.Parse(uuidStr)
	if err != nil {
		// If parsing fails, return the original string.
		return uuidStr, nil
	}
	return parsed, nil
}

// convertTimestamp converts a value to time.Time.
// If the value is already a time.Time, it is returned as is. Otherwise, it attempts to
// parse the value as a string in common PostgreSQL timestamp formats.
func convertTimestamp(val interface{}) (interface{}, error) {
	switch t := val.(type) {
	case time.Time:
		return t, nil
	case []byte:
		return parseTime(string(t))
	case string:
		return parseTime(t)
	default:
		return nil, fmt.Errorf("unexpected type for timestamp: %T", val)
	}
}

// parseTime attempts to parse a time string in common PostgreSQL formats.
func parseTime(timeStr string) (interface{}, error) {
	// First, try RFC3339 format.
	if t, err := time.Parse(time.RFC3339, timeStr); err == nil {
		return t, nil
	}
	// Fallback: try a common PostgreSQL timestamp format.
	const pgTimeFormat = "2006-01-02 15:04:05"
	if t, err := time.Parse(pgTimeFormat, timeStr); err == nil {
		return t, nil
	}
	return timeStr, nil
}

// convertNumeric converts a numeric value to a *big.Float.
// PostgreSQL numeric types are often returned as string or []byte.
func convertNumeric(val interface{}) (interface{}, error) {
	var numStr string
	switch v := val.(type) {
	case []byte:
		numStr = string(v)
	case string:
		numStr = v
	case int64, int32, float64, float32:
		// Already numeric; convert to float64 and then wrap in a big.Float.
		return big.NewFloat(convertToFloat64(v)), nil
	default:
		numStr = fmt.Sprintf("%v", v)
	}
	f, _, err := big.ParseFloat(numStr, 10, 256, big.ToNearestEven)
	if err != nil {
		// If parsing fails, return the original value.
		return val, nil
	}
	return f, nil
}

// convertToFloat64 converts a numeric value (int64, int32, float64, or float32) to float64.
func convertToFloat64(val interface{}) float64 {
	switch n := val.(type) {
	case int64:
		return float64(n)
	case int32:
		return float64(n)
	case float64:
		return n
	case float32:
		return float64(n)
	default:
		// Fallback: convert via string parsing.
		f, err := strconv.ParseFloat(fmt.Sprintf("%v", n), 64)
		if err != nil {
			return 0.0
		}
		return f
	}
}

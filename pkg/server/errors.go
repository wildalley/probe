package server

import (
	"errors"
	"os"
)

var (
	// errInvalidCredentials is returned for a wrong username or password.
	errInvalidCredentials = errors.New("invalid credentials")

	// errTooManyAttempts is returned when an IP is temporarily throttled.
	errTooManyAttempts = errors.New("too many failed attempts")

	// errWeakPassword is returned when a new password fails policy checks.
	errWeakPassword = errors.New("password too weak")
)

// getEnvOr returns the environment value for key, or fallback when unset.
func getEnvOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

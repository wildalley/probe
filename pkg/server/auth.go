package server

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

const (
	sessionCookieName = "probe_session"
	sessionTTL        = 7 * 24 * time.Hour
)

// session is one logged-in admin. Sessions live in memory only, so a server
// restart logs everyone out — acceptable for a single-operator dashboard and it
// avoids persisting anything that could be replayed from the database file.
type session struct {
	username  string
	expiresAt time.Time
}

// SessionStore holds active admin sessions keyed by an opaque random token.
type SessionStore struct {
	mu       sync.RWMutex
	sessions map[string]session
}

func NewSessionStore() *SessionStore {
	return &SessionStore{sessions: make(map[string]session)}
}

// Create issues a new session token for username.
func (st *SessionStore) Create(username string) (string, time.Time, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", time.Time{}, err
	}
	token := hex.EncodeToString(buf)
	expiry := time.Now().Add(sessionTTL)

	st.mu.Lock()
	st.sessions[token] = session{username: username, expiresAt: expiry}
	st.mu.Unlock()

	return token, expiry, nil
}

// Lookup returns the username for a token, or false when it is unknown or expired.
func (st *SessionStore) Lookup(token string) (string, bool) {
	if token == "" {
		return "", false
	}

	st.mu.RLock()
	sess, ok := st.sessions[token]
	st.mu.RUnlock()

	if !ok {
		return "", false
	}
	if time.Now().After(sess.expiresAt) {
		st.Revoke(token)
		return "", false
	}
	return sess.username, true
}

func (st *SessionStore) Revoke(token string) {
	st.mu.Lock()
	delete(st.sessions, token)
	st.mu.Unlock()
}

// RevokeAll drops every session. Called after a password change so old cookies
// stop working.
func (st *SessionStore) RevokeAll() {
	st.mu.Lock()
	st.sessions = make(map[string]session)
	st.mu.Unlock()
}

// sweepExpired periodically discards timed-out sessions so the map does not grow
// without bound on a long-running server.
func (st *SessionStore) sweepExpired() {
	now := time.Now()
	st.mu.Lock()
	for token, sess := range st.sessions {
		if now.After(sess.expiresAt) {
			delete(st.sessions, token)
		}
	}
	st.mu.Unlock()
}

// StartSessionSweeper runs the expiry sweep hourly until the process exits.
func (st *SessionStore) StartSessionSweeper() {
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			st.sweepExpired()
		}
	}()
}

// HashPassword produces a bcrypt hash suitable for storage.
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// GenerateInitialPassword builds a random password for first boot when the
// operator has not supplied one.
func GenerateInitialPassword() string {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		// rand.Read failing is fatal for auth; fall back to a timestamp-derived
		// value so the server still starts, and the operator is told to change it.
		return "change-me-" + time.Now().Format("20060102150405")
	}
	return hex.EncodeToString(buf)
}

/* -----------------------------------------------------------------------------
 * Session extraction & middleware
 * -------------------------------------------------------------------------- */

// sessionTokenFromRequest reads the session token from the cookie, falling back
// to a bearer header so scripted clients can authenticate too.
func sessionTokenFromRequest(c *gin.Context) string {
	if cookie, err := c.Cookie(sessionCookieName); err == nil && cookie != "" {
		return cookie
	}
	if h := c.GetHeader("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	if h := c.GetHeader("X-Probe-Session"); h != "" {
		return h
	}
	return ""
}

// currentUser returns the authenticated admin for this request, if any.
func (s *Server) currentUser(c *gin.Context) (string, bool) {
	return s.sessions.Lookup(sessionTokenFromRequest(c))
}

// requireAuth rejects unauthenticated requests. Applied to every mutating or
// credential-bearing endpoint; read-only dashboard data stays public.
func (s *Server) requireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		username, ok := s.currentUser(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "authentication required",
			})
			return
		}
		c.Set("admin_user", username)
		c.Next()
	}
}

// setSessionCookie writes the session cookie. Secure is set only when the
// request arrived over TLS, so plain-HTTP deployments keep working.
func (s *Server) setSessionCookie(c *gin.Context, token string, expiry time.Time) {
	secure := c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiry,
		MaxAge:   int(sessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) clearSessionCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

/* -----------------------------------------------------------------------------
 * Handlers
 * -------------------------------------------------------------------------- */

// handleLogin verifies credentials and starts a session.
func (s *Server) handleLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if !s.storage.VerifyAdminPassword(req.Username, req.Password) {
		// Same message for unknown user and wrong password so the response does
		// not reveal which usernames exist.
		log.Printf("[Auth] Failed login attempt for user %q from %s", req.Username, c.ClientIP())
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	token, expiry, err := s.sessions.Create(req.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}

	s.setSessionCookie(c, token, expiry)
	c.JSON(http.StatusOK, gin.H{"username": req.Username, "expires_at": expiry.Unix()})
}

// handleLogout ends the current session.
func (s *Server) handleLogout(c *gin.Context) {
	s.sessions.Revoke(sessionTokenFromRequest(c))
	s.clearSessionCookie(c)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// handleAuthStatus lets the frontend decide whether to show admin controls
// without having to probe a protected endpoint.
func (s *Server) handleAuthStatus(c *gin.Context) {
	username, ok := s.currentUser(c)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"authenticated": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"authenticated":    true,
		"username":         username,
		"password_is_temp": s.storage.AdminPasswordIsTemporary(username),
	})
}

// handleChangePassword updates the admin password and invalidates all sessions.
func (s *Server) handleChangePassword(c *gin.Context) {
	username, _ := s.currentUser(c)

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if !s.storage.VerifyAdminPassword(username, req.CurrentPassword) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "当前密码不正确"})
		return
	}
	if len(req.NewPassword) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "新密码至少需要 8 个字符"})
		return
	}

	if err := s.storage.SetAdminPassword(username, req.NewPassword, false); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Force every client (including this one) to log in again with the new password.
	s.sessions.RevokeAll()
	s.clearSessionCookie(c)
	c.JSON(http.StatusOK, gin.H{"ok": true, "reauth_required": true})
}

/* -----------------------------------------------------------------------------
 * CORS origin allow-list
 * -------------------------------------------------------------------------- */

// parseAllowedOrigins builds the CORS allow-list. Cookie-based sessions cannot
// be sent to a wildcard origin, so each permitted origin is echoed back
// explicitly. Localhost dev servers are always included; extra origins come from
// PROBE_ALLOWED_ORIGINS as a comma-separated list.
func parseAllowedOrigins(raw string) map[string]bool {
	allowed := map[string]bool{
		"http://localhost:5173": true,
		"http://127.0.0.1:5173": true,
	}
	for _, origin := range strings.Split(raw, ",") {
		if o := strings.TrimSpace(strings.TrimSuffix(origin, "/")); o != "" {
			allowed[o] = true
		}
	}
	return allowed
}

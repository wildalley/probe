package server

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

const (
	// SessionCookieName is the HttpOnly cookie holding the dashboard session token.
	SessionCookieName = "probe_session"

	// DefaultAdminUser is the username created on first boot.
	DefaultAdminUser = "admin"

	// bcryptCost balances hashing cost against login latency on small VPS hardware.
	bcryptCost = 12

	// Login throttling: lock an IP after too many consecutive failures.
	maxLoginFailures = 5
	loginLockWindow  = 15 * time.Minute
)

// dummyHash is compared against when a username does not exist so that response
// timing does not reveal whether an account is present.
var dummyHash = []byte("$2a$12$C6UzMDM.H6dfI/f/IKcEe.aQnRDQ1kMRSSNYNCPLnFsuNZFTaMhTa")

// AuthManager owns admin credentials, session lifecycle, and brute-force throttling.
type AuthManager struct {
	storage    *Storage
	sessionTTL time.Duration

	mu    sync.RWMutex
	cache map[string]*sessionEntry // sha256(token) -> session

	failMu   sync.Mutex
	failures map[string]*failureEntry // client IP -> recent failures
}

type sessionEntry struct {
	Username  string
	ExpiresAt int64
}

type failureEntry struct {
	Count     int
	FirstSeen time.Time
}

// NewAuthManager wires the auth layer and provisions the initial admin account.
func NewAuthManager(storage *Storage, sessionTTL time.Duration) (*AuthManager, error) {
	if sessionTTL <= 0 {
		sessionTTL = 7 * 24 * time.Hour
	}

	am := &AuthManager{
		storage:    storage,
		sessionTTL: sessionTTL,
		cache:      make(map[string]*sessionEntry),
		failures:   make(map[string]*failureEntry),
	}

	if err := am.bootstrapAdmin(); err != nil {
		return nil, err
	}
	return am, nil
}

// bootstrapAdmin creates the admin account on first boot. Credentials come from
// PROBE_ADMIN_USER / PROBE_ADMIN_PASSWORD when provided, otherwise a random
// password is generated and printed once to the server log.
func (am *AuthManager) bootstrapAdmin() error {
	count, err := am.storage.CountAdminUsers()
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	username := strings.TrimSpace(getEnvOr("PROBE_ADMIN_USER", DefaultAdminUser))
	password := getEnvOr("PROBE_ADMIN_PASSWORD", "")
	mustChange := false

	if password == "" {
		password = generateReadablePassword()
		mustChange = true
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return err
	}
	if err := am.storage.CreateAdminUser(username, string(hash), mustChange); err != nil {
		return err
	}

	if mustChange {
		log.Printf("==================================================")
		log.Printf("  初始管理员账号已创建 (请立即登录并修改密码)")
		log.Printf("  Username : %s", username)
		log.Printf("  Password : %s", password)
		log.Printf("  此密码仅显示一次，可用 PROBE_ADMIN_PASSWORD 预设。")
		log.Printf("==================================================")
	} else {
		log.Printf("[Auth] Admin account %q initialized from environment variables", username)
	}
	return nil
}

// Login verifies credentials and issues a session token on success.
func (am *AuthManager) Login(username, password, ip, userAgent string) (token string, mustChange bool, err error) {
	if am.isLockedOut(ip) {
		return "", false, errTooManyAttempts
	}

	user, lookupErr := am.storage.GetAdminUser(username)
	if lookupErr != nil {
		return "", false, lookupErr
	}

	// Always run a bcrypt comparison so timing does not leak account existence.
	storedHash := dummyHash
	if user != nil {
		storedHash = []byte(user.PasswordHash)
	}
	compareErr := bcrypt.CompareHashAndPassword(storedHash, []byte(password))

	if user == nil || compareErr != nil {
		am.recordFailure(ip)
		return "", false, errInvalidCredentials
	}

	am.clearFailures(ip)

	token, err = am.createSession(user.Username, ip, userAgent)
	if err != nil {
		return "", false, err
	}
	return token, user.MustChangePassword, nil
}

func (am *AuthManager) createSession(username, ip, userAgent string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	hashed := hashSessionToken(token)
	expiresAt := time.Now().Add(am.sessionTTL).Unix()

	if err := am.storage.CreateSession(hashed, username, expiresAt, ip, userAgent); err != nil {
		return "", err
	}

	am.mu.Lock()
	am.cache[hashed] = &sessionEntry{Username: username, ExpiresAt: expiresAt}
	am.mu.Unlock()

	return token, nil
}

// Validate resolves a session token to a username, or returns false when the
// token is unknown or expired.
func (am *AuthManager) Validate(token string) (string, bool) {
	if token == "" {
		return "", false
	}
	hashed := hashSessionToken(token)
	now := time.Now().Unix()

	am.mu.RLock()
	entry, cached := am.cache[hashed]
	am.mu.RUnlock()

	if cached {
		if entry.ExpiresAt <= now {
			am.revokeHashed(hashed)
			return "", false
		}
		return entry.Username, true
	}

	username, expiresAt, err := am.storage.GetSession(hashed)
	if err != nil || username == "" {
		return "", false
	}
	if expiresAt <= now {
		am.revokeHashed(hashed)
		return "", false
	}

	am.mu.Lock()
	am.cache[hashed] = &sessionEntry{Username: username, ExpiresAt: expiresAt}
	am.mu.Unlock()

	return username, true
}

// Revoke destroys a single session (logout).
func (am *AuthManager) Revoke(token string) {
	if token == "" {
		return
	}
	am.revokeHashed(hashSessionToken(token))
}

func (am *AuthManager) revokeHashed(hashed string) {
	am.mu.Lock()
	delete(am.cache, hashed)
	am.mu.Unlock()
	_ = am.storage.DeleteSession(hashed)
}

// RevokeAllForUser invalidates every session of a user, used after a password change.
func (am *AuthManager) RevokeAllForUser(username string) {
	am.mu.Lock()
	for hashed, entry := range am.cache {
		if entry.Username == username {
			delete(am.cache, hashed)
		}
	}
	am.mu.Unlock()
	_ = am.storage.DeleteSessionsForUser(username)
}

// ChangePassword verifies the current password and stores a new bcrypt hash.
func (am *AuthManager) ChangePassword(username, currentPassword, newPassword string) error {
	if len(newPassword) < 8 {
		return errWeakPassword
	}

	user, err := am.storage.GetAdminUser(username)
	if err != nil {
		return err
	}
	if user == nil {
		return errInvalidCredentials
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(currentPassword)) != nil {
		return errInvalidCredentials
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcryptCost)
	if err != nil {
		return err
	}
	return am.storage.UpdateAdminPassword(username, string(hash))
}

// MustChangePassword reports whether the account still uses its generated password.
func (am *AuthManager) MustChangePassword(username string) bool {
	user, err := am.storage.GetAdminUser(username)
	if err != nil || user == nil {
		return false
	}
	return user.MustChangePassword
}

// StartCleanup periodically drops expired sessions from cache and storage.
func (am *AuthManager) StartCleanup(stop <-chan struct{}) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			now := time.Now().Unix()
			am.mu.Lock()
			for hashed, entry := range am.cache {
				if entry.ExpiresAt <= now {
					delete(am.cache, hashed)
				}
			}
			am.mu.Unlock()
			_ = am.storage.DeleteExpiredSessions(now)

			am.failMu.Lock()
			for ip, f := range am.failures {
				if time.Since(f.FirstSeen) > loginLockWindow {
					delete(am.failures, ip)
				}
			}
			am.failMu.Unlock()
		}
	}
}

func (am *AuthManager) isLockedOut(ip string) bool {
	am.failMu.Lock()
	defer am.failMu.Unlock()

	f, ok := am.failures[ip]
	if !ok {
		return false
	}
	if time.Since(f.FirstSeen) > loginLockWindow {
		delete(am.failures, ip)
		return false
	}
	return f.Count >= maxLoginFailures
}

func (am *AuthManager) recordFailure(ip string) {
	am.failMu.Lock()
	defer am.failMu.Unlock()

	f, ok := am.failures[ip]
	if !ok || time.Since(f.FirstSeen) > loginLockWindow {
		am.failures[ip] = &failureEntry{Count: 1, FirstSeen: time.Now()}
		return
	}
	f.Count++
}

func (am *AuthManager) clearFailures(ip string) {
	am.failMu.Lock()
	delete(am.failures, ip)
	am.failMu.Unlock()
}

func hashSessionToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// generateReadablePassword builds a 16-char password from an unambiguous alphabet.
func generateReadablePassword() string {
	const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	buf := make([]byte, 16)
	randomBytes := make([]byte, 16)
	if _, err := rand.Read(randomBytes); err != nil {
		// crypto/rand failure is fatal for credential generation.
		panic("failed to read cryptographic randomness: " + err.Error())
	}
	for i, b := range randomBytes {
		buf[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(buf)
}

// --- Gin plumbing ---

// extractSessionToken reads the session token from the cookie or Authorization header.
func extractSessionToken(c *gin.Context) string {
	if cookie, err := c.Cookie(SessionCookieName); err == nil && cookie != "" {
		return cookie
	}
	if h := c.GetHeader("X-Probe-Session"); h != "" {
		return h
	}
	return ""
}

// currentUser returns the authenticated username for a request, if any.
func (s *Server) currentUser(c *gin.Context) (string, bool) {
	if s.auth == nil {
		return "", false
	}
	return s.auth.Validate(extractSessionToken(c))
}

// requireAuth rejects unauthenticated requests to admin endpoints.
func (s *Server) requireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		username, ok := s.currentUser(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "authentication required",
				"code":  "unauthenticated",
			})
			return
		}
		c.Set("username", username)
		c.Next()
	}
}

// requireViewer gates read-only telemetry. Private mode is the default, so this
// requires a session unless the operator opted into public viewing with -public.
func (s *Server) requireViewer() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !s.privateMode {
			if username, ok := s.currentUser(c); ok {
				c.Set("username", username)
			}
			c.Next()
			return
		}

		username, ok := s.currentUser(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "authentication required",
				"code":  "unauthenticated",
			})
			return
		}
		c.Set("username", username)
		c.Next()
	}
}

// isTrustedOrigin allows the dashboard's own origin plus any explicitly
// configured via PROBE_ALLOWED_ORIGINS, so credentialed CORS stays narrow.
func (s *Server) isTrustedOrigin(c *gin.Context, origin string) bool {
	if u, err := url.Parse(origin); err == nil && u.Host != "" {
		// Same-host requests are the normal case for the embedded SPA.
		if strings.EqualFold(u.Host, c.Request.Host) {
			return true
		}
	}

	for _, allowed := range s.allowedOrigins {
		if allowed == "*" || strings.EqualFold(allowed, origin) {
			return true
		}
	}
	return false
}

// setSessionCookie writes the session cookie, marking it Secure over HTTPS.
func setSessionCookie(c *gin.Context, token string, ttl time.Duration) {
	secure := c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(ttl.Seconds()),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(c *gin.Context) {
	secure := c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// handleLogin authenticates an operator and starts a session.
func (s *Server) handleLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username and password are required"})
		return
	}

	token, mustChange, err := s.auth.Login(req.Username, req.Password, c.ClientIP(), c.GetHeader("User-Agent"))
	switch err {
	case nil:
	case errTooManyAttempts:
		log.Printf("[Auth] Login throttled for IP %s", c.ClientIP())
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": "too many failed attempts, try again later",
			"code":  "throttled",
		})
		return
	case errInvalidCredentials:
		log.Printf("[Auth] Failed login for %q from %s", req.Username, c.ClientIP())
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "invalid username or password",
			"code":  "invalid_credentials",
		})
		return
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "login failed"})
		return
	}

	setSessionCookie(c, token, s.auth.sessionTTL)
	log.Printf("[Auth] %q logged in from %s", req.Username, c.ClientIP())

	c.JSON(http.StatusOK, gin.H{
		"authenticated":        true,
		"username":             req.Username,
		"must_change_password": mustChange,
	})
}

// handleLogout destroys the current session.
func (s *Server) handleLogout(c *gin.Context) {
	token := extractSessionToken(c)
	s.auth.Revoke(token)
	clearSessionCookie(c)
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}

// handleAuthStatus reports whether the caller holds a valid session.
func (s *Server) handleAuthStatus(c *gin.Context) {
	username, ok := s.currentUser(c)
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"authenticated": false,
			"public_view":   !s.privateMode,
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"authenticated":        true,
		"username":             username,
		"must_change_password": s.auth.MustChangePassword(username),
		"public_view":          !s.privateMode,
	})
}

// handleChangePassword rotates the operator password and invalidates old sessions.
func (s *Server) handleChangePassword(c *gin.Context) {
	username := c.GetString("username")

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	switch err := s.auth.ChangePassword(username, req.CurrentPassword, req.NewPassword); err {
	case nil:
	case errWeakPassword:
		c.JSON(http.StatusBadRequest, gin.H{"error": "new password must be at least 8 characters"})
		return
	case errInvalidCredentials:
		c.JSON(http.StatusUnauthorized, gin.H{"error": "current password is incorrect"})
		return
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
		return
	}

	// Invalidate every existing session, then issue a fresh one for this client.
	s.auth.RevokeAllForUser(username)

	token, err := s.auth.createSession(username, c.ClientIP(), c.GetHeader("User-Agent"))
	if err != nil {
		clearSessionCookie(c)
		c.JSON(http.StatusOK, gin.H{"message": "password updated, please log in again"})
		return
	}
	setSessionCookie(c, token, s.auth.sessionTTL)

	log.Printf("[Auth] Password changed for %q from %s", username, c.ClientIP())
	c.JSON(http.StatusOK, gin.H{
		"message":              "password updated",
		"authenticated":        true,
		"username":             username,
		"must_change_password": false,
	})
}

// constantTimeEquals is used where a non-hashed secret comparison is unavoidable.
func constantTimeEquals(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

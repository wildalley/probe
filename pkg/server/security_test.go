package server

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"probe/pkg/model"

	"github.com/gorilla/websocket"
)

func securityTestServer(t *testing.T, private bool) *Server {
	t.Helper()
	t.Setenv("PROBE_THEMES_DIR", t.TempDir())
	t.Setenv("PROBE_ADMIN_PASSWORD", "security-test-password")
	storage, err := NewStorage(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = storage.Close() })
	auth, err := NewAuthManager(storage, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	ds := NewDownsampler(storage, time.Second, 7)
	hub := NewHub(storage, ds)
	hub.nodeStates["private-node"] = &model.NodeState{NodeID: "private-node", Name: "Private inventory"}
	return NewServer(hub, storage, ds, nil, nil, auth, private)
}

func securitySession(t *testing.T, s *Server) string {
	t.Helper()
	token, err := s.auth.createSession("admin", "", "test")
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func TestSecurityPrivateAndPublicRoutes(t *testing.T) {
	for _, private := range []bool{true, false} {
		t.Run(map[bool]string{true: "private", false: "public"}[private], func(t *testing.T) {
			s := securityTestServer(t, private)
			token := securitySession(t, s)
			for _, route := range []struct {
				method, path, body string
				admin              bool
			}{
				{"GET", "/api/v1/nodes", "", false},
				{"GET", "/api/nodes", "", false},
				{"GET", "/api/records/load?uuid=private-node", "", false},
				{"GET", "/api/records/ping?uuid=private-node", "", false},
				{"GET", "/api/task/ping", "", false},
				{"GET", "/api/recent/private-node", "", false},
				{"POST", "/api/rpc2", `{"jsonrpc":"2.0","method":"common:getNodes","id":1}`, false},
				{"GET", "/api/admin/client/list", "", true},
				{"GET", "/api/admin/database/size", "", true},
			} {
				for _, authenticated := range []bool{false, true} {
					req := httptest.NewRequest(route.method, route.path, strings.NewReader(route.body))
					if authenticated {
						req.Header.Set("Authorization", "Bearer "+token)
					}
					w := httptest.NewRecorder()
					s.ServeHTTP(w, req)
					want := http.StatusOK
					if !authenticated && (private || route.admin) {
						want = http.StatusUnauthorized
					}
					if w.Code != want {
						t.Errorf("%s auth=%v: status=%d want=%d", route.path, authenticated, w.Code, want)
					}
				}
			}
		})
	}
}

func TestSecurityRPCAdminMethodsAndBatchLimit(t *testing.T) {
	s := securityTestServer(t, false)
	body := `[ {"jsonrpc":"2.0","method":"rpc.ping","id":1}, {"jsonrpc":"2.0","method":"admin:getAllPingTasks","id":2} ]`
	for _, token := range []string{"", securitySession(t, s)} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/api/rpc2", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		s.ServeHTTP(w, req)
		var responses []JSONRPCResponse
		if err := json.Unmarshal(w.Body.Bytes(), &responses); err != nil {
			t.Fatal(err)
		}
		if len(responses) != 2 || responses[0].Result != "pong" {
			t.Fatal("public RPC broken")
		}
		if (responses[1].Error != nil) != (token == "") {
			t.Fatal("admin RPC authorization incorrect")
		}
	}
	requests := make([]JSONRPCRequest, maxRPCBatch+1)
	for i := range requests {
		requests[i] = JSONRPCRequest{Method: "rpc.ping"}
	}
	data, _ := json.Marshal(requests)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest("POST", "/api/rpc2", bytes.NewReader(data)))
	var response JSONRPCResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil || response.Error == nil {
		t.Fatal("oversized batch accepted")
	}
	// Saturation must reject work rather than create an unbounded queue.
	for i := 0; i < cap(s.rpcSlots); i++ {
		s.rpcSlots <- struct{}{}
	}
	result := s.processRPCMessage([]byte(`{"method":"rpc.ping"}`), "").(JSONRPCResponse)
	if result.Error == nil || result.Error.Code != -32000 {
		t.Fatal("RPC concurrency limit ignored")
	}
}

func TestSecurityHTTPBodyLimit(t *testing.T) {
	s := securityTestServer(t, false)
	payload := strings.Repeat(" ", maxRequestBytes+1) + `{"method":"rpc.ping"}`
	for _, unknownLength := range []bool{false, true} {
		req := httptest.NewRequest("POST", "/api/rpc2", strings.NewReader(payload))
		if unknownLength {
			req.ContentLength = -1
		}
		w := httptest.NewRecorder()
		s.ServeHTTP(w, req)
		if w.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("unknownLength=%v: status=%d", unknownLength, w.Code)
		}
	}
}

func TestSecurityViewerWebSockets(t *testing.T) {
	s := securityTestServer(t, true)
	ts := httptest.NewServer(s)
	defer ts.Close()
	token := securitySession(t, s)
	paths := []string{"/api/rpc2", "/api/clients", "/api/v1/client/ws"}
	var connections []*websocket.Conn
	for _, path := range paths {
		url := "ws" + strings.TrimPrefix(ts.URL, "http") + path
		for _, header := range []http.Header{nil, {"Authorization": []string{"Bearer " + token}, "Origin": []string{"https://evil.example"}}} {
			conn, resp, err := websocket.DefaultDialer.Dial(url, header)
			if conn != nil {
				conn.Close()
			}
			if err == nil {
				t.Fatalf("%s accepted unauthorized or foreign-origin connection", path)
			}
			if resp != nil {
				resp.Body.Close()
			}
		}
		header := http.Header{"Authorization": []string{"Bearer " + token}, "Origin": []string{ts.URL}}
		conn, _, err := websocket.DefaultDialer.Dial(url, header)
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		defer conn.Close()
		connections = append(connections, conn)
	}
	s.auth.Revoke(token)
	deadline := time.Now().Add(7 * time.Second)
	for i, conn := range connections {
		conn.SetReadDeadline(deadline)
		for {
			_, _, err := conn.ReadMessage()
			if err == nil {
				continue
			}
			if !websocket.IsCloseError(err, websocket.CloseAbnormalClosure, websocket.CloseNormalClosure) {
				t.Fatalf("%s did not close after revocation: %v", paths[i], err)
			}
			break
		}
	}
}

func TestSecurityWebSocketMessageLimit(t *testing.T) {
	s := securityTestServer(t, false)
	ts := httptest.NewServer(s)
	defer ts.Close()
	for _, path := range []string{"/api/rpc2", "/api/clients", "/api/v1/client/ws"} {
		conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(ts.URL, "http")+path, nil)
		if err != nil {
			t.Fatal(err)
		}
		conn.SetReadDeadline(time.Now().Add(3 * time.Second))
		_ = conn.WriteMessage(websocket.TextMessage, bytes.Repeat([]byte(" "), maxRequestBytes+1))
		for {
			_, _, err = conn.ReadMessage()
			if err == nil {
				continue
			}
			if !websocket.IsCloseError(err, websocket.CloseMessageTooBig) {
				t.Fatalf("%s: %v", path, err)
			}
			break
		}
		conn.Close()
	}
}

func TestSecurityCompatibilityCookies(t *testing.T) {
	s := securityTestServer(t, true)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest("POST", "https://probe.example/api/login", strings.NewReader(`{"username":"admin","password":"security-test-password"}`)))
	if w.Code != 200 {
		t.Fatal(w.Code)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatal("missing cookies")
	}
	for _, cookie := range cookies {
		if !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode {
			t.Errorf("insecure cookie: %s", cookie.Name)
		}
	}
	w = httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest("POST", "https://probe.example/api/v1/auth/login", strings.NewReader(`{"username":"admin","password":"security-test-password"}`)))
	cookies = w.Result().Cookies()
	if len(cookies) != 2 || cookies[0].Value != cookies[1].Value {
		t.Fatal("native login did not refresh both cookie names")
	}
	for _, cookie := range cookies {
		if !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode {
			t.Fatal("native login cookie policy differs")
		}
	}
	for _, path := range []string{"/api/v1/auth/logout", "/api/logout"} {
		w = httptest.NewRecorder()
		req := httptest.NewRequest("POST", "https://probe.example"+path, nil)
		for _, cookie := range cookies {
			req.AddCookie(cookie)
		}
		s.ServeHTTP(w, req)
		cleared := w.Result().Cookies()
		if len(cleared) != 2 {
			t.Fatal("logout must clear both names")
		}
		for _, cookie := range cleared {
			if cookie.MaxAge != -1 || !cookie.Secure {
				t.Errorf("cookie not securely cleared: %s", cookie.Name)
			}
		}
	}
}

func TestSecurityThemeDownloadBlocksPrivateTargets(t *testing.T) {
	t.Setenv("PROBE_ALLOW_PRIVATE_TARGETS", "false")
	tm := NewThemeManager(nil, t.TempDir())
	internal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("private receiver reached")
		_, _ = io.WriteString(w, "not a zip")
	}))
	defer internal.Close()
	for _, url := range []string{internal.URL, strings.Replace(internal.URL, "127.0.0.1", "localhost", 1)} {
		if _, err := tm.DownloadAndInstall(url, ""); err == nil {
			t.Fatal("private target accepted")
		}
	}
	tm.assetMirror = internal.URL + "/{url}"
	if _, err := tm.DownloadAndInstall("https://github.com/example/archive.zip", ""); err == nil {
		t.Fatal("private mirror accepted")
	}
}

package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"probe/pkg/model"

	"github.com/gorilla/websocket"
)

const privacyIPv4 = "203.0.113.10"
const privacyIPv6 = "2001:db8::10"

func privacyTestServer(t *testing.T) *Server {
	t.Helper()
	s := securityTestServer(t, false)
	s.hub.nodeStates["private-node"].System.PublicIP = privacyIPv4
	s.hub.nodeStates["private-node"].System.PublicIPv6 = privacyIPv6
	return s
}

func assertViewerIPs(t *testing.T, body []byte, visible bool) {
	t.Helper()
	for _, ip := range []string{privacyIPv4, privacyIPv6} {
		if strings.Contains(string(body), ip) != visible {
			t.Fatalf("IP visibility should be %v: %s", visible, body)
		}
	}
}

func TestPrivacyHTTP(t *testing.T) {
	s := privacyTestServer(t)
	token := securitySession(t, s)
	for _, route := range []struct{ method, path, body string }{
		{"GET", "/api/v1/nodes", ""},
		{"GET", "/api/v1/nodes/private-node", ""},
		{"POST", "/api/rpc2", `{"jsonrpc":"2.0","method":"common:getNodes","id":1}`},
		{"POST", "/api/rpc2", `[{"jsonrpc":"2.0","method":"common:getNodes","id":1},{"jsonrpc":"2.0","method":"common:getNodes","id":2}]`},
	} {
		for _, session := range []string{"", "invalid-session", token} {
			req := httptest.NewRequest(route.method, route.path, strings.NewReader(route.body))
			req.AddCookie(&http.Cookie{Name: "probe_session", Value: session})
			w := httptest.NewRecorder()
			s.ServeHTTP(w, req)
			if w.Code != http.StatusOK {
				t.Fatalf("%s: status %d", route.path, w.Code)
			}
			assertViewerIPs(t, w.Body.Bytes(), session == token)
			if !strings.Contains(w.Header().Get("Cache-Control"), "no-store") {
				t.Fatalf("%s permits caching viewer-specific responses", route.path)
			}
		}
	}
	state, _ := s.hub.GetNodeState("private-node")
	if state.System.PublicIP != privacyIPv4 || state.System.PublicIPv6 != privacyIPv6 {
		t.Fatal("redaction modified internal node addresses")
	}
}

func TestPrivacyWebSocketSnapshotsUpdatesAndRevocation(t *testing.T) {
	s := privacyTestServer(t)
	ts := httptest.NewServer(s)
	defer ts.Close()
	token := securitySession(t, s)
	var connections []*websocket.Conn
	read := func(conn *websocket.Conn, visible bool) {
		t.Helper()
		conn.SetReadDeadline(time.Now().Add(3 * time.Second))
		_, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		assertViewerIPs(t, data, visible)
	}
	for _, session := range []string{"", token} {
		header := http.Header{"Cookie": []string{"probe_session=" + session}}
		conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(ts.URL, "http")+"/api/v1/client/ws", header)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
		connections = append(connections, conn)
		read(conn, session != "")
	}
	state, _ := s.hub.GetNodeState("private-node")
	for index, kind := range []string{"node_update", "node_offline", "nodes_snapshot"} {
		var data interface{} = state
		if kind == "nodes_snapshot" {
			data = []*model.NodeState{state}
		}
		event := &model.WSEvent{Type: kind, Data: data, Sequence: uint64(index + 1)}
		s.hub.broadcastToClients(event)
		read(connections[0], false)
		read(connections[1], true)
	}
	s.auth.Revoke(token)
	s.hub.broadcastToClients(&model.WSEvent{Type: "node_update", Data: state, Sequence: 4})
	for _, conn := range connections {
		read(conn, false)
	}
	if state.System.PublicIP != privacyIPv4 || state.System.PublicIPv6 != privacyIPv6 {
		t.Fatal("broadcast redaction modified original event")
	}
}

func TestPrivacyRPCWebSocket(t *testing.T) {
	s := privacyTestServer(t)
	ts := httptest.NewServer(s)
	defer ts.Close()
	for _, authenticated := range []bool{false, true} {
		token := ""
		if authenticated {
			token = securitySession(t, s)
		}
		// Third-party themes use the Komari-compatible session cookie.
		header := http.Header{"Cookie": []string{"session_token=" + token}}
		conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(ts.URL, "http")+"/api/rpc2", header)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
		for _, body := range []string{
			`{"jsonrpc":"2.0","method":"common:getNodes","id":1}`,
			`[{"jsonrpc":"2.0","method":"common:getNodes","id":1}]`,
		} {
			if err := conn.WriteMessage(websocket.TextMessage, []byte(body)); err != nil {
				t.Fatal(err)
			}
			conn.SetReadDeadline(time.Now().Add(3 * time.Second))
			_, data, err := conn.ReadMessage()
			if err != nil {
				t.Fatal(err)
			}
			assertViewerIPs(t, data, authenticated)
		}
		s.auth.Revoke(token)
		if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"method":"common:getNodes","id":3}`)); err != nil {
			t.Fatal(err)
		}
		conn.SetReadDeadline(time.Now().Add(3 * time.Second))
		_, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		assertViewerIPs(t, data, false)
	}
}

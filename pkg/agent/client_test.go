package agent

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// TestServerPingKeepsAgentConnected pins the fix for the reconnect loop. The
// read loop below closes the connection whenever it goes readWait without a
// frame, and only a received pong or ping refreshes that deadline. A server
// that pings inside the window must therefore keep one connection alive
// indefinitely, instead of the agent tearing it down and rebuilding it once a
// minute for the life of the process.
func TestServerPingKeepsAgentConnected(t *testing.T) {
	original := readWait
	readWait = 300 * time.Millisecond
	defer func() { readWait = original }()

	// Captured up front: the handler goroutine outlives the test body, so it
	// must not read the package-level deadline while the defer above restores
	// it. Well inside readWait, mirroring the server's 30s ping against the
	// agent's 60s deadline.
	pingEvery := readWait / 6

	stop := make(chan struct{})
	defer close(stop)

	upgrader := websocket.Upgrader{}
	connected := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()
		close(connected)

		// gorilla allows one concurrent reader, which is this goroutine, and
		// one concurrent writer, which is the ping loop below.
		go func() {
			for {
				if _, _, err := conn.ReadMessage(); err != nil {
					return
				}
			}
		}()

		for {
			select {
			case <-stop:
				return
			default:
			}

			if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(time.Second)); err != nil {
				return
			}
			time.Sleep(pingEvery)
		}
	}))
	defer srv.Close()

	client := NewClient(AgentConfig{
		ServerURL:      "ws" + strings.TrimPrefix(srv.URL, "http"),
		NodeID:         "node-1",
		NodeName:       "node-1",
		Token:          "test-token",
		ReportInterval: 50 * time.Millisecond,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() { done <- client.connectAndServe(ctx) }()

	select {
	case <-connected:
	case <-time.After(5 * time.Second):
		t.Fatal("agent never connected")
	}

	// Several read deadlines' worth of otherwise idle time.
	select {
	case err := <-done:
		t.Fatalf("connection dropped after %v despite server pings: %v", 4*readWait, err)
	case <-time.After(4 * readWait):
	}

	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("agent did not shut down after cancel")
	}
}

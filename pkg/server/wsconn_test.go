package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// TestWriteQueuePingsIdleConnection covers the heartbeat. Both peers bound how
// long they wait for a frame and refresh that bound only on a received pong, so
// without a ping an idle-but-healthy link is torn down on a fixed cycle — the
// agent rebuilt its connection once a minute.
func TestWriteQueuePingsIdleConnection(t *testing.T) {
	upgrader := websocket.Upgrader{}
	serverSide := make(chan *websocket.Conn, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		serverSide <- conn
	}))
	defer srv.Close()

	client, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer func() { _ = client.Close() }()

	conn := <-serverSide

	pinged := make(chan struct{}, 1)
	client.SetPingHandler(func(appData string) error {
		select {
		case pinged <- struct{}{}:
		default:
		}
		return client.WriteControl(websocket.PongMessage, []byte(appData), time.Now().Add(time.Second))
	})

	// Control frames are only processed while a read is in flight.
	go func() {
		for {
			if _, _, err := client.ReadMessage(); err != nil {
				return
			}
		}
	}()

	q := newWSWriteQueuePinging(conn, 20*time.Millisecond)
	defer q.Close()

	// Nothing is ever queued for sending: the ping has to arrive on its own
	// rather than as a side effect of a payload.
	select {
	case <-pinged:
	case <-time.After(5 * time.Second):
		t.Fatal("no ping arrived on an idle connection")
	}
}

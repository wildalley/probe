package server

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// wsSendBuffer is how many frames may sit pending for one connection before
	// it counts as unable to keep up.
	wsSendBuffer = 32

	// wsWriteTimeout bounds a single frame write so one stalled peer cannot pin
	// its writer goroutine indefinitely.
	wsWriteTimeout = 10 * time.Second

	// wsPingInterval is how often a WebSocket ping goes out on every connection.
	//
	// Both peers set a 60s read deadline that only a received Pong refreshes, so
	// without a heartbeat each side declares the other dead every 60s and the
	// agent reconnects on a fixed one-minute cycle. The interval sits well inside
	// that deadline, and inside the agent's own reporting interval budget, so a
	// healthy link is refreshed twice per window.
	wsPingInterval = 30 * time.Second
)

// wsWriteQueue serializes all writes to a single WebSocket connection.
//
// gorilla/websocket allows at most one concurrent writer per connection and
// panics when that is violated. Broadcasts, per-client snapshots and agent
// config pushes each run on their own goroutine, so every write is funneled
// through this queue rather than touching the socket directly. Reads stay on
// the caller's goroutine — one reader plus one writer is supported.
type wsWriteQueue struct {
	conn        *websocket.Conn
	send        chan []byte
	ping        time.Duration // heartbeat interval for this connection
	minSequence uint64        // events at or below this preceded the initial snapshot

	closeOnce sync.Once
	closed    chan struct{}
}

func newWSWriteQueue(conn *websocket.Conn) *wsWriteQueue {
	return newWSWriteQueuePinging(conn, wsPingInterval)
}

// newWSWriteQueuePinging is newWSWriteQueue with the heartbeat interval exposed
// so tests can exercise it without waiting out the real one.
func newWSWriteQueuePinging(conn *websocket.Conn, pingInterval time.Duration) *wsWriteQueue {
	q := &wsWriteQueue{
		conn:   conn,
		send:   make(chan []byte, wsSendBuffer),
		closed: make(chan struct{}),
		ping:   pingInterval,
	}
	go q.run()
	return q
}

// run is the only goroutine that writes to the connection.
func (q *wsWriteQueue) run() {
	defer func() { _ = q.conn.Close() }()

	pings := time.NewTicker(q.ping)
	defer pings.Stop()

	for {
		select {
		case <-q.closed:
			return
		case payload := <-q.send:
			_ = q.conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
			if err := q.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				q.Close()
				return
			}
		case <-pings.C:
			// WriteControl is safe to call alongside the frame writes above.
			// Peers answer a ping with a pong on their own, which is what
			// refreshes the read deadline on their side of the connection.
			_ = q.conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
			if err := q.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				q.Close()
				return
			}
		}
	}
}

// Send enqueues a frame, reporting false when the connection is already closed
// or its buffer is full. A full buffer means the peer is too slow to keep up;
// dropping it beats stalling every other client behind it.
func (q *wsWriteQueue) Send(payload []byte) bool {
	select {
	case <-q.closed:
		return false
	default:
	}

	select {
	case q.send <- payload:
		return true
	case <-q.closed:
		return false
	default:
		return false
	}
}

// IsClosed reports whether the queue has been shut down, either explicitly or
// because a write failed. Used to tell "peer is gone" apart from "peer is merely
// behind", since Send returns false for both.
func (q *wsWriteQueue) IsClosed() bool {
	select {
	case <-q.closed:
		return true
	default:
		return false
	}
}

// Close stops the writer goroutine and closes the socket. Safe to call more
// than once, from any goroutine.
func (q *wsWriteQueue) Close() {
	q.closeOnce.Do(func() {
		close(q.closed)
		if q.conn != nil {
			_ = q.conn.Close()
		}
	})
}

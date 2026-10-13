package server

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const (
	maxRequestBytes = 1 << 20
	maxRPCBatch     = 32
	viewerReadWait  = 90 * time.Second
)

func limitRequestBody() gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := int64(maxRequestBytes)
		if c.Request.URL.Path == "/api/v1/themes/upload" {
			limit = maxThemeArchiveBytes + (1 << 20) // multipart overhead
		}
		if c.Request.ContentLength > limit {
			c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{"error": "request body exceeds limit"})
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		c.Next()
	}
}

// guardViewerSocket applies the same input bounds and session lifecycle to
// native and compatible streams. Control writes can run alongside data writes.
// The caller must stop this guard and close the connection on return.
func (s *Server) guardViewerSocket(conn *websocket.Conn, token string) func() {
	conn.SetReadLimit(maxRequestBytes)
	_ = conn.SetReadDeadline(time.Now().Add(viewerReadWait))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(viewerReadWait))
	})
	done := make(chan struct{})
	var once sync.Once
	go func() {
		check := time.NewTicker(5 * time.Second)
		ping := time.NewTicker(30 * time.Second)
		defer check.Stop()
		defer ping.Stop()
		for {
			select {
			case <-done:
				return
			case <-check.C:
				if s.privateMode {
					if _, ok := s.auth.Validate(token); !ok {
						_ = conn.Close()
						return
					}
				}
			case <-ping.C:
				if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(wsWriteTimeout)); err != nil {
					_ = conn.Close()
					return
				}
			}
		}
	}()
	return func() { once.Do(func() { close(done) }) }
}

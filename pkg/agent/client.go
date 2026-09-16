package agent

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"probe/pkg/model"
	"probe/pkg/netguard"

	"github.com/gorilla/websocket"
)

// AgentConfig encapsulates agent runtime parameters.
type AgentConfig struct {
	ServerURL      string        `json:"server_url" yaml:"server_url"`
	NodeID         string        `json:"node_id" yaml:"node_id"`
	NodeName       string        `json:"node_name" yaml:"node_name"`
	Token          string        `json:"token" yaml:"token"`
	Region         string        `json:"region" yaml:"region"`
	ReportInterval time.Duration `json:"report_interval" yaml:"report_interval"`
	InsecureTLS    bool          `json:"insecure_tls" yaml:"insecure_tls"`
}

// Client manages the outbound WebSocket connection to the Server Hub.
type Client struct {
	cfg       AgentConfig
	collector *Collector
}

// NewClient creates a new agent client.
func NewClient(cfg AgentConfig) *Client {
	if cfg.ReportInterval <= 0 {
		cfg.ReportInterval = 1 * time.Second
	}
	collector := NewCollector(cfg.NodeID, cfg.NodeName, cfg.Token, cfg.Region)
	return &Client{
		cfg:       cfg,
		collector: collector,
	}
}

// Run starts the main agent loop with automatic reconnect and exponential backoff.
func (c *Client) Run(ctx context.Context) {
	backoff := 1 * time.Second
	maxBackoff := 30 * time.Second

	for {
		select {
		case <-ctx.Done():
			log.Println("[Agent] Shutting down...")
			return
		default:
		}

		err := c.connectAndServe(ctx)
		if err != nil {
			log.Printf("[Agent] Connection error: %v. Retrying in %v...", err, backoff)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}

		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

func (c *Client) connectAndServe(ctx context.Context) error {
	// Format WS URL
	rawURL := c.cfg.ServerURL
	if strings.HasPrefix(rawURL, "http://") {
		rawURL = "ws://" + rawURL[7:]
	} else if strings.HasPrefix(rawURL, "https://") {
		rawURL = "wss://" + rawURL[8:]
	} else if !strings.HasPrefix(rawURL, "ws://") && !strings.HasPrefix(rawURL, "wss://") {
		rawURL = "ws://" + rawURL
	}

	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid server url: %w", err)
	}

	// Ensure path points to agent endpoint
	if !strings.HasSuffix(u.Path, "/api/v1/agent/ws") && !strings.HasSuffix(u.Path, "/ws/agent") {
		u.Path = strings.TrimSuffix(u.Path, "/") + "/api/v1/agent/ws"
	}

	// Add Token in Header
	header := http.Header{}
	header.Set("Authorization", "Bearer "+c.cfg.Token)
	header.Set("X-Node-ID", c.cfg.NodeID)
	header.Set("X-Node-Name", c.cfg.NodeName)
	header.Set("X-Node-Region", c.cfg.Region)

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}
	if c.cfg.InsecureTLS {
		dialer.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}

	log.Printf("[Agent] Connecting to %s (Node: %s)...", u.String(), c.cfg.NodeID)
	conn, resp, err := dialer.DialContext(ctx, u.String(), header)
	if err != nil {
		if resp != nil {
			return fmt.Errorf("dial failed with HTTP status %s: %w", resp.Status, err)
		}
		return fmt.Errorf("dial failed: %w", err)
	}
	defer conn.Close()

	log.Printf("[Agent] Connected successfully to Hub. Starting metric transmission (interval: %v)...", c.cfg.ReportInterval)

	ticker := time.NewTicker(c.cfg.ReportInterval)
	defer ticker.Stop()

	// Handle Pong and Ping
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	errChan := make(chan error, 1)

	// Goroutine to read server messages / keep connection alive
	go func() {
		for {
			_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
			msgType, msg, err := conn.ReadMessage()
			if err != nil {
				errChan <- err
				return
			}
			if msgType == websocket.TextMessage {
				var event struct {
					Type string `json:"type"`
					Data struct {
						PingTargets []model.PingTargetConfig `json:"ping_targets"`
					} `json:"data"`
				}
				if err := json.Unmarshal(msg, &event); err == nil && event.Type == "config_sync" {
					var targets []TargetConfig
					for _, pt := range event.Data.PingTargets {
						if err := netguard.ValidatePingTarget(pt.Protocol, pt.Target, pt.Port); err != nil {
							log.Printf("[Agent] Skipping ping target %s: %v", pt.Label, err)
							continue
						}
						addr := pt.Target
						if !strings.EqualFold(strings.TrimSpace(pt.Protocol), "http") {
							resolved, _ := netguard.ValidateProbeTarget(pt.Target, pt.Port)
							addr = resolved
						}
						targets = append(targets, TargetConfig{
							ID:       pt.ID,
							Label:    pt.Label,
							Address:  addr,
							Color:    pt.Color,
							Protocol: pt.Protocol,
							Interval: pt.Interval,
						})
					}
					c.collector.UpdatePingTargets(targets)
					log.Printf("[Agent] Synchronized %d ping targets from server", len(targets))
				}
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "agent exit"))
			return nil
		case err := <-errChan:
			return fmt.Errorf("socket read error: %w", err)
		case <-ticker.C:
			report, err := c.collector.Collect()
			if err != nil {
				log.Printf("[Agent] Error collecting metrics: %v", err)
				continue
			}

			payload, err := json.Marshal(report)
			if err != nil {
				log.Printf("[Agent] Error marshaling report: %v", err)
				continue
			}

			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return fmt.Errorf("socket write error: %w", err)
			}
		}
	}
}

package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"gopkg.in/yaml.v3"
	"probe/pkg/agent"
	"probe/pkg/version"
)

func main() {
	var (
		serverURL   string
		token       string
		nodeID      string
		nodeName    string
		region      string
		intervalSec int
		configPath  string
		insecure    bool
		showVersion bool
	)

	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "node-" + strconv.FormatInt(time.Now().Unix()%10000, 10)
	}

	flag.StringVar(&serverURL, "server", getEnv("PROBE_SERVER", "ws://127.0.0.1:8080"), "Server address (e.g. ws://127.0.0.1:8080 or wss://probe.example.com)")
	flag.StringVar(&token, "token", getEnv("PROBE_TOKEN", "sk_default_secret_probe_token"), "Authentication token matching server configuration")
	flag.StringVar(&nodeID, "node-id", getEnv("PROBE_NODE_ID", hostname), "Unique identifier for this node")
	flag.StringVar(&nodeName, "name", getEnv("PROBE_NAME", hostname), "Friendly display name for this node")
	flag.StringVar(&region, "region", getEnv("PROBE_REGION", "auto"), "Geographical region / datacenter label (default 'auto' for automatic IP geolocation)")
	flag.IntVar(&intervalSec, "interval", getEnvInt("PROBE_INTERVAL", 1), "Metrics report interval in seconds")
	flag.StringVar(&configPath, "config", "", "Path to YAML configuration file (optional)")
	flag.BoolVar(&insecure, "insecure", false, "Allow insecure TLS certificates")
	flag.BoolVar(&showVersion, "version", false, "Print the agent version and exit")
	flag.Parse()

	// Printed before anything else so an installer can ask a freshly placed
	// binary what it actually is.
	if showVersion {
		fmt.Printf("probe-agent %s\n", version.Version)
		return
	}

	cfg := agent.AgentConfig{
		ServerURL:      serverURL,
		NodeID:         nodeID,
		NodeName:       nodeName,
		Token:          token,
		Region:         region,
		ReportInterval: time.Duration(intervalSec) * time.Second,
		InsecureTLS:    insecure,
	}

	// Load file config if specified
	if configPath != "" {
		data, err := os.ReadFile(configPath)
		if err != nil {
			log.Fatalf("Failed to read config file %s: %v", configPath, err)
		}
		if err := yaml.Unmarshal(data, &cfg); err != nil {
			log.Fatalf("Failed to parse config file: %v", err)
		}
	}

	log.Printf("==================================================")
	log.Printf("  Cyber Probe Agent (Extreme Low Resource)")
	log.Printf("  Node ID : %s", cfg.NodeID)
	log.Printf("  Name    : %s", cfg.NodeName)
	log.Printf("  Region  : %s", cfg.Region)
	log.Printf("  Server  : %s", cfg.ServerURL)
	log.Printf("  Interval: %v", cfg.ReportInterval)
	log.Printf("  Version : %s", version.Version)
	log.Printf("==================================================")

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	client := agent.NewClient(cfg)
	client.Run(ctx)
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		if n, err := strconv.Atoi(val); err == nil {
			return n
		}
	}
	return defaultVal
}

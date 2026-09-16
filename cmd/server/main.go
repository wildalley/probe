package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"probe/pkg/server"
	"probe/pkg/version"
)

//go:embed all:dist
var embeddedDist embed.FS

func main() {
	var (
		listenAddr    string
		dbPath        string
		flushSec      int
		retentionDays int
		publicView    bool
		sessionHours  int
		showVersion   bool
	)

	flag.StringVar(&listenAddr, "addr", getEnv("PROBE_SERVER_ADDR", ":8080"), "Server HTTP and WebSocket listen address")
	flag.StringVar(&dbPath, "db", getEnv("PROBE_DB_PATH", "probe.db"), "Path to SQLite database file")
	flag.IntVar(&flushSec, "flush-interval", 15, "Seconds between downsample batch writes to SQLite")
	flag.IntVar(&retentionDays, "retention-days", 7, "Days of historical downsampled telemetry to retain")
	flag.BoolVar(&publicView, "public", getEnvBool("PROBE_PUBLIC_VIEW", false), "Allow anonymous read-only viewing of telemetry (default: login required for every view)")
	flag.IntVar(&sessionHours, "session-hours", 168, "Dashboard session lifetime in hours")
	flag.BoolVar(&showVersion, "version", false, "Print the server version and exit")
	flag.Parse()

	if showVersion {
		fmt.Printf("probe-server %s\n", version.Version)
		return
	}

	// Ensure DB directory exists
	dbDir := filepath.Dir(dbPath)
	if dbDir != "." && dbDir != "" {
		_ = os.MkdirAll(dbDir, 0755)
	}

	log.Printf("==================================================")
	log.Printf("  Cyber Probe Server Hub (In-Memory Broadcast)")
	log.Printf("  Version          : %s", version.Version)
	log.Printf("  Listen Address   : %s", listenAddr)
	log.Printf("  SQLite Database  : %s", dbPath)
	log.Printf("  Downsample Flush : %ds", flushSec)
	log.Printf("  Retention Window : %d days", retentionDays)
	if publicView {
		log.Printf("  Access Mode      : PUBLIC read-only (admin actions require login)")
	} else {
		log.Printf("  Access Mode      : PRIVATE (login required for every view)")
	}
	log.Printf("==================================================")

	// Initialize SQLite storage
	storage, err := server.NewStorage(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize SQLite storage: %v", err)
	}
	defer storage.Close()

	// Initialize downsampling engine
	downsampler := server.NewDownsampler(storage, time.Duration(flushSec)*time.Second, retentionDays)

	// Initialize pure in-memory Hub
	hub := server.NewHub(storage, downsampler)

	// Initialize authentication (provisions the admin account on first boot)
	if sessionHours <= 0 {
		sessionHours = 168
	}
	auth, err := server.NewAuthManager(storage, time.Duration(sessionHours)*time.Hour)
	if err != nil {
		log.Fatalf("Failed to initialize authentication: %v", err)
	}

	// Initialize Custom Notifier
	notifier := server.NewNotifier(storage, hub)
	hub.SetNotifier(notifier)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start background routines
	go hub.Start(ctx)
	go downsampler.Start(ctx)
	go notifier.Start(ctx)

	authStop := make(chan struct{})
	defer close(authStop)
	go auth.StartCleanup(authStop)

	// Setup embedded filesystem
	var distFS fs.FS
	sub, err := fs.Sub(embeddedDist, "dist")
	if err == nil {
		distFS = sub
	}

	srv := server.NewServer(hub, storage, downsampler, notifier, distFS, auth, !publicView)

	httpServer := &http.Server{
		Addr:    listenAddr,
		Handler: srv,
	}

	go func() {
		log.Printf("[Server] Web & API listening on http://%s", listenAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[Server] Shutting down gracefully...")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("[Server] HTTP shutdown error: %v", err)
	}

	fmt.Println("[Server] Stopped.")
}

// getEnvBool parses a boolean environment variable, falling back when unset or
// unparseable.
func getEnvBool(key string, defaultVal bool) bool {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal
	}
	parsed, err := strconv.ParseBool(val)
	if err != nil {
		return defaultVal
	}
	return parsed
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

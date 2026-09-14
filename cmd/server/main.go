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
	"syscall"
	"time"

	"probe/pkg/server"
)

//go:embed all:dist
var embeddedDist embed.FS

func main() {
	var (
		listenAddr    string
		dbPath        string
		flushSec      int
		retentionDays int
	)

	flag.StringVar(&listenAddr, "addr", getEnv("PROBE_SERVER_ADDR", ":8080"), "Server HTTP and WebSocket listen address")
	flag.StringVar(&dbPath, "db", getEnv("PROBE_DB_PATH", "probe.db"), "Path to SQLite database file")
	flag.IntVar(&flushSec, "flush-interval", 15, "Seconds between downsample batch writes to SQLite")
	flag.IntVar(&retentionDays, "retention-days", 7, "Days of historical downsampled telemetry to retain")
	flag.Parse()

	// Ensure DB directory exists
	dbDir := filepath.Dir(dbPath)
	if dbDir != "." && dbDir != "" {
		_ = os.MkdirAll(dbDir, 0755)
	}

	log.Printf("==================================================")
	log.Printf("  Cyber Probe Server Hub (In-Memory Broadcast)")
	log.Printf("  Listen Address   : %s", listenAddr)
	log.Printf("  SQLite Database  : %s", dbPath)
	log.Printf("  Downsample Flush : %ds", flushSec)
	log.Printf("  Retention Window : %d days", retentionDays)
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

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start background routines
	go hub.Start(ctx)
	go downsampler.Start(ctx)

	// Setup embedded filesystem
	var distFS fs.FS
	sub, err := fs.Sub(embeddedDist, "dist")
	if err == nil {
		distFS = sub
	}

	srv := server.NewServer(hub, storage, downsampler, distFS)

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

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

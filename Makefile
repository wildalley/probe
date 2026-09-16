.PHONY: all build-all build-agent build-server build-web dev-server dev-agent dev-web clean

# Release version stamped into both binaries. Override for a real release:
#   make build-all PROBE_VERSION=1.2.3
#
# Deliberately not named VERSION: that is a common environment variable, and an
# inherited one would silently stamp the build with an unrelated value. The
# default identifies the exact commit, which is what the dashboard compares a
# node's reported version against, so an unstamped build is still meaningful.
PROBE_VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

GO_LDFLAGS := -s -w -X probe/pkg/version.Version=$(PROBE_VERSION)

all: build-all

build-web:
	@echo "==> Building Web frontend..."
	cd web && npm install && npm run build

build-agent:
	@echo "==> Building Probe Agent (Static & Stripped)..."
	mkdir -p bin
	CGO_ENABLED=0 go build -ldflags="$(GO_LDFLAGS)" -o bin/probe-agent cmd/agent/main.go
	@echo "Agent binary built: bin/probe-agent v$(PROBE_VERSION) ($$(ls -lh bin/probe-agent | awk '{print $$5}'))"

build-server: build-web
	@echo "==> Building Probe Server (Single-Binary with Embedded UI)..."
	mkdir -p bin
	CGO_ENABLED=0 go build -ldflags="$(GO_LDFLAGS)" -o bin/probe-server cmd/server/main.go
	@echo "Server binary built: bin/probe-server v$(PROBE_VERSION) ($$(ls -lh bin/probe-server | awk '{print $$5}'))"

build-all: build-agent build-server
	@echo "==> All binaries built successfully in bin/"

dev-server:
	go run cmd/server/main.go --addr :8080 --db probe.db

dev-agent:
	go run cmd/agent/main.go --server ws://127.0.0.1:8080 --token sk_default_secret_probe_token --node-id localhost-01 --name "Local Dev Machine" --region "LOCAL"

dev-web:
	cd web && npm run dev

clean:
	rm -rf bin
	rm -f probe.db*

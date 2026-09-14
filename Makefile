.PHONY: all build-all build-agent build-server build-web dev-server dev-agent dev-web clean

GO_LDFLAGS := -s -w

all: build-all

build-web:
	@echo "==> Building Web frontend..."
	cd web && npm install && npm run build

build-agent:
	@echo "==> Building Probe Agent (Static & Stripped)..."
	mkdir -p bin
	CGO_ENABLED=0 go build -ldflags="$(GO_LDFLAGS)" -o bin/probe-agent cmd/agent/main.go
	@echo "Agent binary built: bin/probe-agent ($$(ls -lh bin/probe-agent | awk '{print $$5}'))"

build-server: build-web
	@echo "==> Building Probe Server (Single-Binary with Embedded UI)..."
	mkdir -p bin
	CGO_ENABLED=0 go build -ldflags="$(GO_LDFLAGS)" -o bin/probe-server cmd/server/main.go
	@echo "Server binary built: bin/probe-server ($$(ls -lh bin/probe-server | awk '{print $$5}'))"

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

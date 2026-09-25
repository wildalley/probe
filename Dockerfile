# syntax=docker/dockerfile:1

# Stage 1 — build the dashboard from source.
#
# cmd/server/dist is committed, but it is a build artifact: trusting it would
# ship whatever was last built by hand. Building here guarantees the embedded UI
# matches web/src in this tree.
FROM node:22-alpine AS web

WORKDIR /build/web

# Dependencies are copied on their own so this layer is reused whenever only
# application source changed.
COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
# vite writes to ../cmd/server/dist (outDir in vite.config.ts), so that path has
# to exist inside this stage too.
RUN npm run build


# Stage 2 — compile the server with the freshly built UI embedded via go:embed.
FROM golang:1.27.1-alpine AS server

WORKDIR /build

# Go module downloads default to the goproxy.cn mirror, which is dramatically
# faster from mainland China networks. ARG (not ENV) keeps them build-time only
# and overridable per build, e.g.:
#   docker compose build --build-arg GOPROXY=https://proxy.golang.org,direct \
#                         --build-arg GOSUMDB=sum.golang.org
ARG GOPROXY=https://goproxy.cn,direct
ARG GOSUMDB=sum.golang.google.cn

COPY go.mod go.sum ./
RUN go mod download

COPY cmd/ ./cmd/
COPY pkg/ ./pkg/

# Replace the committed bundle with the one built above, then embed it.
RUN rm -rf cmd/server/dist
COPY --from=web /build/cmd/server/dist ./cmd/server/dist

# Release version stamped into both binaries. Pass it with
# --build-arg VERSION=1.2.3 (docker-compose.yml forwards PROBE_VERSION).
#
# It has to be supplied by the host: .dockerignore excludes .git, so
# `git describe` cannot run in here. Both binaries receive the same value, which
# is what makes the version the dashboard expects identical to the version it
# hands out over /download/probe-agent.
#
# Declared here rather than beside the other build setup on purpose — an ARG
# invalidates the cache from its own line onward, and cutting a release must not
# re-copy the sources.
ARG VERSION=dev

# CGO stays off: modernc.org/sqlite is pure Go, so the result is a static binary
# that runs on a distroless/alpine base with no libc dependency.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath \
      -ldflags="-s -w -X probe/pkg/version.Version=${VERSION}" \
      -o /out/probe-server ./cmd/server

# The agent is built too, because the server hands it out over
# GET /download/probe-agent for one-line deploys. It is built for this image's
# architecture, so an amd64 image serves an amd64 agent — cross-arch targets
# should download from a matching image or build their own.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath \
      -ldflags="-s -w -X probe/pkg/version.Version=${VERSION}" \
      -o /out/probe-agent ./cmd/agent


# Stage 3 — runtime.
FROM alpine:3.22

# ca-certificates: the server calls out over HTTPS for exchange rates, GeoIP and
#   alert delivery (Telegram/Discord/webhooks) — without these every such call
#   fails with a certificate error.
# tzdata: the daily report fires at a wall-clock time in local time, so the
#   container needs zone data for TZ to mean anything.
# The healthcheck uses busybox wget, which alpine already ships.
RUN apk add --no-cache ca-certificates tzdata

# Run unprivileged. The server only needs to read its own binary and write the
# SQLite file in /data.
RUN addgroup -S probe && adduser -S -G probe probe

WORKDIR /app
COPY --from=server /out/probe-server /app/probe-server

# Both of these are read from disk at request time, relative to the working
# directory — they are not embedded in the binary:
#   GET /install.sh          -> deploy/install.sh
#   GET /download/probe-agent -> bin/probe-agent
# Without them the dashboard still runs, but the one-line deploy command it
# prints returns 404 on the target machine.
COPY --from=server /out/probe-agent /app/bin/probe-agent
COPY deploy/install.sh /app/deploy/install.sh

# SQLite lives on a volume so history survives image upgrades. The theme
# manager installs plugin packages into ./themes relative to the working
# directory — /app itself is root-owned, so without this pre-created, probe-
# owned directory every install fails with a permission error.
RUN mkdir -p /data /app/themes && chown -R probe:probe /data /app/themes
VOLUME ["/data"]

USER probe

ENV PROBE_SERVER_ADDR=":8080" \
    PROBE_DB_PATH="/data/probe.db"

EXPOSE 8080

# /api/v1/auth/status is deliberately public (login has to be reachable without
# a session), so it works as a liveness probe even in the default private mode.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:8080/api/v1/auth/status" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/app/probe-server"]

#!/usr/bin/env python3
"""
Cyber Probe Cluster Simulator
Simulates multiple distributed nodes reporting metrics to the Hub via WebSocket.
Useful for testing Aceternity Spotlight UI, semantic colors, and uPlot charts without needing multiple physical servers.
"""

import sys
import json
import time
import math
import random
import threading
from urllib.parse import urlparse

try:
    import websocket
except ImportError:
    print("Please install websocket-client: pip install websocket-client")
    sys.exit(1)

NODES = [
    {
        "node_id": "us-west-vps01",
        "name": "US West (San Jose)",
        "region": "US-West",
        "os": "Debian GNU/Linux 12 (bookworm)",
        "kernel": "6.1.0-21-amd64",
        "cores": 8,
        "mem_total": 16 * 1024 * 1024 * 1024,
        "disk_total": 500 * 1024 * 1024 * 1024,
        "base_cpu": 25.0,
        "base_mem": 45.0,
        "base_disk": 38.0,
        "base_down": 8 * 1024 * 1024,
        "base_up": 2 * 1024 * 1024,
    },
    {
        "node_id": "hk-edge-node02",
        "name": "HK Edge Gateway",
        "region": "HK",
        "os": "Ubuntu 24.04 LTS (noble)",
        "kernel": "6.8.0-31-generic",
        "cores": 4,
        "mem_total": 8 * 1024 * 1024 * 1024,
        "disk_total": 200 * 1024 * 1024 * 1024,
        "base_cpu": 78.0,  # Warning yellow zone (70-85%)
        "base_mem": 68.0,
        "base_disk": 52.0,
        "base_down": 32 * 1024 * 1024,
        "base_up": 18 * 1024 * 1024,
    },
    {
        "node_id": "jp-tokyo-db03",
        "name": "Tokyo DB Cluster",
        "region": "JP",
        "os": "Arch Linux (rolling)",
        "kernel": "6.10.3-arch1-1",
        "cores": 16,
        "mem_total": 64 * 1024 * 1024 * 1024,
        "disk_total": 2000 * 1024 * 1024 * 1024,
        "base_cpu": 89.0,  # Alert red zone (>85%)
        "base_mem": 86.5,
        "base_disk": 74.0,
        "base_down": 4 * 1024 * 1024,
        "base_up": 12 * 1024 * 1024,
    },
    {
        "node_id": "eu-fra-ingress04",
        "name": "Frankfurt Transit",
        "region": "EU-DE",
        "os": "Alpine Linux v3.20",
        "kernel": "6.6.32-0-virt",
        "cores": 2,
        "mem_total": 4 * 1024 * 1024 * 1024,
        "disk_total": 80 * 1024 * 1024 * 1024,
        "base_cpu": 12.0,  # Safe green zone (<70%)
        "base_mem": 24.0,
        "base_disk": 19.5,
        "base_down": 45 * 1024 * 1024,
        "base_up": 38 * 1024 * 1024,
    },
]

def simulate_node(server_ws_url, token, node_cfg):
    node_id = node_cfg["node_id"]
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Node-ID": node_id,
        "X-Node-Name": node_cfg["name"],
        "X-Node-Region": node_cfg["region"],
    }

    print(f"[{node_id}] Connecting to {server_ws_url}...")
    try:
        ws = websocket.create_connection(server_ws_url, header=headers)
    except Exception as e:
        print(f"[{node_id}] Connection failed: {e}")
        return

    print(f"[{node_id}] Connected. Starting metric loop...")

    uptime = 125000 + random.randint(1000, 50000)
    bytes_sent = 100 * 1024 * 1024 * 1024
    bytes_recv = 450 * 1024 * 1024 * 1024
    t = 0

    while True:
        try:
            t += 1
            uptime += 1

            # Simulate realistic fluctuations
            cpu_wave = math.sin(t * 0.1) * 8
            cpu_jitter = random.uniform(-3, 3)
            cpu = max(1.0, min(99.0, node_cfg["base_cpu"] + cpu_wave + cpu_jitter))

            mem_jitter = random.uniform(-1, 1)
            mem_pct = max(5.0, min(98.0, node_cfg["base_mem"] + mem_jitter))
            mem_used = int((mem_pct / 100.0) * node_cfg["mem_total"])

            disk_pct = node_cfg["base_disk"] + random.uniform(-0.1, 0.1)
            disk_used = int((disk_pct / 100.0) * node_cfg["disk_total"])

            rate_down = max(0, node_cfg["base_down"] * (1 + math.sin(t * 0.15) * 0.4 + random.uniform(-0.1, 0.1)))
            rate_up = max(0, node_cfg["base_up"] * (1 + math.cos(t * 0.12) * 0.3 + random.uniform(-0.1, 0.1)))

            bytes_recv += int(rate_down)
            bytes_sent += int(rate_up)
            tcp_est = int(30 + cpu * 1.5 + random.randint(0, 10))

            payload = {
                "node_id": node_id,
                "token": token,
                "timestamp": int(time.time()),
                "name": node_cfg["name"],
                "region": node_cfg["region"],
                "system": {
                    "os": node_cfg["os"],
                    "kernel": node_cfg["kernel"],
                    "uptime": uptime,
                    "cpu_percent": round(cpu, 1),
                    "mem_used": mem_used,
                    "mem_total": node_cfg["mem_total"],
                    "disk_percent": round(disk_pct, 1),
                    "disk_used": disk_used,
                    "disk_total": node_cfg["disk_total"],
                    "load_1": round(cpu / 100.0 * node_cfg["cores"], 2),
                    "load_5": round(cpu / 100.0 * node_cfg["cores"] * 0.9, 2),
                    "load_15": round(cpu / 100.0 * node_cfg["cores"] * 0.8, 2),
                    "cpu_count": node_cfg["cores"],
                },
                "network": {
                    "bytes_sent": bytes_sent,
                    "bytes_recv": bytes_recv,
                    "tcp_established": tcp_est,
                    "rate_upload": round(rate_up, 2),
                    "rate_download": round(rate_down, 2),
                },
            }

            ws.send(json.dumps(payload))
            time.sleep(1.0)
        except Exception as e:
            print(f"[{node_id}] Disconnected: {e}. Reconnecting in 3s...")
            time.sleep(3)
            try:
                ws = websocket.create_connection(server_ws_url, header=headers)
            except Exception:
                pass

def main():
    server = sys.argv[1] if len(sys.argv) > 1 else "ws://127.0.0.1:8080/api/v1/agent/ws"
    token = sys.argv[2] if len(sys.argv) > 2 else "sk_default_secret_probe_token"

    print("==================================================")
    print("  Cyber Probe Cluster Simulator")
    print(f"  Target Hub: {server}")
    print(f"  Nodes     : {len(NODES)} (US-West, HK, Tokyo, Frankfurt)")
    print("==================================================")

    threads = []
    for node in NODES:
        t = threading.Thread(target=simulate_node, args=(server, token, node), daemon=True)
        t.start()
        threads.append(t)
        time.sleep(0.3)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping simulated nodes...")

if __name__ == "__main__":
    main()

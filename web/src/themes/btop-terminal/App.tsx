import React, { useState, useEffect, useMemo, useRef } from "react";
import { NodeState, ThemeMode, WSEvent } from "../../types";
import { BtopTerminalView } from "../../components/BtopTerminalView";

export function App() {
  const [colorMode, setColorMode] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("cyber_probe_color_mode");
    if (saved === "light" || saved === "dark") return saved;
    return "dark";
  });

  const theme: ThemeMode = colorMode === "dark" ? "btop" : "btop-light";
  const isLight = colorMode === "light";

  useEffect(() => {
    localStorage.setItem("cyber_probe_color_mode", colorMode);
    document.documentElement.classList.remove("dark", "blueprint", "blueprint-dark", "btop", "btop-light");
    if (isLight) {
      document.documentElement.classList.add("btop-light");
      document.documentElement.setAttribute("data-theme", "btop-light");
    } else {
      document.documentElement.classList.add("dark", "btop");
      document.documentElement.setAttribute("data-theme", "btop");
    }
  }, [colorMode, isLight]);

  const [nodes, setNodes] = useState<NodeState[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Check auth
  useEffect(() => {
    fetch("/api/v1/auth/session", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) {
          setCanManage(true);
          setUsername(data.username || "admin");
        }
      })
      .catch(() => {
        // Fallback to Komari me check
        fetch("/api/me")
          .then((r) => r.json())
          .then((me) => {
            if (me.logged_in) {
              setCanManage(true);
              setUsername(me.username || "admin");
            }
          })
          .catch(() => {});
      });
  }, []);

  // Fetch nodes and setup telemetry transport
  useEffect(() => {
    let unmounted = false;
    let pollTimer: any = null;

    const fetchNodes = async () => {
      // 1. Try Probe native API
      try {
        const res = await fetch("/api/v1/nodes", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && !unmounted) {
            setNodes(data);
            setupProbeWS();
            return;
          }
        }
      } catch (_) {}

      // 2. Fallback to Komari API
      try {
        const res = await fetch("/api/nodes");
        if (res.ok) {
          const json = await res.json();
          const list = Array.isArray(json) ? json : json.data || [];
          if (!unmounted) {
            setNodes(mapKomariClients(list));
            setupKomariWS();
            // Also poll as backup
            pollTimer = setInterval(async () => {
              try {
                const r = await fetch("/api/nodes");
                if (r.ok) {
                  const j = await r.json();
                  const l = Array.isArray(j) ? j : j.data || [];
                  setNodes(mapKomariClients(l));
                }
              } catch (_) {}
            }, 3000);
          }
        }
      } catch (err) {
        console.error("Failed to load node data:", err);
      }
    };

    const setupProbeWS = () => {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/telemetry`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const wsEvent: WSEvent = JSON.parse(e.data);
          if (wsEvent.type === "nodes_snapshot" && Array.isArray(wsEvent.data)) {
            setNodes(wsEvent.data);
          } else if (wsEvent.type === "node_update" && wsEvent.data) {
            const node: NodeState = wsEvent.data;
            setNodes((prev) => {
              const idx = prev.findIndex((n) => n.node_id === node.node_id);
              if (idx >= 0) {
                const clone = [...prev];
                clone[idx] = { ...clone[idx], ...node };
                return clone;
              }
              return [...prev, node];
            });
          } else if (wsEvent.type === "node_offline" && wsEvent.data) {
            const node: NodeState = wsEvent.data;
            setNodes((prev) =>
              prev.map((n) => (n.node_id === node.node_id ? { ...n, is_online: false, rate_down: 0, rate_up: 0 } : n))
            );
          } else if (wsEvent.type === "node_delete" && wsEvent.data?.node_id) {
            setNodes((prev) => prev.filter((n) => n.node_id !== wsEvent.data.node_id));
          }
        } catch (_) {}
      };
    };

    const setupKomariWS = () => {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/api/clients`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          // Komari live stream updates
          if (data && typeof data === "object") {
            setNodes((prev) =>
              prev.map((n) => {
                const update = data[n.node_id];
                if (!update) return n;
                const cpuUsage = update.cpu?.usage ?? n.cpu;
                const memUsed = update.ram?.used ?? n.system.mem_used;
                const memTotal = update.ram?.total ?? n.system.mem_total;
                const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : n.mem;
                const rateDown = update.network?.rx_speed ?? n.rate_down;
                const rateUp = update.network?.tx_speed ?? n.rate_up;
                return {
                  ...n,
                  is_online: true,
                  cpu: cpuUsage,
                  mem: memPct,
                  rate_down: rateDown,
                  rate_up: rateUp,
                  system: {
                    ...n.system,
                    cpu_percent: cpuUsage,
                    mem_used: memUsed,
                    mem_total: memTotal,
                    uptime: update.uptime ?? n.system.uptime,
                  },
                };
              })
            );
          }
        } catch (_) {}
      };
    };

    fetchNodes();

    return () => {
      unmounted = true;
      if (pollTimer) clearInterval(pollTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const toggleTheme = () => {
    setColorMode((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const handleSelectTheme = (t: ThemeMode) => {
    setColorMode(t === "btop-light" ? "light" : "dark");
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
      await fetch("/api/logout");
    } catch (_) {}
    window.location.reload();
  };

  return (
    <div className={`min-h-screen ${isLight ? "bg-[#ebe7ee] text-[#2b2735]" : "bg-[#0c0e17] text-[#e2e8f0]"}`}>
      <BtopTerminalView
        nodes={nodes}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSelectTheme={handleSelectTheme}
        onOpenAdminModal={() => {
          window.location.href = "/admin";
        }}
        canManage={canManage}
        username={username}
        onLogout={handleLogout}
      />
    </div>
  );
}

// Helper to adapt standard Komari nodes to NodeState
function mapKomariClients(list: any[]): NodeState[] {
  return list.map((c: any) => {
    const memTotal = c.system?.memory_total || 1024 * 1024 * 1024;
    const diskTotal = c.system?.disk_total || 10 * 1024 * 1024 * 1024;
    const isOnline = c.status === 1 || c.status === "online";
    return {
      node_id: c.uuid || c.id || "node",
      name: c.name || "Server",
      region: c.region || "UN",
      tags: c.tags ? (typeof c.tags === "string" ? c.tags.split(",") : c.tags) : [],
      is_online: isOnline,
      last_seen: Date.now() / 1000,
      cpu: 0,
      mem: 0,
      disk: 0,
      rate_down: 0,
      rate_up: 0,
      uptime_str: "up 1d 00:00",
      system: {
        os: c.system?.os || "Linux",
        kernel: c.system?.kernel_version || "6.1.0",
        cpu_model: c.system?.cpu_name || "x86_64 CPU",
        cpu_count: c.system?.cpu_cores || 1,
        cpu_percent: 0,
        mem_used: 0,
        mem_total: memTotal,
        disk_used: 0,
        disk_total: diskTotal,
        disk_percent: 0,
        uptime: 86400,
      },
      network: {
        bytes_sent: 0,
        bytes_recv: 0,
        tcp_established: 0,
        rate_upload: 0,
        rate_download: 0,
      },
    };
  });
}

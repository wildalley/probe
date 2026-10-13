import React, { useState, useEffect, useMemo, useRef } from "react";
import { ThemeNode, RegionLayoutStyle, RegionGroupData } from "./types";
import { MOCK_NODES, REGION_META, simulateNodeTick } from "./mockData";
import { Header } from "./components/Header";
import { RegionGroup } from "./components/RegionGroup";
import { NodeDetailModal } from "./components/NodeDetailModal";

export function App() {
  const [layoutStyle, setLayoutStyle] = useState<RegionLayoutStyle>(() => {
    const saved = localStorage.getItem("nezha_live_layout");
    if (saved === "tower" || saved === "ring" || saved === "honeycomb" || saved === "matrix") {
      return saved;
    }
    return "tower";
  });

  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    return localStorage.getItem("nezha_live_demo") === "true";
  });

  const [nodes, setNodes] = useState<ThemeNode[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [sortBy, setSortBy] = useState<"default" | "cpu" | "mem" | "down" | "latency">("default");
  const [selectedNode, setSelectedNode] = useState<ThemeNode | null>(null);

  const [canManage, setCanManage] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [siteTitle, setSiteTitle] = useState("哪吒节点实况");

  const wsRef = useRef<WebSocket | null>(null);

  // Save layout preference
  useEffect(() => {
    localStorage.setItem("nezha_live_layout", layoutStyle);
  }, [layoutStyle]);

  // Save demo mode preference
  useEffect(() => {
    localStorage.setItem("nezha_live_demo", isDemoMode ? "true" : "false");
  }, [isDemoMode]);

  // Auth & Site info detection (Probe & Komari)
  useEffect(() => {
    // 1. Probe Auth
    fetch("/api/v1/auth/status", { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        if (data.authenticated) {
          setCanManage(true);
          setUsername(data.username || "admin");
        }
      })
      .catch(() => {
        // Fallback to Komari me check
        fetch("/api/me")
          .then((r) => r.ok ? r.json() : Promise.reject())
          .then((me) => {
            if (me.logged_in) {
              setCanManage(true);
              setUsername(me.username || "admin");
            }
          })
          .catch(() => {});
      });

    // Site info
    fetch("/api/public")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((info) => {
        if (info.site_name) {
          setSiteTitle(info.site_name);
        }
      })
      .catch(() => {});
  }, []);

  // Telemetry Connection & Dual-Protocol Adapter
  useEffect(() => {
    if (isDemoMode) {
      setNodes(MOCK_NODES);
      // Demo ticker: simulates live metric fluctuations
      const timer = setInterval(() => {
        setNodes((prev) => prev.map(simulateNodeTick));
      }, 1500);
      return () => clearInterval(timer);
    }

    let unmounted = false;
    let pollTimer: any = null;

    const setupProbeWS = () => {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/api/v1/client/ws`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const wsEvent = JSON.parse(e.data);
          if (wsEvent.type === "nodes_snapshot" && Array.isArray(wsEvent.data)) {
            setNodes(mapProbeNodes(wsEvent.data));
          } else if (wsEvent.type === "node_update" && wsEvent.data) {
            const updated = mapSingleProbeNode(wsEvent.data);
            setNodes((prev) => {
              const idx = prev.findIndex((n) => n.id === updated.id);
              if (idx >= 0) {
                const clone = [...prev];
                clone[idx] = { ...clone[idx], ...updated };
                return clone;
              }
              return [...prev, updated];
            });
          } else if (wsEvent.type === "node_offline" && wsEvent.data?.node_id) {
            setNodes((prev) =>
              prev.map((n) =>
                n.id === wsEvent.data.node_id ? { ...n, is_online: false, rate_down: 0, rate_up: 0 } : n
              )
            );
          } else if (wsEvent.type === "node_delete" && wsEvent.data?.node_id) {
            setNodes((prev) => prev.filter((n) => n.id !== wsEvent.data.node_id));
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
          if (data && typeof data === "object") {
            setNodes((prev) =>
              prev.map((n) => {
                const update = data[n.id];
                if (!update) return n;
                const cpuUsage = update.cpu?.usage ?? n.cpu;
                const memUsed = update.ram?.used ?? n.mem_used;
                const memTotal = update.ram?.total ?? n.mem_total;
                const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : n.mem;
                const rateDown = update.network?.rx_speed ?? n.rate_down;
                const rateUp = update.network?.tx_speed ?? n.rate_up;
                return {
                  ...n,
                  is_online: true,
                  cpu: cpuUsage,
                  mem: memPct,
                  mem_used: memUsed,
                  mem_total: memTotal,
                  rate_down: rateDown,
                  rate_up: rateUp,
                  uptime: update.uptime ?? n.uptime,
                };
              })
            );
          }
        } catch (_) {}
      };
    };

    const loadData = async () => {
      // 1. Try Probe native API
      try {
        const res = await fetch("/api/v1/nodes", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data?.nodes;
          if (Array.isArray(list) && list.length > 0 && !unmounted) {
            setNodes(mapProbeNodes(list));
            setupProbeWS();
            return;
          }
        }
      } catch (_) {}

      // 2. Try Komari REST API
      try {
        const res = await fetch("/api/nodes");
        if (res.ok) {
          const json = await res.json();
          const list = Array.isArray(json) ? json : json.data || [];
          if (Array.isArray(list) && list.length > 0 && !unmounted) {
            setNodes(mapKomariNodes(list));
            setupKomariWS();
            // Polling fallback
            pollTimer = setInterval(async () => {
              try {
                const r = await fetch("/api/nodes");
                if (r.ok) {
                  const j = await r.json();
                  const l = Array.isArray(j) ? j : j.data || [];
                  setNodes(mapKomariNodes(l));
                }
              } catch (_) {}
            }, 3000);
            return;
          }
        }
      } catch (_) {}

      // 3. If neither has live nodes or both failed, fallback to rich Mock Data
      if (!unmounted) {
        setIsDemoMode(true);
        setNodes(MOCK_NODES);
      }
    };

    loadData();

    return () => {
      unmounted = true;
      if (pollTimer) clearInterval(pollTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [isDemoMode]);

  // Keep selected node updated with live metrics
  useEffect(() => {
    if (selectedNode) {
      const fresh = nodes.find((n) => n.id === selectedNode.id);
      if (fresh) setSelectedNode(fresh);
    }
  }, [nodes]);

  const handleLogout = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
      await fetch("/api/logout");
    } catch (_) {}
    window.location.reload();
  };

  // Filter and Group nodes by Region
  const regionGroups = useMemo<RegionGroupData[]>(() => {
    // 1. Filter
    let filtered = nodes;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.region.toLowerCase().includes(q) ||
          (n.public_ip && n.public_ip.includes(q)) ||
          n.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (statusFilter === "online") {
      filtered = filtered.filter((n) => n.is_online);
    } else if (statusFilter === "offline") {
      filtered = filtered.filter((n) => !n.is_online);
    }

    // 2. Sort
    if (sortBy !== "default") {
      filtered = [...filtered].sort((a, b) => {
        if (sortBy === "cpu") return b.cpu - a.cpu;
        if (sortBy === "mem") return b.mem - a.mem;
        if (sortBy === "down") return b.rate_down - a.rate_down;
        if (sortBy === "latency") return (a.latency || 999) - (b.latency || 999);
        return 0;
      });
    }

    // 3. Group by Region
    const map = new Map<string, ThemeNode[]>();
    for (const node of filtered) {
      const reg = (node.region || "DEFAULT").toUpperCase();
      if (!map.has(reg)) map.set(reg, []);
      map.get(reg)!.push(node);
    }

    const groups: RegionGroupData[] = [];
    map.forEach((regionNodes, regKey) => {
      const meta = REGION_META[regKey] || {
        name: `${regKey} 地区`,
        flag: "🌐",
      };

      const onlineCount = regionNodes.filter((n) => n.is_online).length;
      const totalDownRate = regionNodes.reduce((acc, n) => acc + (n.is_online ? n.rate_down : 0), 0);
      const totalUpRate = regionNodes.reduce((acc, n) => acc + (n.is_online ? n.rate_up : 0), 0);

      const latencies = regionNodes.filter((n) => n.is_online && n.latency !== undefined);
      const avgLatency =
        latencies.length > 0
          ? latencies.reduce((acc, n) => acc + (n.latency || 0), 0) / latencies.length
          : 0;

      groups.push({
        regionKey: regKey,
        regionName: meta.name,
        flag: meta.flag,
        nodes: regionNodes,
        onlineCount,
        totalCount: regionNodes.length,
        totalDownRate,
        totalUpRate,
        avgLatency,
      });
    });

    return groups;
  }, [nodes, searchQuery, statusFilter, sortBy]);

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background Cyber Grid lines */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-35" />

      {/* Main Header */}
      <Header
        nodes={nodes}
        layoutStyle={layoutStyle}
        onChangeLayoutStyle={setLayoutStyle}
        searchQuery={searchQuery}
        onChangeSearchQuery={setSearchQuery}
        statusFilter={statusFilter}
        onChangeStatusFilter={setStatusFilter}
        sortBy={sortBy}
        onChangeSortBy={setSortBy}
        isDemoMode={isDemoMode}
        onToggleDemoMode={() => setIsDemoMode(!isDemoMode)}
        username={username}
        canManage={canManage}
        onLogout={handleLogout}
        siteTitle={siteTitle}
      />

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {regionGroups.length > 0 ? (
          regionGroups.map((group) => (
            <RegionGroup
              key={group.regionKey}
              group={group}
              globalLayoutStyle={layoutStyle}
              onSelectNode={setSelectedNode}
            />
          ))
        ) : (
          <div className="text-center py-20 rounded-2xl border border-slate-800 bg-slate-950/40 p-8">
            <p className="text-slate-400 font-mono text-sm">
              未找到匹配的服务器节点
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="mt-3 px-3 py-1.5 rounded-lg bg-slate-800 text-cyan-400 text-xs font-mono hover:bg-slate-700"
              >
                清除搜索条件
              </button>
            )}
          </div>
        )}
      </main>

      {/* Global Node Detail Modal */}
      <NodeDetailModal
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        canManage={canManage}
      />

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-900 bg-slate-950/90 py-5 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>哪吒节点实况 v4.0 · 地区多机防拥挤大屏</span>
          <span className="text-slate-600">
            原生兼容 Cyber Probe 与 Komari 监控协议
          </span>
        </div>
      </footer>
    </div>
  );
}

// Adapters for Probe & Komari data formats
function mapProbeNodes(list: any[]): ThemeNode[] {
  return list.map(mapSingleProbeNode);
}

function mapSingleProbeNode(n: any): ThemeNode {
  const sys = n.system || {};
  const net = n.network || {};
  const pings = (n.pings || []).map((p: any) => ({
    target: p.target,
    label: p.label || p.target,
    latency_ms: p.latency_ms || 0,
    packet_loss: p.packet_loss || 0,
    color: p.color,
  }));

  const avgLat =
    pings.length > 0
      ? pings.reduce((sum: number, p: any) => sum + p.latency_ms, 0) / pings.length
      : undefined;

  return {
    id: n.node_id || n.id || "node",
    name: n.name || "Server",
    region: n.region || "DEFAULT",
    tags: Array.isArray(n.tags) ? n.tags : [],
    is_online: n.is_online ?? true,
    last_seen: n.last_seen || Date.now() / 1000,
    cpu: n.cpu ?? sys.cpu_percent ?? 0,
    mem: n.mem ?? (sys.mem_total > 0 ? (sys.mem_used / sys.mem_total) * 100 : 0),
    mem_used: sys.mem_used || 0,
    mem_total: sys.mem_total || 0,
    disk: n.disk ?? sys.disk_percent ?? 0,
    disk_used: sys.disk_used || 0,
    disk_total: sys.disk_total || 0,
    swap: sys.swap_total > 0 ? (sys.swap_used / sys.swap_total) * 100 : 0,
    swap_used: sys.swap_used || 0,
    swap_total: sys.swap_total || 0,
    rate_down: n.rate_down ?? net.rate_download ?? 0,
    rate_up: n.rate_up ?? net.rate_upload ?? 0,
    traffic_down: net.bytes_recv || 0,
    traffic_up: net.bytes_sent || 0,
    load_1: sys.load_1,
    load_5: sys.load_5,
    load_15: sys.load_15,
    tcp_conn: net.tcp_established,
    udp_conn: net.udp_established,
    uptime: sys.uptime || 0,
    uptime_str: n.uptime_str || "",
    os: sys.os || "",
    kernel: sys.kernel || "",
    cpu_model: sys.cpu_model || "",
    cpu_cores: sys.cpu_count || 1,
    public_ip: n.public_ip || sys.public_ip,
    public_ipv6: n.public_ipv6 || sys.public_ipv6,
    provider: n.billing?.provider || "",
    latency: avgLat ? Math.round(avgLat) : undefined,
    packet_loss: pings[0]?.packet_loss ?? 0,
    pings,
    billing: n.billing
      ? {
          price: n.billing.price,
          currency: n.billing.currency,
          billing_cycle: n.billing.billing_cycle,
          expiry_date: n.billing.expiry_date,
          remaining_days: n.billing.remaining_days,
          remaining_value: n.billing.remaining_value,
        }
      : undefined,
  };
}

function mapKomariNodes(list: any[]): ThemeNode[] {
  return list.map((c: any) => {
    const memTotal = c.mem_total || c.system?.memory_total || 0;
    const diskTotal = c.disk_total || c.system?.disk_total || 0;
    const isOnline = c.status === 1 || c.status === "online";

    return {
      id: c.uuid || c.id || "node",
      name: c.name || "Server",
      region: c.region || "DEFAULT",
      tags: c.tags ? (typeof c.tags === "string" ? c.tags.split(",") : c.tags) : [],
      is_online: isOnline,
      last_seen: Date.now() / 1000,
      cpu: 0,
      mem: 0,
      mem_used: 0,
      mem_total: memTotal,
      disk: 0,
      disk_used: 0,
      disk_total: diskTotal,
      rate_down: 0,
      rate_up: 0,
      traffic_down: 0,
      traffic_up: 0,
      uptime: 0,
      os: c.os || c.system?.os || "",
      kernel: c.kernel_version || c.system?.kernel_version || "",
      cpu_model: c.cpu_name || c.system?.cpu_name || "",
      cpu_cores: c.cpu_cores || c.system?.cpu_cores || 1,
      public_ip: c.public_ip || c.ip,
      provider: c.provider,
    };
  });
}

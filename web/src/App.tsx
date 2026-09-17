import React, { useEffect, useState, useMemo, useRef } from "react";
import { NodeState, SystemSummary, WSEvent } from "./types";
import { Header } from "./components/Header";
import { ServerCard } from "./components/ServerCard";
import { ServerTable } from "./components/ServerTable";
import { NodeDetailView } from "./components/NodeDetailView";
import { AddNodeModal } from "./components/AddNodeModal";
import { AdminModal } from "./components/AdminModal";
import { LoginScreen } from "./components/LoginScreen";
import { ChangePasswordModal } from "./components/ChangePasswordModal";
import { useAuth } from "./hooks/useAuth";
import { Button } from "@heroui/react";
import { Server, Activity, ShieldCheck, Terminal, Cpu } from "lucide-react";
import { BlurFade } from "./components/ui/BlurFade";
import { Ripple } from "./components/ui/Ripple";
import { AnimatedShinyText } from "./components/ui/AnimatedShinyText";

export function App() {
  const [theme, setTheme] = useState<"blueprint" | "dark">(() => {
    const saved = localStorage.getItem("cyber_probe_theme");
    return saved === "blueprint" || saved === "dark" ? saved : "dark";
  });

  const isBlueprint = theme === "blueprint";

  useEffect(() => {
    localStorage.setItem("cyber_probe_theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("blueprint");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("blueprint");
      document.documentElement.setAttribute("data-theme", "light");
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "blueprint" : "dark"));
  };

  const auth = useAuth();

  const [nodes, setNodes] = useState<Map<string, NodeState>>(new Map());
  // 服务端此刻会下发的 probe-agent 版本，用作「这台机器是不是旧的」的基准。
  // undefined 表示还没取到（或服务端没返回），此时看板不做任何版本判断。
  const [latestAgentVersion, setLatestAgentVersion] = useState<string | undefined>(undefined);
  const [wsConnected, setWsConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [selectedNode, setSelectedNode] = useState<NodeState | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Guests may opt into the public read-only view instead of logging in.
  const [guestMode, setGuestMode] = useState(false);

  // Gate everything behind the login screen until we know the session state.
  const showLogin = auth.ready && !auth.authenticated && !(auth.publicView && guestMode);

  // Admin surfaces stay hidden for anonymous viewers.
  const canManage = auth.authenticated;

  // Force the rotation dialog while the bootstrap password is still in use.
  useEffect(() => {
    if (auth.authenticated && auth.mustChangePassword) {
      setIsPasswordModalOpen(true);
    }
  }, [auth.authenticated, auth.mustChangePassword]);

  // Close admin surfaces if the session ends underneath us.
  useEffect(() => {
    if (!auth.authenticated) {
      setIsAddModalOpen(false);
      setIsAdminModalOpen(false);
    }
  }, [auth.authenticated]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const fetchNodes = () => {
    fetch("/api/v1/nodes")
      .then((r) => r.json())
      .then((data) => {
        if (data.nodes && Array.isArray(data.nodes)) {
          setNodes((prev) => {
            const next = new Map(prev);
            data.nodes.forEach((n: NodeState) => next.set(n.node_id, n));
            return next;
          });
        }
        // 与节点列表同一个响应，因此不额外发请求。只有这个 REST 接口能给出
        // 基准版本：WS 快照里每个节点自带版本，但「最新版是什么」是全局信息。
        // 老服务端不返回该字段，此时保持 undefined，看板不下任何版本结论。
        if (typeof data.latest_agent_version === "string") {
          setLatestAgentVersion(data.latest_agent_version);
        }
      })
      .catch(() => {});
  };

  // Connect WebSocket to Hub. Held back until the session state is known so a
  // private-mode server does not reject the stream and trigger a reconnect loop.
  useEffect(() => {
    if (!auth.ready || showLogin) return;

    let isSubscribed = true;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/api/v1/client/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isSubscribed) return;
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!isSubscribed) return;
        try {
          const wsEvent: WSEvent = JSON.parse(event.data);
          if (wsEvent.type === "nodes_snapshot") {
            const list: NodeState[] = wsEvent.data || [];
            setNodes(new Map(list.map((n) => [n.node_id, n])));
            setSelectedNode((current) => list.find((n) => n.node_id === current?.node_id) || null);
          } else if (wsEvent.type === "node_update") {
            const node: NodeState = wsEvent.data;
            setNodes((prev) => {
              const next = new Map(prev);
              next.set(node.node_id, node);
              return next;
            });
            // Also update selected node if currently viewing
            setSelectedNode((current) => (current?.node_id === node.node_id ? node : current));
          } else if (wsEvent.type === "node_offline") {
            const node: NodeState = wsEvent.data;
            setNodes((prev) => {
              const next = new Map(prev);
              const existing = next.get(node.node_id);
              if (existing) {
                next.set(node.node_id, {
                  ...existing,
                  is_online: false,
                  rate_down: 0,
                  rate_up: 0,
                });
              }
              return next;
            });
            setSelectedNode((current) =>
              current?.node_id === node.node_id
                ? { ...current, is_online: false, rate_down: 0, rate_up: 0 }
                : current
            );
          } else if (wsEvent.type === "node_delete") {
            const id = wsEvent.data?.node_id;
            if (id) {
              setNodes((prev) => {
                const next = new Map(prev);
                next.delete(id);
                return next;
              });
              setSelectedNode((current) => (current?.node_id === id ? null : current));
            }
          }
        } catch (e) {
          console.error("Failed to parse websocket message:", e);
        }
      };

      ws.onclose = () => {
        if (!isSubscribed) return;
        setWsConnected(false);
        // Exponential backoff reconnect
        reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
      };

      ws.onerror = (e) => {
        console.warn("WebSocket encounter error, reconnecting soon...", e);
      };
    }

    connect();

    // Fallback polling initial fetch in case WS takes a moment
    fetch("/api/v1/nodes")
      .then((r) => r.json())
      .then((data) => {
        if (data.nodes && Array.isArray(data.nodes)) {
          setNodes((prev) => {
            const next = new Map(prev);
            data.nodes.forEach((n: NodeState) => next.set(n.node_id, n));
            return next;
          });
        }
      })
      .catch(() => {});

    return () => {
      isSubscribed = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [auth.ready, showLogin]);

  const nodesList = useMemo(() => Array.from(nodes.values()), [nodes]);

  // Extract unique regions
  const regions = useMemo(() => {
    const set = new Set<string>();
    nodesList.forEach((n) => {
      if (n.region) set.add(n.region);
    });
    return Array.from(set).sort();
  }, [nodesList]);

  // Compute host counts per region for badges
  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    nodesList.forEach((n) => {
      if (n.region) {
        counts[n.region] = (counts[n.region] || 0) + 1;
      }
    });
    return counts;
  }, [nodesList]);

  // Compute cluster summary
  const summary: SystemSummary = useMemo(() => {
    const total = nodesList.length;
    let online = 0;
    let rateDown = 0;
    let rateUp = 0;
    let cpuSum = 0;
    let memSum = 0;

    nodesList.forEach((n) => {
      if (n.is_online) {
        online++;
        rateDown += n.rate_down || 0;
        rateUp += n.rate_up || 0;
        cpuSum += n.cpu || 0;
        memSum += n.mem || 0;
      }
    });

    return {
      total_nodes: total,
      online_nodes: online,
      offline_nodes: total - online,
      total_rate_down: rateDown,
      total_rate_up: rateUp,
      avg_cpu: online > 0 ? cpuSum / online : 0,
      avg_mem: online > 0 ? memSum / online : 0,
    };
  }, [nodesList]);

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    return nodesList.filter((n) => {
      // Region filter
      if (selectedRegion !== "ALL" && n.region !== selectedRegion) {
        return false;
      }
      // Search query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchName = n.name.toLowerCase().includes(q);
        const matchID = n.node_id.toLowerCase().includes(q);
        const matchOS = (n.system.os || "").toLowerCase().includes(q);
        const matchRegion = (n.region || "").toLowerCase().includes(q);
        if (!matchName && !matchID && !matchOS && !matchRegion) return false;
      }
      return true;
    }).sort((a, b) => {
      // Online first, then alphabetical
      if (a.is_online !== b.is_online) {
        return a.is_online ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [nodesList, selectedRegion, searchQuery]);

  const handleDeleteNode = async (nodeID: string) => {
    try {
      const res = await fetch(`/api/v1/nodes/${encodeURIComponent(nodeID)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setNodes((prev) => {
          const next = new Map(prev);
          next.delete(nodeID);
          return next;
        });
        setSelectedNode(null);
      }
    } catch (e) {
      console.error("Failed to delete node:", e);
    }
  };

  // Initial session probe: avoid flashing the dashboard or the login form.
  if (!auth.ready) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        isBlueprint ? "blueprint-grid bg-slate-100/50" : "cyber-grid bg-zinc-950"
      }`}>
        <div className={`flex items-center gap-3 font-sans text-xs ${
          isBlueprint ? "text-slate-500" : "text-zinc-400"
        }`}>
          <Activity className="h-4 w-4 animate-pulse text-indigo-500" />
          {/* Short cycle: the probe usually resolves in well under a second, so
              the default 8s sweep would never be seen. */}
          <AnimatedShinyText
            duration="2.2s"
            shimmerColor={isBlueprint ? "via-slate-900/45" : "via-white/85"}
          >
            正在校验会话...
          </AnimatedShinyText>
        </div>
      </div>
    );
  }

  if (showLogin) {
    return (
      <div className={`min-h-screen ${
        isBlueprint ? "blueprint-grid bg-slate-100/50" : "cyber-grid bg-zinc-950"
      }`}>
        <LoginScreen
          onLogin={auth.login}
          theme={theme}
          allowPublicView={auth.publicView}
          onContinueAsGuest={() => setGuestMode(true)}
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${
      isBlueprint
        ? "blueprint-grid text-slate-800 bg-slate-100/50 selection:bg-indigo-500/20 selection:text-indigo-900"
        : "cyber-grid text-zinc-100 bg-zinc-950 selection:bg-indigo-500/30 selection:text-indigo-200"
    }`}>
      {selectedNode ? (
        /* Detailed Comprehensive Node View matching user screenshots */
        <NodeDetailView
          node={selectedNode}
          nodesList={filteredNodes}
          onBack={() => setSelectedNode(null)}
          onSelectNode={setSelectedNode}
          theme={theme}
          onToggleTheme={toggleTheme}
          latestAgentVersion={latestAgentVersion}
        />
      ) : (
        <>
          {/* Top Header */}
          <Header
            summary={summary}
            wsConnected={wsConnected}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedRegion={selectedRegion}
            onRegionChange={setSelectedRegion}
            regions={regions}
            regionCounts={regionCounts}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenAdminModal={() => setIsAdminModalOpen(true)}
            theme={theme}
            onToggleTheme={toggleTheme}
            canManage={canManage}
            username={auth.username}
            onLogout={auth.logout}
            onOpenPasswordModal={() => setIsPasswordModalOpen(true)}
            onRequestLogin={() => setGuestMode(false)}
          />

          {/* Main Content Area */}
          <main className="flex-1 mx-auto max-w-[1600px] w-full px-3.5 py-4 sm:px-6 sm:py-6 lg:px-8">
            {filteredNodes.length > 0 ? (
              viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
                  {filteredNodes.map((node, i) => (
                    <BlurFade
                      key={node.node_id}
                      // Cap the stagger so a large fleet doesn't leave the last
                      // cards waiting seconds to appear.
                      delay={Math.min(i * 0.05, 0.5)}
                      yOffset={10}
                    >
                      <ServerCard
                        node={node}
                        onSelect={setSelectedNode}
                        theme={theme}
                        latestAgentVersion={latestAgentVersion}
                      />
                    </BlurFade>
                  ))}
                </div>
              ) : (
                <ServerTable
                  nodes={filteredNodes}
                  onSelect={setSelectedNode}
                  theme={theme}
                  latestAgentVersion={latestAgentVersion}
                />
              )
            ) : (
              <div className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-12 text-center ${
                isBlueprint ? "border-slate-200/90 bg-white/70 text-slate-600 shadow-sm" : "border-zinc-800 bg-zinc-900/30 text-zinc-200"
              }`}>
                {/* Breathing rings hint that the hub is listening for agents */}
                <Ripple className="opacity-70" />

                <div className={`relative flex h-14 w-14 items-center justify-center rounded-2xl border mb-4 ${
                  isBlueprint ? "bg-slate-100 border-slate-200 text-slate-500" : "bg-zinc-800/60 border-zinc-700/40 text-zinc-400"
                }`}>
                  <Server className="h-7 w-7" />
                </div>
                <h3 className={`relative text-base font-semibold ${isBlueprint ? "text-slate-900" : "text-zinc-200"}`}>
                  {nodesList.length === 0 ? (
                    /* Only while waiting for a first agent: the sweep reinforces
                       the Ripple behind it ("the hub is listening"). A filter
                       miss is a settled result, so it stays static. */
                    <AnimatedShinyText
                      duration="4s"
                      shimmerColor={isBlueprint ? "via-slate-900/35" : "via-white/70"}
                    >
                      暂无接入的主机节点
                    </AnimatedShinyText>
                  ) : (
                    "未找到匹配的主机"
                  )}
                </h3>
                <p className={`relative mt-1 max-w-md text-xs font-sans ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                  {nodesList.length === 0
                    ? canManage
                      ? "当前暂无 Agent 探针向服务端 Hub 上报数据。点击下方按钮一键部署第一台探针。"
                      : "当前暂无 Agent 探针向服务端 Hub 上报数据。"
                    : "没有符合当前搜索关键字或地区筛选条件的主机节点。"}
                </p>
                {nodesList.length === 0 && canManage && (
                  <Button
                    variant="primary"
                    size="sm"
                    onPress={() => setIsAddModalOpen(true)}
                    className="relative mt-5 gap-2 rounded-xl font-sans text-xs font-medium shadow-lg shadow-indigo-600/25"
                  >
                    <Terminal className="h-4 w-4" />
                    <span>一键部署首台探针</span>
                  </Button>
                )}
              </div>
            )}
          </main>
        </>
      )}

      {/* Footer */}
      <footer className={`border-t py-6 text-center text-xs font-mono mt-auto transition-colors ${
        isBlueprint ? "border-slate-200 bg-white/80 text-slate-500" : "border-zinc-900 bg-zinc-950 text-zinc-400"
      }`}>
        <div className="mx-auto max-w-[1600px] px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            CYBER PROBE · 高性能自研探针系统 (Go + Gin + SQLite + React + uPlot)
          </div>
          <div className={`flex items-center gap-4 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
            <span>RAM: 5-10MB</span>
            <span>·</span>
            <span>CPU: ~0%</span>
            <span>·</span>
            <span>Outbound WSS</span>
          </div>
        </div>
      </footer>

      {/* Add / Deploy Node Modal. The install command embeds an agent token, so
          it stays behind a session even though the dialog itself is inert. */}
      <AddNodeModal
        isOpen={canManage && isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        theme={theme}
      />

      {/* Admin Management Modal. Gated on `canManage` as well as the open flag so
          a logout (or an expired session) closes it instead of leaving a console
          on screen whose every request the server would now reject. */}
      <AdminModal
        isOpen={canManage && isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        nodes={Array.from(nodes.values())}
        theme={theme}
        onRefreshNodes={fetchNodes}
      />

      {/* Password rotation. Not dismissable while the bootstrap password stands. */}
      <ChangePasswordModal
        isOpen={canManage && isPasswordModalOpen}
        forced={auth.mustChangePassword}
        onClose={() => setIsPasswordModalOpen(false)}
        onSubmit={auth.changePassword}
        theme={theme}
      />
    </div>
  );
}

export default App;

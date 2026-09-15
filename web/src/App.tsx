import React, { useEffect, useState, useMemo, useRef } from "react";
import { NodeState, SystemSummary, WSEvent } from "./types";
import { Header } from "./components/Header";
import { ServerCard } from "./components/ServerCard";
import { ServerTable } from "./components/ServerTable";
import { NodeDetailView } from "./components/NodeDetailView";
import { AddNodeModal } from "./components/AddNodeModal";
import { AdminModal } from "./components/AdminModal";
import { LoginModal } from "./components/LoginModal";
import { Button } from "@heroui/react";
import { Server, Activity, ShieldCheck, Terminal, Cpu } from "lucide-react";
import { BlurFade } from "./components/ui/BlurFade";
import { Ripple } from "./components/ui/Ripple";

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

  const [nodes, setNodes] = useState<Map<string, NodeState>>(new Map());
  const [wsConnected, setWsConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [selectedNode, setSelectedNode] = useState<NodeState | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  // Auth state. `isAuthed` starts false so admin controls stay hidden until the
  // server confirms a session, rather than flashing in and disappearing.
  const [isAuthed, setIsAuthed] = useState(false);
  const [adminUser, setAdminUser] = useState<string | null>(null);
  const [passwordIsTemp, setPasswordIsTemp] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  // Set when a protected action was attempted while logged out, so the login
  // modal can reopen the intended target once authentication succeeds.
  const [pendingAdminOpen, setPendingAdminOpen] = useState(false);

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
      })
      .catch(() => {});
  };

  // Ask the server who we are. The dashboard renders either way — this only
  // decides whether the admin controls are offered.
  const refreshAuth = () => {
    fetch("/api/v1/auth/status", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        setIsAuthed(Boolean(data.authenticated));
        setAdminUser(data.username || null);
        setPasswordIsTemp(Boolean(data.password_is_temp));
      })
      .catch(() => {
        setIsAuthed(false);
        setAdminUser(null);
      });
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  // Admin entry point: signed-in users go straight in, everyone else gets the
  // login dialog and is forwarded into the console once it succeeds.
  const handleRequestAdmin = () => {
    if (isAuthed) {
      setIsAdminModalOpen(true);
      return;
    }
    setPendingAdminOpen(true);
    setIsLoginModalOpen(true);
  };

  const handleLoginSuccess = () => {
    setIsLoginModalOpen(false);
    refreshAuth();
    if (pendingAdminOpen) {
      setPendingAdminOpen(false);
      setIsAdminModalOpen(true);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Even if the call fails, drop local admin state so the UI stops
      // offering actions the server will now reject.
    }
    setIsAdminModalOpen(false);
    setIsAuthed(false);
    setAdminUser(null);
    setPasswordIsTemp(false);
  };

  // Connect WebSocket to Hub
  useEffect(() => {
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
            setNodes((prev) => {
              const next = new Map(prev);
              list.forEach((n) => next.set(n.node_id, n));
              return next;
            });
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
  }, []);

  const nodesList = useMemo(() => Array.from(nodes.values()), [nodes]);

  // Extract unique regions
  const regions = useMemo(() => {
    const set = new Set<string>();
    nodesList.forEach((n) => {
      if (n.region) set.add(n.region);
    });
    return Array.from(set).sort();
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
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenAdminModal={handleRequestAdmin}
            isAuthed={isAuthed}
            adminUser={adminUser}
            onLogout={handleLogout}
            theme={theme}
            onToggleTheme={toggleTheme}
          />

          {/* Main Content Area */}
          <main className="flex-1 mx-auto max-w-[1600px] w-full px-4 py-8 sm:px-6 lg:px-8">
            {filteredNodes.length > 0 ? (
              viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
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
                      />
                    </BlurFade>
                  ))}
                </div>
              ) : (
                <ServerTable
                  nodes={filteredNodes}
                  onSelect={setSelectedNode}
                  theme={theme}
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
                  {nodesList.length === 0 ? "暂无接入的主机节点" : "未找到匹配的主机"}
                </h3>
                <p className={`relative mt-1 max-w-md text-xs font-sans ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                  {nodesList.length === 0
                    ? "当前暂无 Agent 探针向服务端 Hub 上报数据。点击下方按钮一键部署第一台探针。"
                    : "没有符合当前搜索关键字或地区筛选条件的主机节点。"}
                </p>
                {nodesList.length === 0 && (
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

      {/* Add / Deploy Node Modal */}
      <AddNodeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        theme={theme}
      />

      {/* Admin Sign-in Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => {
          setIsLoginModalOpen(false);
          setPendingAdminOpen(false);
        }}
        onSuccess={handleLoginSuccess}
        theme={theme}
      />

      {/* Admin Management Modal. Gated on `isAuthed` as well as the open flag so
          a logout (or an expired session) closes it instead of leaving a console
          on screen whose every request the server would now reject. */}
      <AdminModal
        isOpen={isAdminModalOpen && isAuthed}
        onClose={() => setIsAdminModalOpen(false)}
        nodes={Array.from(nodes.values())}
        theme={theme}
        onRefreshNodes={fetchNodes}
        passwordIsTemp={passwordIsTemp}
        onPasswordChanged={handleLogout}
      />
    </div>
  );
}

export default App;

import React, { useEffect, useState, useMemo, useRef } from "react";
import { NodeState, SystemSummary, WSEvent } from "./types";
import { Header } from "./components/Header";
import { ServerCard } from "./components/ServerCard";
import { ServerTable } from "./components/ServerTable";
import { ServerDetailModal } from "./components/ServerDetailModal";
import { NodeDetailView } from "./components/NodeDetailView";
import { AddNodeModal } from "./components/AddNodeModal";
import { AdminModal } from "./components/AdminModal";
import { Server, Activity, ShieldCheck, Terminal, Cpu } from "lucide-react";

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
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("blueprint");
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
            onOpenAdminModal={() => setIsAdminModalOpen(true)}
            theme={theme}
            onToggleTheme={toggleTheme}
          />

          {/* Main Content Area */}
          <main className="flex-1 mx-auto max-w-[1600px] w-full px-4 py-8 sm:px-6 lg:px-8">
            {filteredNodes.length > 0 ? (
              viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
                  {filteredNodes.map((node) => (
                    <ServerCard
                      key={node.node_id}
                      node={node}
                      onSelect={setSelectedNode}
                      theme={theme}
                    />
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
              <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center ${
                isBlueprint ? "border-slate-300 bg-white/70 text-slate-600 shadow-sm" : "border-zinc-800 bg-zinc-900/30 text-zinc-200"
              }`}>
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border mb-4 ${
                  isBlueprint ? "bg-slate-100 border-slate-200 text-slate-500" : "bg-zinc-800/60 border-zinc-700/40 text-zinc-400"
                }`}>
                  <Server className="h-7 w-7" />
                </div>
                <h3 className={`text-base font-semibold ${isBlueprint ? "text-slate-900" : "text-zinc-200"}`}>
                  No Nodes Found
                </h3>
                <p className={`mt-1 max-w-md text-xs font-mono ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                  {nodesList.length === 0
                    ? "No server probe agents are currently reporting to the Hub. Click 'Add Node' to deploy an agent."
                    : "No nodes match your current search or region filter criteria."}
                </p>
                {nodesList.length === 0 && (
                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="mt-5 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-mono font-medium text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/25"
                  >
                    <Terminal className="h-4 w-4" />
                    <span>Deploy First Agent</span>
                  </button>
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
      />

      {/* Admin Management Modal */}
      <AdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        nodes={Array.from(nodes.values())}
        theme={theme}
        onRefreshNodes={fetchNodes}
      />
    </div>
  );
}

export default App;

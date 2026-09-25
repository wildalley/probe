import React, { useEffect, useState, useMemo, useRef } from "react";
import { ColorMode, NodeState, SystemSummary, ThemeMode, ThemePreset, WSEvent } from "./types";
import { BtopTerminalView } from "./components/BtopTerminalView";
import { AddNodeModal } from "./components/AddNodeModal";
import { AdminModal } from "./components/AdminModal";
import { LoginScreen } from "./components/LoginScreen";
import { ChangePasswordModal } from "./components/ChangePasswordModal";
import { ThemeManagerModal } from "./components/ThemeManagerModal";
import { useAuth } from "./hooks/useAuth";
import { Activity } from "lucide-react";
import { AnimatedShinyText } from "./components/ui/AnimatedShinyText";

export function App() {
  const isAdminRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");

  // 1. Theme Preset: btop++ (Official Native Terminal View)
  const [themePreset, setThemePreset] = useState<ThemePreset>("btop");

  // 2. Color Mode: "light" | "dark" | "system"
  const [colorMode, setColorMode] = useState<ColorMode>(() => {
    const savedMode = localStorage.getItem("cyber_probe_color_mode");
    if (savedMode === "light" || savedMode === "dark" || savedMode === "system") {
      return savedMode;
    }
    return "dark";
  });

  // 3. System preference listener for real-time dark/light syncing
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // 4. Effective dark mode calculation
  const effectiveDark = colorMode === "system" ? systemPrefersDark : colorMode === "dark";

  // 5. Derived active ThemeMode
  const theme: ThemeMode = useMemo(() => {
    return effectiveDark ? "btop" : "btop-light";
  }, [effectiveDark]);

  const isBtopLight = theme === "btop-light";
  const isBtopDark = theme === "btop";
  const isBtop = true;
  const isDark = effectiveDark;

  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("cyber_probe_theme_preset", themePreset);
  }, [themePreset]);

  useEffect(() => {
    localStorage.setItem("cyber_probe_color_mode", colorMode);
  }, [colorMode]);

  useEffect(() => {
    localStorage.setItem("cyber_probe_theme", theme);
    document.documentElement.classList.remove("dark", "blueprint", "blueprint-dark", "btop", "btop-light");
    if (theme === "btop-light") {
      document.documentElement.classList.add("btop-light");
      document.documentElement.setAttribute("data-theme", "btop-light");
    } else {
      document.documentElement.classList.add("dark", "btop");
      document.documentElement.setAttribute("data-theme", "btop");
    }
  }, [theme]);

  const cycleColorMode = () => {
    setColorMode((prev) => {
      if (prev === "light") return "dark";
      if (prev === "dark") return "system";
      return "light";
    });
  };

  const toggleTheme = () => {
    setColorMode((prev) => {
      const isCurrentlyDark = prev === "system" ? systemPrefersDark : prev === "dark";
      return isCurrentlyDark ? "light" : "dark";
    });
  };

  const handleSelectTheme = (newTheme: ThemeMode) => {
    if (newTheme === "blueprint") {
      setThemePreset("blueprint");
      setColorMode("light");
    } else if (newTheme === "blueprint-dark") {
      setThemePreset("blueprint");
      setColorMode("dark");
    } else if (newTheme === "btop-light") {
      setThemePreset("btop");
      setColorMode("light");
    } else if (newTheme === "btop") {
      setThemePreset("btop");
      setColorMode("dark");
    } else if (newTheme === "dark") {
      setThemePreset("blueprint");
      setColorMode("dark");
    }
  };

  const auth = useAuth();

  const [nodes, setNodes] = useState<Map<string, NodeState>>(new Map());
  // 服务端此刻会下发的 probe-agent 版本，用作「这台机器是不是旧的」的基准。
  // undefined 表示还没取到（或服务端没返回），此时看板不做任何版本判断。
  const [latestAgentVersion, setLatestAgentVersion] = useState<string | undefined>(undefined);
  const [wsConnected, setWsConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
    const saved = localStorage.getItem("cyber_probe_view_mode");
    return saved === "table" ? "table" : "grid";
  });

  useEffect(() => {
    localStorage.setItem("cyber_probe_view_mode", viewMode);
  }, [viewMode]);

  const handleSelectThemePreset = (preset: ThemePreset) => {
    setThemePreset(preset);
  };
  const [selectedNode, setSelectedNode] = useState<NodeState | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Guests may opt into the public read-only view instead of logging in.
  const [guestMode, setGuestMode] = useState(false);

  // Gate everything behind the login screen until we know the session state.
  const showLogin = !isAdminRoute && auth.ready && !auth.authenticated && !(auth.publicView && guestMode);

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
        isBtopLight ? "btop-light-grid bg-[#ebe7ee]" : "btop-grid bg-[#06080d]"
      }`}>
        <div className={`flex items-center gap-3 font-mono text-xs ${
          isBtopLight ? "text-slate-600" : "text-slate-400"
        }`}>
          <Activity className="h-4 w-4 animate-pulse text-cyan-400" />
          <AnimatedShinyText
            duration="2.2s"
            shimmerColor={isBtopLight ? "via-slate-900/45" : "via-cyan-300/85"}
          >
            正在校验会话...
          </AnimatedShinyText>
        </div>
      </div>
    );
  }

  // Dedicated Admin Console Route (/admin)
  if (isAdminRoute) {
    if (!auth.authenticated) {
      return (
        <div className={`min-h-screen ${
          isBtopLight ? "btop-light-grid bg-[#ebe7ee]" : "btop-grid bg-[#06080d]"
        }`}>
          <LoginScreen
            onLogin={auth.login}
            theme={theme}
            onSelectTheme={handleSelectTheme}
            onToggleTheme={toggleTheme}
            allowPublicView={true}
            guestButtonLabel="返回监控主页"
            onContinueAsGuest={() => {
              window.location.href = "/?_t=" + Date.now();
            }}
          />
        </div>
      );
    }

    return (
      <div className={`min-h-screen w-full flex flex-col font-sans transition-colors ${
        isBtopLight ? "bg-slate-100 text-slate-900" : "bg-[#06080d] text-zinc-100"
      }`}>
        <AdminModal
          isOpen={true}
          isStandalone={true}
          onClose={() => {
            window.location.href = "/?_t=" + Date.now();
          }}
          nodes={Array.from(nodes.values())}
          theme={theme}
          onRefreshNodes={fetchNodes}
          currentPreset={themePreset}
          onSelectPreset={handleSelectThemePreset}
          colorMode={colorMode}
          onSelectColorMode={setColorMode}
          onToggleTheme={toggleTheme}
          onLogout={auth.logout}
          onOpenPasswordModal={() => setIsPasswordModalOpen(true)}
          username={auth.username}
        />
        <ChangePasswordModal
          isOpen={isPasswordModalOpen}
          forced={auth.mustChangePassword}
          onClose={() => setIsPasswordModalOpen(false)}
          onSubmit={auth.changePassword}
          theme={theme}
        />
      </div>
    );
  }

  if (showLogin) {
    return (
      <div className={`min-h-screen ${
        isBtopLight ? "btop-light-grid bg-[#ebe7ee]" : "btop-grid bg-[#06080d]"
      }`}>
        <LoginScreen
          onLogin={auth.login}
          theme={theme}
          onSelectTheme={handleSelectTheme}
          onToggleTheme={toggleTheme}
          allowPublicView={auth.publicView}
          onContinueAsGuest={() => setGuestMode(true)}
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isBtopLight ? "bg-[#ebe7ee] text-[#2b2735]" : "bg-[#0c0e17] text-[#e2e8f0]"}`}>
      <BtopTerminalView
        nodes={filteredNodes.length > 0 ? filteredNodes : Array.from(nodes.values())}
        theme={theme}
        onSelectTheme={handleSelectTheme}
        onToggleTheme={toggleTheme}
        onOpenAdminModal={() => {
          window.location.href = "/admin";
        }}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenPasswordModal={() => setIsPasswordModalOpen(true)}
        onOpenThemeModal={() => setIsThemeModalOpen(true)}
        canManage={canManage}
        username={auth.username}
        onLogout={auth.logout}
        latestAgentVersion={latestAgentVersion}
      />

      {/* Global Admin Modals accessible from btop terminal menu */}
      <AdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        nodes={Array.from(nodes.values())}
        theme={theme}
        onRefreshNodes={fetchNodes}
        currentPreset={themePreset}
        onSelectPreset={handleSelectThemePreset}
        colorMode={colorMode}
        onSelectColorMode={setColorMode}
        onToggleTheme={toggleTheme}
        onLogout={auth.logout}
        onOpenPasswordModal={() => setIsPasswordModalOpen(true)}
        username={auth.username}
      />
      <AddNodeModal
        isOpen={canManage && isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        theme={theme}
      />
      <ChangePasswordModal
        isOpen={canManage && isPasswordModalOpen}
        forced={auth.mustChangePassword}
        onClose={() => setIsPasswordModalOpen(false)}
        onSubmit={auth.changePassword}
        theme={theme}
      />
      <ThemeManagerModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        currentPreset={themePreset}
        onSelectPreset={handleSelectThemePreset}
        colorMode={colorMode}
        onSelectColorMode={setColorMode}
        theme={theme}
        canManage={canManage}
      />
    </div>
  );
}

export default App;

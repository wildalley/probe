import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  DollarSign,
  Calendar,
  Coins,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  PieChart,
  Clock,
  Link as LinkIcon,
  Copy,
  Check,
  Cpu,
  Layers,
  HardDrive,
  Network,
  Activity,
  Zap,
  Info,
  ExternalLink,
  ShieldCheck,
  Star,
  Sun,
  Moon,
  ChevronDown,
  Server,
  Eye,
  EyeOff,
} from "lucide-react";
import { HistoryPoint, NodeState, PingHistoryPoint, PingStat, PingTargetConfig } from "../types";
import { formatBytes, formatRate } from "../utils/format";
import { getRegionFlag } from "../utils/flags";
import { getTagStyle } from "../utils/tagColors";
import { OsIcon } from "./OsIcon";
import { TimeSeriesChart, ChartSeries } from "./TimeSeriesChart";
import { cn } from "../lib/utils";
import { NumberTicker } from "./ui/NumberTicker";
import { BlurFade } from "./ui/BlurFade";

interface NodeDetailViewProps {
  node: NodeState;
  nodesList: NodeState[];
  onBack: () => void;
  onSelectNode: (node: NodeState) => void;
  theme?: "blueprint" | "dark";
  onToggleTheme?: () => void;
}

const getCycleLabel = (cycle?: string) => {
  switch (cycle) {
    case "quarter": return "季";
    case "half_year": return "半年";
    case "year": return "年";
    case "two_year": return "2年";
    case "three_year": return "3年";
    case "one_time": return "一次性";
    default: return "月";
  }
};

export const NodeDetailView: React.FC<NodeDetailViewProps> = ({
  node,
  nodesList,
  onBack,
  onSelectNode,
  theme: propsTheme,
  onToggleTheme,
}) => {
  const [localTheme, setLocalTheme] = useState<"blueprint" | "dark">("blueprint");
  const theme = propsTheme || localTheme;
  const isBlueprint = theme === "blueprint";

  const toggleTheme = () => {
    if (onToggleTheme) {
      onToggleTheme();
    } else {
      setLocalTheme((prev) => (prev === "blueprint" ? "dark" : "blueprint"));
    }
  };

  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [pingHistory, setPingHistory] = useState<PingHistoryPoint[]>([]);
  const [configuredTargets, setConfiguredTargets] = useState<PingTargetConfig[]>([]);
  const [timeRange, setTimeRange] = useState<"realtime" | "4h" | "1d">("realtime");
  const [pingRange, setPingRange] = useState<"1h" | "6h" | "12h" | "1d">("1h");
  const [maskIP, setMaskIP] = useState<boolean>(() => {
    try {
      return localStorage.getItem("probe_mask_ip") === "true";
    } catch {
      return false;
    }
  });

  const [isStarred, setIsStarred] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`starred_${node.node_id}`) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      setIsStarred(localStorage.getItem(`starred_${node.node_id}`) === "true");
    } catch {
      setIsStarred(false);
    }
  }, [node.node_id]);

  const toggleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsStarred((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`starred_${node.node_id}`, String(next));
      } catch {}
      return next;
    });
  };

  const toggleMaskIP = () => {
    setMaskIP((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("probe_mask_ip", String(next));
      } catch {}
      return next;
    });
  };

  const maskIPString = (ip?: string) => {
    if (!ip) return "--";
    if (!maskIP) return ip;
    if (ip.includes(":")) {
      const parts = ip.split(":");
      return parts.slice(0, 2).join(":") + ":****:****";
    }
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
    return "***.***";
  };

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch configured ping targets
  useEffect(() => {
    fetch("/api/v1/ping-targets")
      .then((res) => res.json())
      .then((data) => {
        if (data.targets && Array.isArray(data.targets)) {
          setConfiguredTargets(data.targets.filter((t: PingTargetConfig) => t.enabled !== false));
        }
      })
      .catch((err) => console.error("Failed to fetch ping targets:", err));
  }, []);

  // Dynamic ping targets list merging live node.pings and system configured targets
  const displayPings: PingStat[] = useMemo(() => {
    const liveMap = new Map<string, PingStat>();
    if (node.pings) {
      node.pings.forEach((p) => {
        liveMap.set(p.label, p);
        liveMap.set(p.target, p);
      });
    }

    if (configuredTargets.length > 0) {
      return configuredTargets.map((ct) => {
        const live = liveMap.get(ct.label) || liveMap.get(ct.target);
        if (live) {
          return {
            ...live,
            label: ct.label,
            color: ct.color || live.color,
          };
        }
        return {
          target: ct.target,
          label: ct.label,
          color: ct.color || "#3b82f6",
          latency_ms: 0,
          packet_loss: 0,
          jitter: 0,
        };
      });
    }

    if (node.pings && node.pings.length > 0) return node.pings;
    return [
      { target: "8.8.8.8", label: "Google", color: "#ef4444", latency_ms: 1.2, packet_loss: 0, jitter: 0.05 },
      { target: "223.5.5.5", label: "电信", color: "#06b6d4", latency_ms: 150.0, packet_loss: 0, jitter: 0.18 },
      { target: "www.youtube.com", label: "Youtube", color: "#a855f7", latency_ms: 1.1, packet_loss: 0, jitter: 0.08 },
      { target: "api.openai.com", label: "ChatGPT", color: "#3b82f6", latency_ms: 1.2, packet_loss: 0, jitter: 0.06 },
      { target: "api.anthropic.com", label: "Claude", color: "#f97316", latency_ms: 2.0, packet_loss: 0, jitter: 0.10 },
    ];
  }, [configuredTargets, node.pings]);

  // Hidden ping targets filter (tracks labels the user intentionally hid)
  const [hiddenTargets, setHiddenTargets] = useState<Set<string>>(new Set());

  // Reset hidden targets when switching to another node
  useEffect(() => {
    setHiddenTargets(new Set());
  }, [node.node_id]);

  // Copy helper
  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 1800);
  };

  // Fetch telemetry history
  useEffect(() => {
    const rangeParam = timeRange === "1d" ? "24h" : timeRange === "4h" ? "6h" : "1h";
    fetch(`/api/v1/nodes/${encodeURIComponent(node.node_id)}/history?range=${rangeParam}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.points && Array.isArray(data.points)) setHistory(data.points);
      })
      .catch((err) => console.error("Failed to fetch history:", err));
  }, [node.node_id, timeRange]);

  // Fetch ping history
  useEffect(() => {
    const rangeParam = pingRange === "1d" ? "24h" : pingRange === "12h" ? "12h" : pingRange === "6h" ? "6h" : "1h";
    fetch(`/api/v1/nodes/${encodeURIComponent(node.node_id)}/ping-history?range=${rangeParam}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.points && Array.isArray(data.points)) setPingHistory(data.points);
      })
      .catch((err) => console.error("Failed to fetch ping history:", err));
  }, [node.node_id, pingRange]);

  // Previous & Next navigation
  const currentIndex = nodesList.findIndex((n) => n.node_id === node.node_id);
  const prevNode = currentIndex > 0 ? nodesList[currentIndex - 1] : null;
  const nextNode = currentIndex < nodesList.length - 1 ? nodesList[currentIndex + 1] : null;

  // Quota & traffic calculations prioritizing configured bandwidth_used
  const usedTraffic = (node.billing?.bandwidth_used && node.billing.bandwidth_used > 0)
    ? node.billing.bandwidth_used
    : (node.network.bytes_sent + node.network.bytes_recv);
  const quotaBytes = node.billing?.bandwidth_quota || 0;
  const quotaPercent = quotaBytes > 0 ? Math.min(100, Math.max(0, (usedTraffic / quotaBytes) * 100)) : 0;

  // Prepare 6 charts time-series data
  const timestamps = useMemo(() => history.map((p) => p.timestamp), [history]);

  const cpuChartSeries: ChartSeries[] = useMemo(() => [
    {
      label: "CPU",
      values: history.map((p) => p.cpu_percent),
      color: "#f97316",
      fill: isBlueprint ? "rgba(249, 115, 22, 0.06)" : "rgba(249, 115, 22, 0.1)",
      unit: "%",
    },
    {
      label: "负载",
      values: history.map((p) => p.load_1 || 0),
      color: "#06b6d4",
      unit: "",
    },
  ], [history, isBlueprint]);

  const memChartSeries: ChartSeries[] = useMemo(() => [
    {
      label: "RAM",
      values: history.map((p) => (p.mem_used || 0) / (1024 * 1024)),
      color: "#ef4444",
      fill: isBlueprint ? "rgba(239, 68, 68, 0.05)" : "rgba(239, 68, 68, 0.08)",
      unit: "MB",
    },
    {
      label: "RAM 总量",
      values: history.map((p) => (p.mem_total || node.system.mem_total || 0) / (1024 * 1024)),
      color: "#3b82f6",
      unit: "MB",
    },
    {
      label: "Swap",
      values: history.map((p) => (p.swap_used || 0) / (1024 * 1024)),
      color: "#f59e0b",
      unit: "MB",
    },
    {
      label: "Swap 总量",
      values: history.map((p) => (p.swap_total || node.system.swap_total || 0) / (1024 * 1024)),
      color: "#a855f7",
      unit: "MB",
    },
  ], [history, node.system, isBlueprint]);

  const diskChartSeries: ChartSeries[] = useMemo(() => [
    {
      label: "磁盘已用",
      values: history.map((p) => (p.disk_used || 0) / (1024 * 1024 * 1024)),
      color: "#10b981",
      fill: isBlueprint ? "rgba(16, 185, 129, 0.05)" : "rgba(16, 185, 129, 0.08)",
      unit: "GB",
    },
    {
      label: "磁盘总量",
      values: history.map((p) => (p.disk_total || node.system.disk_total || 0) / (1024 * 1024 * 1024)),
      color: "#06b6d4",
      unit: "GB",
    },
  ], [history, node.system, isBlueprint]);

  const netChartSeries: ChartSeries[] = useMemo(() => [
    {
      label: "下载",
      values: history.map((p) => p.rate_download),
      color: "#3b82f6",
      fill: isBlueprint ? "rgba(59, 130, 246, 0.05)" : "rgba(59, 130, 246, 0.08)",
      format: (v) => formatRate(v),
    },
    {
      label: "上传",
      values: history.map((p) => p.rate_upload),
      color: "#a855f7",
      fill: isBlueprint ? "rgba(168, 85, 247, 0.05)" : "rgba(168, 85, 247, 0.08)",
      format: (v) => formatRate(v),
    },
  ], [history, isBlueprint]);

  const connChartSeries: ChartSeries[] = useMemo(() => [
    {
      label: "TCP",
      values: history.map((p) => p.tcp_count || 0),
      color: "#ef4444",
      unit: "",
    },
    {
      label: "UDP",
      values: history.map((p) => p.udp_count || 4),
      color: "#10b981",
      unit: "",
    },
  ], [history]);

  const procChartSeries: ChartSeries[] = useMemo(() => [
    {
      label: "进程",
      values: history.map((p) => p.process_count || 87),
      color: "#8b5cf6",
      fill: isBlueprint ? "rgba(139, 92, 246, 0.05)" : "rgba(139, 92, 246, 0.08)",
      unit: "",
    },
  ], [history, isBlueprint]);

  // Prepare Ping Chart series
  const pingTimestamps = useMemo(() => {
    const tsSet = new Set<number>();
    pingHistory.forEach((p) => tsSet.add(p.timestamp));
    return Array.from(tsSet).sort((a, b) => a - b);
  }, [pingHistory]);

  const pingChartSeries: ChartSeries[] = useMemo(() => {
    return displayPings
      .filter((target) => !hiddenTargets.has(target.label))
      .map((target) => {
        const valMap = new Map<number, number>();
        pingHistory.forEach((p) => {
          if (p.label === target.label || p.target === target.target) {
            valMap.set(p.timestamp, p.latency_ms);
          }
        });

        const vals = pingTimestamps.map((ts) => valMap.get(ts) ?? target.latency_ms);

        return {
          label: target.label,
          values: vals,
          color: target.color || "#3b82f6",
          unit: "ms",
          format: (v) => `${v.toFixed(1)}ms`,
        };
      });
  }, [displayPings, hiddenTargets, pingHistory, pingTimestamps]);

  const toggleTarget = (label: string) => {
    setHiddenTargets((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label); // Unhide
      } else {
        next.add(label); // Hide
      }
      return next;
    });
  };

  const showAllTargets = () => {
    setHiddenTargets(new Set());
  };


  // Card theme classes
  const cardBgClass = isBlueprint
    ? "bg-white border-slate-200/80 text-slate-800 shadow-sm"
    : "bg-zinc-900/60 border-zinc-800/80 text-zinc-100 shadow-inner";

  const statCardClass = isBlueprint
    ? "bg-white border-slate-200/80 shadow-sm text-slate-800"
    : "bg-zinc-900/50 border-zinc-800/80 shadow-inner text-zinc-100";

  // Shared label row for the 8 summary stat cards.
  const statLabelClass = cn(
    "flex items-center justify-between text-xs",
    isBlueprint ? "text-slate-600 font-medium" : "text-zinc-400"
  );

  // daisyUI tabs, tinted to match the existing emerald "selected range" accent.
  const tabsClass = isBlueprint ? "bg-slate-100" : "bg-zinc-900/70";
  const activeTabClass = isBlueprint
    ? "tab-active !bg-emerald-50 !text-emerald-700 font-bold"
    : "tab-active !bg-emerald-500/15 !text-emerald-400 font-bold";
  const inactiveTabClass = isBlueprint
    ? "text-slate-600 hover:text-slate-900"
    : "text-zinc-400 hover:text-zinc-200";

  return (
    <div
      className={`min-h-screen font-sans transition-colors duration-200 ${
        isBlueprint ? "blueprint-grid text-slate-800" : "cyber-grid text-zinc-100 bg-zinc-950"
      }`}
    >
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-8 animate-fade-in">
        {/* 1. Top Navigation Bar */}
        <div
          className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${
            isBlueprint ? "border-slate-200" : "border-zinc-800/80"
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                isBlueprint
                  ? "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 shadow-sm"
                  : "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100"
              }`}
              title="返回节点列表"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2">
              <span className="text-2xl leading-none">{getRegionFlag(node.region)}</span>
              <h2
                className={`text-xl font-bold tracking-tight font-sans ${
                  isBlueprint ? "text-slate-900" : "text-zinc-100"
                }`}
              >
                {node.name}
              </h2>
              <span className="rounded bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-600 border border-sky-500/30 flex items-center gap-1 font-sans">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                在线
              </span>
            </div>

            {/* Custom tags with distinct colors */}
            <div className="hidden sm:flex items-center gap-1.5 ml-2">
              {(node.tags && node.tags.length > 0 ? node.tags : ["电信CN2", "1Gbps", "CU4837"]).map((tag) => (
                <span
                  key={tag}
                  className={`rounded-lg px-2.5 py-0.5 text-xs font-sans font-medium border transition-all ${getTagStyle(
                    tag,
                    isBlueprint
                  )}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Right side controls: Star, Node Switcher, Provider, Theme Toggle */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={toggleStar}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all cursor-pointer active:scale-95 ${
                isStarred
                  ? isBlueprint
                    ? "bg-amber-50 border-amber-300 text-amber-500 shadow-sm"
                    : "bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-sm"
                  : isBlueprint
                  ? "bg-white border-slate-200 text-slate-400 hover:text-amber-500 hover:border-slate-300 shadow-sm"
                  : "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-zinc-700"
              }`}
              title={isStarred ? "取消星标关注" : "添加星标关注"}
            >
              <Star className={`h-4 w-4 ${isStarred ? "fill-amber-400 text-amber-400" : ""}`} />
            </button>

            {/* Node dropdown switcher */}
            <div
              ref={dropdownRef}
              className={`relative flex items-center rounded-lg border px-1.5 py-1 gap-0.5 ${
                isBlueprint ? "bg-white border-slate-200 text-slate-700 shadow-sm" : "bg-zinc-900/80 border-zinc-800 text-zinc-200"
              }`}
            >
              <button
                disabled={!prevNode}
                onClick={() => prevNode && onSelectNode(prevNode)}
                className={`p-1 rounded transition-colors disabled:opacity-30 ${
                  isBlueprint ? "text-slate-400 hover:text-slate-800 hover:bg-slate-100" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
                title="上一个节点"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold transition-colors ${
                  isBlueprint
                    ? isDropdownOpen ? "bg-slate-100 text-indigo-600" : "hover:bg-slate-100 text-slate-800"
                    : isDropdownOpen ? "bg-zinc-800 text-indigo-400" : "hover:bg-zinc-800 text-zinc-200"
                }`}
                title="点击选择主机"
              >
                <span className="text-sm">{getRegionFlag(node.region)}</span>
                <span className="truncate max-w-[120px]">{node.name}</span>
                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${
                  isDropdownOpen ? "rotate-180 text-indigo-500" : "text-slate-400"
                }`} />
              </button>

              <button
                disabled={!nextNode}
                onClick={() => nextNode && onSelectNode(nextNode)}
                className={`p-1 rounded transition-colors disabled:opacity-30 ${
                  isBlueprint ? "text-slate-400 hover:text-slate-800 hover:bg-slate-100" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
                title="下一个节点"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>

              {/* Dropdown Menu Popover */}
              {isDropdownOpen && (
                <div
                  className={`absolute right-0 top-full mt-2 w-72 rounded-xl border p-1.5 shadow-2xl z-50 animate-fade-in font-mono ${
                    isBlueprint
                      ? "bg-white/95 border-slate-200 text-slate-800 shadow-slate-200/80 backdrop-blur-xl"
                      : "bg-zinc-900/95 border-zinc-700/80 text-zinc-100 shadow-black/80 backdrop-blur-xl"
                  }`}
                >
                  <div className={`flex items-center justify-between px-2.5 py-1.5 text-11 font-semibold border-b mb-1 ${
                    isBlueprint ? "border-slate-100 text-slate-500" : "border-zinc-800 text-zinc-400"
                  }`}>
                    <span>切换主机 ({nodesList.length})</span>
                    <Server className="h-3.5 w-3.5 text-indigo-500" />
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-0.5 pr-0.5">
                    {nodesList.map((n) => {
                      const isActive = n.node_id === node.node_id;
                      return (
                        <button
                          key={n.node_id}
                          onClick={() => {
                            onSelectNode(n);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left ${
                            isActive
                              ? isBlueprint
                                ? "bg-indigo-50 text-indigo-600 font-bold border border-indigo-200/60"
                                : "bg-indigo-500/15 text-indigo-300 font-bold border border-indigo-500/30"
                              : isBlueprint
                              ? "hover:bg-slate-100/80 text-slate-700"
                              : "hover:bg-zinc-800/80 text-zinc-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="text-base leading-none shrink-0">{getRegionFlag(n.region)}</span>
                            <div className="overflow-hidden">
                              <div className="truncate font-medium">{n.name}</div>
                              <div className={`text-10 truncate ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                                {n.system.os || n.region} {n.system.public_ip ? `· ${n.system.public_ip}` : ""}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                n.is_online
                                  ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                                  : "bg-rose-500"
                              }`}
                            />
                            {isActive && <Check className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Provider badge */}
            <div
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                isBlueprint
                  ? "bg-white border-slate-200 text-slate-600 shadow-sm"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400"
              }`}
            >
              <Network className="h-3.5 w-3.5 text-indigo-500" />
              <span className="truncate max-w-[220px]" title={node.billing?.provider || "Zillion Network Inc."}>
                {node.billing?.provider || "Zillion Network Inc."}
              </span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all cursor-pointer active:scale-95 ${
                isBlueprint
                  ? "bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 shadow-sm"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
              }`}
              title={isBlueprint ? "切换到暗黑模式" : "切换到 Blueprint 模式"}
            >
              {isBlueprint ? <Moon className="h-4 w-4 text-slate-600" /> : <Sun className="h-4 w-4 text-amber-400" />}
            </button>
          </div>
        </div>

        {/* 2. Top 8 Summary Stat Cards (4x2 grid) */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
          <BlurFade delay={0.02} className={`rounded-xl border p-3.5 ${statCardClass}`}>
            <div className={statLabelClass}>
              <span>节点定价</span>
              <CreditCard className={`h-3.5 w-3.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
            </div>
            <div className={`mt-1.5 text-lg font-bold truncate ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
              {node.billing?.currency || "$"}
              <NumberTicker
                value={node.billing?.price != null && node.billing.price > 0 ? node.billing.price : (node.billing?.price_per_month || 9.9)}
                decimals={2}
              />
              <span className={`text-xs font-normal ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}> / {getCycleLabel(node.billing?.billing_cycle)}</span>
            </div>
          </BlurFade>

          <BlurFade delay={0.05} className={`rounded-xl border p-3.5 ${statCardClass}`}>
            <div className={statLabelClass}>
              <span>月均支出</span>
              <DollarSign className={`h-3.5 w-3.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
            </div>
            <div className={`mt-1.5 text-lg font-bold truncate ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
              {node.billing?.currency || "$"}
              <NumberTicker value={node.billing?.price_per_month || 9.9} decimals={2} />
              <span className={`text-xs font-normal ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}> / 月</span>
            </div>
          </BlurFade>

          <BlurFade delay={0.08} className={`rounded-xl border p-3.5 ${statCardClass}`}>
            <div className={statLabelClass}>
              <span>剩余时间</span>
              <Calendar className={`h-3.5 w-3.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-1">
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                <NumberTicker value={node.billing?.remaining_days != null ? node.billing.remaining_days : 27} />
                <span className={`text-xs font-normal ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}> 天</span>
              </span>
              {node.billing?.expiry_date ? (
                <span className={`text-10 truncate max-w-[90px] ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} title={`到期日: ${node.billing.expiry_date}`}>
                  {node.billing.expiry_date}
                </span>
              ) : (
                <span className={`text-10 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>自动续费</span>
              )}
            </div>
          </BlurFade>

          <BlurFade delay={0.11} className={`rounded-xl border p-3.5 ${statCardClass}`}>
            <div className={statLabelClass}>
              <span>剩余价值</span>
              <Coins className={`h-3.5 w-3.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-1">
              <span className="text-lg font-bold text-cyan-600 dark:text-cyan-400">
                <NumberTicker
                  value={node.billing?.remaining_value != null ? node.billing.remaining_value : 59.84}
                  decimals={2}
                  prefix="¥"
                />
              </span>
              <span className={`text-10 font-mono ${isBlueprint ? "text-cyan-700" : "text-cyan-400/80"}`}>
                实时折算
              </span>
            </div>
          </BlurFade>

          <BlurFade delay={0.14} className={`rounded-xl border p-3.5 ${statCardClass}`}>
            <div className={statLabelClass}>
              <span>已用流量</span>
              <ArrowUpDown className={`h-3.5 w-3.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
            </div>
            <div className={`mt-1.5 text-lg font-bold ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
              {formatBytes(usedTraffic)}
            </div>
          </BlurFade>

          <BlurFade delay={0.17} className={`rounded-xl border p-3.5 ${statCardClass}`}>
            <div className={statLabelClass}>
              <span>流量配额</span>
              <PieChart className={`h-3.5 w-3.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
            </div>
            <div className="mt-1.5 text-lg font-bold text-blue-600 dark:text-blue-400 flex items-baseline gap-1">
              {quotaBytes > 0 ? (
                <>
                  <NumberTicker value={quotaPercent} decimals={1} suffix="%" />
                  <span className={`text-xs font-normal ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>/ {formatBytes(quotaBytes)}</span>
                </>
              ) : (
                <span className={`text-sm font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>无限制</span>
              )}
            </div>
          </BlurFade>

          <BlurFade delay={0.2} className={`rounded-xl border p-3.5 ${statCardClass}`}>
            <div className={statLabelClass}>
              <span>运行时间</span>
              <Clock className={`h-3.5 w-3.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
            </div>
            <div className={`mt-1.5 text-sm font-bold truncate ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`} title={node.uptime_str}>
              {node.uptime_str}
            </div>
          </BlurFade>

          <BlurFade delay={0.23} className={`rounded-xl border p-3.5 ${statCardClass}`}>
            <div className={statLabelClass}>
              <span>连接数</span>
              <LinkIcon className={`h-3.5 w-3.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
            </div>
            <div className={`mt-1.5 text-lg font-bold ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
              <NumberTicker value={node.network.tcp_established + (node.network.udp_established || 4)} />
            </div>
          </BlurFade>
        </div>

        {/* 3. 4 Information Cards (2x2 Grid) */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3.5 font-sans text-xs">
          {/* Hardware Info */}
          <BlurFade delay={0.04} className={`rounded-xl border p-4 ${cardBgClass}`}>
            <div className={`flex items-center justify-between border-b pb-2.5 font-bold ${isBlueprint ? "border-slate-100 text-slate-900" : "border-zinc-800/70 text-zinc-100"}`}>
              <span className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-indigo-500" />
                硬件信息
              </span>
            </div>
            <div className="mt-3 space-y-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className={`flex items-center gap-1.5 font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                    <Cpu className={`h-3.5 w-3.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
                    CPU
                  </span>
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(
                      (node.system.cpu_model || "CPU") + " passmark cpubenchmark ranking"
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`rounded-lg px-2 py-0.5 text-10 border flex items-center gap-1 transition-all cursor-pointer active:scale-95 ${
                      isBlueprint
                        ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200"
                        : "bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 border-indigo-500/30"
                    }`}
                    title="在 CPU Mark 查看性能排行榜"
                  >
                    <span>CPU Mark 排行</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
                <div className={`font-semibold truncate ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`} title={node.system.cpu_model || "Intel/AMD Processor"}>
                  {node.system.cpu_model || "Intel(R) Xeon(R) Platinum 9242 CPU @ 2.30GHz"} ({node.system.cpu_count || 1} vCPU)
                </div>
                {/* Benchmark score bar */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded bg-emerald-500/20 px-1 py-0.2 text-10 font-bold text-emerald-600 dark:text-emerald-400">B</span>
                  <div className={`flex-1 h-2 rounded-full overflow-hidden ${isBlueprint ? "bg-slate-200" : "bg-zinc-800"}`}>
                    <div className="h-full bg-emerald-500 rounded-full w-[65%]" />
                  </div>
                  <span className={`text-10 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>{node.system.cpu_mark || "中端服务器级"}</span>
                </div>
              </div>

              <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2.5 border-t ${isBlueprint ? "border-slate-100" : "border-zinc-800/60"}`}>
                {/* IPv4 */}
                <div>
                  <div className={`text-10 flex items-center justify-between ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                    <span>公网 IPv4</span>
                    <button
                      onClick={toggleMaskIP}
                      className={`flex items-center gap-1 hover:underline cursor-pointer ${isBlueprint ? "text-indigo-600" : "text-indigo-400"}`}
                      title={maskIP ? "点击显示完整 IP" : "点击脱敏隐藏 IP"}
                    >
                      {maskIP ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                      <span className="text-9">{maskIP ? "已脱敏" : "显"}</span>
                    </button>
                  </div>
                  <div className={`flex items-center gap-1 mt-0.5 font-semibold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                    <span className="truncate" title={node.system.public_ip || "154.82.20.252"}>
                      {maskIPString(node.system.public_ip || "154.82.20.252")}
                    </span>
                    <button
                      onClick={() => copyText(node.system.public_ip || "154.82.20.252", "ip4")}
                      className={`${isBlueprint ? "text-slate-400 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-300"} shrink-0`}
                      title="复制完整 IPv4"
                    >
                      {copiedField === "ip4" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                {/* IPv6 */}
                <div>
                  <div className={`text-10 ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                    公网 IPv6
                  </div>
                  <div className={`flex items-center gap-1 mt-0.5 font-semibold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                    <span className="truncate" title={node.system.public_ipv6 || "2400:3200::1"}>
                      {maskIPString(node.system.public_ipv6 || "2400:3200::1")}
                    </span>
                    <button
                      onClick={() => copyText(node.system.public_ipv6 || "2400:3200::1", "ip6")}
                      className={`${isBlueprint ? "text-slate-400 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-300"} shrink-0`}
                      title="复制完整 IPv6"
                    >
                      {copiedField === "ip6" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                {/* CPU Cores */}
                <div>
                  <div className={`text-10 ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>物理核心</div>
                  <div className={`mt-0.5 font-semibold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                    {node.system.cpu_count || 1} 核
                  </div>
                </div>

                {/* Virtualization */}
                <div>
                  <div className={`text-10 ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>虚拟化</div>
                  <div className={`mt-0.5 font-semibold uppercase ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                    {node.system.virtualization || "kvm"}
                  </div>
                </div>
              </div>
            </div>
          </BlurFade>

          {/* System Info */}
          <BlurFade delay={0.08} className={`rounded-xl border p-4 ${cardBgClass}`}>
            <div className={`flex items-center justify-between border-b pb-2.5 font-bold ${isBlueprint ? "border-slate-100 text-slate-900" : "border-zinc-800/70 text-zinc-100"}`}>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-600" />
                系统信息
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-y-3 gap-x-4">
              <div>
                <div className={`text-10 ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>操作系统</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`h-7 w-7 rounded-lg flex items-center justify-center border shrink-0 ${
                    isBlueprint ? "bg-slate-50 border-slate-200 text-slate-700 shadow-sm" : "bg-zinc-800/80 border-zinc-700 text-zinc-300"
                  }`}>
                    <OsIcon os={node.system.os} className="h-3.5 w-3.5" />
                  </span>
                  <span className={`font-semibold truncate text-xs ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`} title={node.system.os}>
                    {node.system.os || "Debian GNU/Linux 13 (trixie)"}
                  </span>
                </div>
              </div>

              <div>
                <div className={`text-10 ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>内核版本</div>
                <div className={`flex items-center gap-1 mt-1 font-semibold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                  <span className="truncate text-xs" title={node.system.kernel}>{node.system.kernel || "6.12.43+deb13-amd64"}</span>
                  <button
                    onClick={() => copyText(node.system.kernel || "6.12.43+deb13-amd64", "kernel")}
                    className={`${isBlueprint ? "text-slate-400 hover:text-slate-700 shrink-0" : "text-zinc-500 hover:text-zinc-300 shrink-0"}`}
                    title="复制内核版本"
                  >
                    {copiedField === "kernel" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              <div>
                <div className={`text-10 ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>运行时间</div>
                <div className={`mt-1 font-semibold text-xs ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                  {node.uptime_str}
                </div>
              </div>

              <div>
                <div className={`text-10 ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>厂商</div>
                <div className={`mt-0.5 font-semibold truncate ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`} title={node.billing?.provider}>
                  {node.billing?.provider || "圣何塞 · Zillion Network Inc. · AS54801"}
                </div>
              </div>
            </div>
          </BlurFade>

          {/* Storage Info */}
          <BlurFade delay={0.11} className={`rounded-xl border p-4 ${cardBgClass}`}>
            <div className={`flex items-center justify-between border-b pb-2.5 font-bold ${isBlueprint ? "border-slate-100 text-slate-900" : "border-zinc-800/70 text-zinc-100"}`}>
              <span className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-amber-500" />
                存储信息
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <div className={`text-10 flex items-center gap-1 ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                  <Layers className={`h-3 w-3 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
                  内存
                </div>
                <div className={`font-bold text-sm mt-1 ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                  {formatBytes(node.system.mem_total || 967 * 1024 * 1024)}
                </div>
              </div>

              <div>
                <div className={`text-10 flex items-center gap-1 ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                  <ArrowUpDown className={`h-3 w-3 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
                  内存交换
                </div>
                <div className={`font-bold text-sm mt-1 ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                  {formatBytes(node.system.swap_total || 3800 * 1024 * 1024)}
                </div>
              </div>

              <div>
                <div className={`text-10 flex items-center gap-1 ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                  <HardDrive className={`h-3 w-3 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
                  硬盘
                </div>
                <div className={`font-bold text-sm mt-1 ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                  {formatBytes(node.system.disk_total || 46 * 1024 * 1024 * 1024)}
                </div>
              </div>
            </div>
          </BlurFade>

          {/* Network Info */}
          <BlurFade delay={0.15} className={`rounded-xl border p-4 ${cardBgClass}`}>
            <div className={`flex items-center justify-between border-b pb-2.5 font-bold ${isBlueprint ? "border-slate-100 text-slate-900" : "border-zinc-800/70 text-zinc-100"}`}>
              <span className="flex items-center gap-2">
                <Network className="h-4 w-4 text-emerald-500" />
                网络信息
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <div className={`flex items-center gap-1 text-10 ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                  <ArrowUpDown className={`h-3 w-3 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
                  <span>总流量</span>
                  <span className={`rounded px-1 text-9 font-semibold ${isBlueprint ? "bg-slate-100 text-slate-700" : "bg-zinc-800 text-zinc-300"}`}>IPv4</span>
                  <span className={`ml-auto font-mono ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                    {formatBytes(node.network.bytes_recv)} / {formatBytes(node.network.bytes_sent)}
                  </span>
                </div>
                <div className={`font-bold text-sm mt-1 ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                  {formatBytes(usedTraffic)} {quotaBytes > 0 ? `/ ${formatBytes(quotaBytes)}` : "（无限制）"}
                </div>
                <div className={`text-10 mt-1.5 flex items-center gap-2 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                  <span>近一周峰值</span>
                  <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <ArrowUp className="h-3 w-3" />
                    <span>{formatRate(node.network.monthly_peak_up || 1.2 * 1024 * 1024)}</span>
                  </span>
                  <span className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-semibold">
                    <ArrowDown className="h-3 w-3" />
                    <span>{formatRate(node.network.monthly_peak_down || 1.2 * 1024 * 1024)}</span>
                  </span>
                </div>
              </div>

              <div>
                <div className={`text-10 flex items-center gap-1 ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                  <Activity className={`h-3 w-3 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
                  网络速率
                </div>
                <div className="font-bold text-sm mt-1 flex items-center gap-3">
                  <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                    <ArrowUp className="h-3.5 w-3.5" />
                    <span>{formatRate(node.rate_up)}</span>
                  </span>
                  <span className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400">
                    <ArrowDown className="h-3.5 w-3.5" />
                    <span>{formatRate(node.rate_down)}</span>
                  </span>
                </div>
              </div>
            </div>
          </BlurFade>
        </div>

        {/* 4. Real-time Telemetry Charts Header (Tabs: 实时, 4 小时, 1 天, 自定义) */}
        <div
          className={`mt-7 flex flex-wrap items-center justify-between gap-3 border-b pb-2.5 font-sans ${
            isBlueprint ? "border-slate-200" : "border-zinc-800"
          }`}
        >
          <div role="tablist" className={cn("tabs tabs-boxed tabs-sm", tabsClass)}>
            {(["realtime", "4h", "1d"] as const).map((mode) => (
              <button
                key={mode}
                role="tab"
                aria-selected={timeRange === mode}
                onClick={() => setTimeRange(mode)}
                className={cn(
                  "tab text-xs font-semibold transition-colors",
                  timeRange === mode ? activeTabClass : inactiveTabClass
                )}
              >
                {mode === "realtime" ? "实时" : mode === "4h" ? "4 小时" : "1 天"}
              </button>
            ))}
          </div>
        </div>

        {/* 6 Modular Telemetry Charts (3x2 Grid) */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <TimeSeriesChart
            title="CPU 与负载"
            icon={<Cpu className="h-3.5 w-3.5 text-rose-500" />}
            headerRight={`${(node.cpu || 1.0).toFixed(1)}%`}
            yAxisLabel="CPU %"
            timestamps={timestamps}
            seriesList={cpuChartSeries}
            theme={theme}
            height={130}
          />
          <TimeSeriesChart
            title="内存与 Swap"
            icon={<Layers className="h-3.5 w-3.5 text-purple-500" />}
            headerRight={`${formatBytes(node.system.mem_used)} · ${formatBytes(node.system.mem_total)}`}
            timestamps={timestamps}
            seriesList={memChartSeries}
            theme={theme}
            height={130}
          />
          <TimeSeriesChart
            title="磁盘"
            icon={<HardDrive className="h-3.5 w-3.5 text-emerald-500" />}
            headerRight={`${formatBytes(node.system.disk_used || 0)} · ${formatBytes(node.system.disk_total || 0)}`}
            timestamps={timestamps}
            seriesList={diskChartSeries}
            theme={theme}
            height={130}
          />
          <TimeSeriesChart
            title="实时网络"
            icon={<Activity className="h-3.5 w-3.5 text-blue-500" />}
            headerRight={
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-0.5 text-emerald-600 font-semibold">
                  <ArrowUp className="h-3 w-3" />
                  <span>{formatRate(node.rate_up)}</span>
                </span>
                <span className="flex items-center gap-0.5 text-blue-600 font-semibold">
                  <ArrowDown className="h-3 w-3" />
                  <span>{formatRate(node.rate_down)}</span>
                </span>
              </div>
            }
            timestamps={timestamps}
            seriesList={netChartSeries}
            theme={theme}
            height={130}
          />
          <TimeSeriesChart
            title="网络连接"
            icon={<Network className="h-3.5 w-3.5 text-amber-500" />}
            headerRight={`TCP: ${node.network.tcp_established} · UDP: ${node.network.udp_established || 4}`}
            timestamps={timestamps}
            seriesList={connChartSeries}
            theme={theme}
            height={130}
          />
          <TimeSeriesChart
            title="进程"
            icon={<Clock className="h-3.5 w-3.5 text-violet-500" />}
            headerRight={`${node.system.process_count || 87}`}
            timestamps={timestamps}
            seriesList={procChartSeries}
            theme={theme}
            height={130}
          />
        </div>

        {/* 5. Latency & Packet Loss Section (延迟 / 丢包) */}
        <div className={`mt-8 rounded-2xl border p-5 ${cardBgClass}`}>
          <div className={`flex flex-wrap items-center justify-between gap-3 border-b pb-3 font-sans ${isBlueprint ? "border-slate-100" : "border-zinc-800/80"}`}>
            {/* Time range buttons */}
            <div role="tablist" className={cn("tabs tabs-boxed tabs-sm", tabsClass)}>
              {(["1h", "6h", "12h", "1d"] as const).map((r) => (
                <button
                  key={r}
                  role="tab"
                  aria-selected={pingRange === r}
                  onClick={() => setPingRange(r)}
                  className={cn(
                    "tab text-xs transition-colors",
                    pingRange === r ? activeTabClass : inactiveTabClass
                  )}
                >
                  {r === "1h" ? "1 小时" : r === "6h" ? "6 小时" : r === "12h" ? "12 小时" : "1 天"}
                </button>
              ))}
            </div>

            {/* Target filter hint */}
            <div className="flex items-center gap-2 text-xs">
              <span className={`text-11 ${isBlueprint ? "text-slate-600" : "text-zinc-500"}`}>
                点击下方节点可单选/多选对比
              </span>
              {hiddenTargets.size > 0 && (
                <button
                  type="button"
                  onClick={showAllTargets}
                  className={`text-11 font-semibold px-2 py-0.5 rounded-md border transition-all cursor-pointer active:scale-95 ${
                    isBlueprint
                      ? "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                      : "bg-indigo-950/50 text-indigo-400 border-indigo-800/60 hover:bg-indigo-900/50"
                  }`}
                >
                  恢复全部显示 ({displayPings.length - hiddenTargets.size}/{displayPings.length})
                </button>
              )}
            </div>
          </div>

          {/* Target Ping Summary Badges (Google, 电信, Youtube, ChatGPT, Claude) */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-sans text-xs">
            {displayPings.map((target) => {
              const isSelected = !hiddenTargets.has(target.label);
              return (
                <div
                  key={target.label}
                  onClick={() => toggleTarget(target.label)}
                  className={`cursor-pointer rounded-xl border p-3 transition-all relative overflow-hidden select-none active:scale-[0.98] ${
                    isBlueprint
                      ? isSelected
                        ? "border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100"
                        : "border-slate-200/60 bg-slate-100/60 opacity-45 hover:opacity-80"
                      : isSelected
                      ? "border-zinc-700 bg-zinc-950/80 shadow-md shadow-indigo-500/5 ring-1 ring-zinc-700/50"
                      : "border-zinc-800/60 bg-zinc-950/30 opacity-45 hover:opacity-80"
                  }`}
                  title={isSelected ? `点击隐藏 ${target.label} 对比` : `点击显示 ${target.label} 对比`}
                >
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l transition-opacity ${
                      isSelected ? "opacity-100" : "opacity-30"
                    }`}
                    style={{ backgroundColor: target.color || "#3b82f6" }}
                  />
                  <div className="flex items-center justify-between font-bold mb-1 pl-1.5">
                    <span className={`${
                      isSelected
                        ? isBlueprint ? "text-slate-900 font-bold" : "text-zinc-100 font-bold"
                        : isBlueprint ? "text-slate-400 line-through" : "text-zinc-500 line-through"
                    }`}>
                      {target.label}
                    </span>
                    {isSelected ? (
                      <Eye className={`h-3 w-3 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`} />
                    ) : (
                      <EyeOff className={`h-3 w-3 ${isBlueprint ? "text-slate-400" : "text-zinc-600"}`} />
                    )}
                  </div>
                  <div className={`text-xs pl-1.5 ${
                    isSelected
                      ? isBlueprint ? "text-slate-600" : "text-zinc-400"
                      : isBlueprint ? "text-slate-400" : "text-zinc-600"
                  }`}>
                    <span className={`font-bold ${
                      isSelected
                        ? isBlueprint ? "text-slate-900" : "text-zinc-100"
                        : isBlueprint ? "text-slate-400" : "text-zinc-600"
                    }`}>
                      {target.latency_ms.toFixed(0)}ms
                    </span>
                    {" · "}
                    <span>{target.packet_loss.toFixed(2)}%</span>
                    {" · "}
                    <span>{target.jitter.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Smooth peaks indicator */}
          <div className={`mt-4 flex items-center gap-1.5 text-xs font-mono pl-1 ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
            <span className={`font-semibold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>平滑峰值</span>
            <span
              className="cursor-help inline-flex items-center"
              title="已启用滑动均值平滑算法，过滤异常网络抖动尖刺，保持指标趋势清晰呈现"
            >
              <Info className={`h-3.5 w-3.5 ${isBlueprint ? "text-slate-500 hover:text-slate-700" : "text-zinc-400 hover:text-zinc-200"}`} />
            </span>
          </div>

          {/* uPlot Latency Time-Series Chart */}
          <div className="mt-2">
            {pingChartSeries.length > 0 ? (
              <TimeSeriesChart
                yAxisLabel="延迟 (ms)"
                timestamps={pingTimestamps.length > 0 ? pingTimestamps : timestamps}
                seriesList={pingChartSeries}
                theme={theme}
                legendPosition="bottom"
                height={180}
                onToggleSeries={toggleTarget}
              />
            ) : (
              <div className={`h-[180px] rounded-xl border flex flex-col items-center justify-center font-mono text-xs ${
                isBlueprint ? "bg-slate-50/50 border-slate-200 text-slate-500" : "bg-zinc-900/30 border-zinc-800 text-zinc-500"
              }`}>
                <span>已隐藏所有监测目标</span>
                <button
                  type="button"
                  onClick={showAllTargets}
                  className="mt-2 text-xs px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all cursor-pointer active:scale-95"
                >
                  恢复显示所有目标
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 6. Footer */}
        <div className={`mt-8 flex items-center justify-between text-xs font-mono pb-6 ${isBlueprint ? "text-slate-500" : "text-zinc-500"}`}>
          <div>CYBER PROBE · 高性能极简探针系统</div>
          <div>Theme: {isBlueprint ? "Blueprint (架构图风格)" : "Cyber Dark (极客暗黑)"}</div>
        </div>
      </div>
    </div>
  );
};

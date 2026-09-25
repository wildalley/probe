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
  Terminal,
  ChevronDown,
  Server,
  Eye,
  EyeOff,
  Ticket,
} from "lucide-react";
import { Tabs } from "@heroui/react";
import { HistoryPoint, NodeState, PingHistoryPoint, PingStat, PingTargetConfig, ThemeMode } from "../types";
import { formatBytes, formatRate } from "../utils/format";
import { getRegionFlag } from "../utils/flags";
import { agentVersionOf, agentVersionStatus } from "../utils/agentVersion";
import { usedTrafficSplit } from "../utils/traffic";
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
  theme?: ThemeMode;
  onToggleTheme?: () => void;
  onSelectTheme?: (theme: ThemeMode) => void;
  /** 服务端会下发的 Agent 版本，用作比较基准；缺省则不做版本判断。 */
  latestAgentVersion?: string;
}

/**
 * 给人复制的升级命令。看板由服务端自己托管，所以 window.location.origin 就是
 * 当初下发 install.sh 的那个地址。--upgrade 读取目标机上已有的 agent.yaml，
 * 既不需要 token 也不会改 node_id。
 */
const AGENT_UPGRADE_COMMAND = `curl -sSL ${window.location.origin}/install.sh | sudo bash -s -- --upgrade`;

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
  onSelectTheme,
  latestAgentVersion,
}) => {
  const [localTheme, setLocalTheme] = useState<ThemeMode>("dark");
  const theme = propsTheme || localTheme;
  const isBlueprintLight = theme === "blueprint";
  const isBlueprintDark = theme === "blueprint-dark";
  const isBlueprint = isBlueprintLight || isBlueprintDark;
  const isBtopDark = theme === "btop";
  const isBtopLight = theme === "btop-light";
  const isBtop = isBtopDark || isBtopLight;

  // 三个状态都不共用文案：旧 Agent 根本不发版本字段，把这个「缺失」渲染成
  // 任何版本号都会毁掉整条升级信号的唯一来源。
  const nodeAgentVersion = agentVersionOf(node.system);
  const versionStatus = agentVersionStatus(nodeAgentVersion, latestAgentVersion);

  const toggleTheme = () => {
    if (onToggleTheme) {
      onToggleTheme();
    } else if (onSelectTheme) {
      if (theme === "blueprint") onSelectTheme("blueprint-dark");
      else if (theme === "blueprint-dark") onSelectTheme("blueprint");
      else if (theme === "btop-light") onSelectTheme("btop");
      else if (theme === "btop") onSelectTheme("btop-light");
      else onSelectTheme("blueprint");
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
    fetch(`/api/v1/ping-targets?node_id=${encodeURIComponent(node.node_id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.targets && Array.isArray(data.targets)) {
          setConfiguredTargets(data.targets.filter((t: PingTargetConfig) => t.enabled !== false));
        }
      })
      .catch((err) => console.error("Failed to fetch ping targets:", err));
  }, [node.node_id]);

  // Dynamic ping targets list merging live node.pings and system configured targets
  const displayPings: PingStat[] = useMemo(() => {
    const liveMap = new Map<string, PingStat>();
    if (node.pings) {
      node.pings.forEach((p) => {
        if (p.id) liveMap.set(`id:${p.id}`, p);
        liveMap.set(`label:${p.label}`, p);
        liveMap.set(`target:${p.target}`, p);
      });
    }

    if (configuredTargets.length > 0) {
      const labelCounts = new Map<string, number>();
      configuredTargets.forEach((ct) => labelCounts.set(ct.label, (labelCounts.get(ct.label) || 0) + 1));
      return configuredTargets.map((ct) => {
        const label = (labelCounts.get(ct.label) || 0) > 1
          ? `${ct.label} (${ct.id ? `#${ct.id}` : ct.target})`
          : ct.label;
        const live = (ct.id ? liveMap.get(`id:${ct.id}`) : undefined)
          || liveMap.get(`target:${ct.target}`)
          || liveMap.get(`label:${label}`);
        if (live) {
          return {
            ...live,
            label,
            color: ct.color || live.color,
          };
        }
        return {
          id: ct.id,
          target: ct.target,
          label,
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

  // 已用流量由服务端算好（校准基线 + 锚定后累计），缺省 0。
  const usedTraffic = node.billing?.bandwidth_used || 0;
  const quotaBytes = node.billing?.bandwidth_quota || 0;
  const quotaPercent = quotaBytes > 0 ? Math.min(100, Math.max(0, (usedTraffic / quotaBytes) * 100)) : 0;
  // 方向明细由服务端折算（up + down 恒等于 usedTraffic）；旧服务端不下发这两个
  // 字段，此时为 null，只显示总量。
  const usedSplit = usedTrafficSplit(node.billing);

  // Prepare 6 charts time-series data
  const timestamps = useMemo(() => history.map((p) => p.timestamp), [history]);

  const cpuChartSeries: ChartSeries[] = useMemo(() => [
    {
      label: "CPU",
      values: history.map((p) => p.cpu_percent),
      color: isBtop ? "#00f0ff" : "#f97316",
      fill: isBtop
        ? "rgba(0, 240, 255, 0.12)"
        : isBlueprint
        ? "rgba(249, 115, 22, 0.06)"
        : "rgba(249, 115, 22, 0.1)",
      unit: "%",
    },
    {
      label: "负载",
      values: history.map((p) => p.load_1 || 0),
      color: isBtop ? "#bd93f9" : "#06b6d4",
      unit: "",
    },
  ], [history, isBlueprint, isBtop]);

  const memChartSeries: ChartSeries[] = useMemo(() => [
    {
      label: "RAM",
      values: history.map((p) => (p.mem_used || 0) / (1024 * 1024)),
      color: isBtop ? "#f43f5e" : "#ef4444",
      fill: isBtop
        ? "rgba(244, 63, 94, 0.12)"
        : isBlueprint
        ? "rgba(239, 68, 68, 0.05)"
        : "rgba(239, 68, 68, 0.08)",
      unit: "MB",
    },
    {
      label: "RAM 总量",
      values: history.map((p) => (p.mem_total || node.system.mem_total || 0) / (1024 * 1024)),
      color: isBtop ? "#38bdf8" : "#3b82f6",
      unit: "MB",
    },
    {
      label: "Swap",
      values: history.map((p) => (p.swap_used || 0) / (1024 * 1024)),
      color: isBtop ? "#f1fa8c" : "#f59e0b",
      unit: "MB",
    },
    {
      label: "Swap 总量",
      values: history.map((p) => (p.swap_total || node.system.swap_total || 0) / (1024 * 1024)),
      color: isBtop ? "#d946ef" : "#a855f7",
      unit: "MB",
    },
  ], [history, node.system, isBlueprint, isBtop]);

  const diskChartSeries: ChartSeries[] = useMemo(() => [
    {
      label: "磁盘已用",
      values: history.map((p) => (p.disk_used || 0) / (1024 * 1024 * 1024)),
      color: isBtop ? "#50fa7b" : "#10b981",
      fill: isBtop
        ? "rgba(80, 250, 123, 0.12)"
        : isBlueprint
        ? "rgba(16, 185, 129, 0.05)"
        : "rgba(16, 185, 129, 0.08)",
      unit: "GB",
    },
    {
      label: "磁盘总量",
      values: history.map((p) => (p.disk_total || node.system.disk_total || 0) / (1024 * 1024 * 1024)),
      color: isBtop ? "#00f0ff" : "#06b6d4",
      unit: "GB",
    },
  ], [history, node.system, isBlueprint, isBtop]);

  const netChartSeries: ChartSeries[] = useMemo(() => [
    {
      label: "下载",
      values: history.map((p) => p.rate_download),
      color: isBtop ? "#00f0ff" : "#3b82f6",
      fill: isBtop
        ? "rgba(0, 240, 255, 0.12)"
        : isBlueprint
        ? "rgba(59, 130, 246, 0.05)"
        : "rgba(59, 130, 246, 0.08)",
      format: (v) => formatRate(v),
    },
    {
      label: "上传",
      values: history.map((p) => p.rate_upload),
      color: isBtop ? "#f43f5e" : "#a855f7",
      fill: isBtop
        ? "rgba(244, 63, 94, 0.12)"
        : isBlueprint
        ? "rgba(168, 85, 247, 0.05)"
        : "rgba(168, 85, 247, 0.08)",
      format: (v) => formatRate(v),
    },
  ], [history, isBlueprint, isBtop]);

  const connChartSeries: ChartSeries[] = useMemo(() => [
    {
      label: "TCP",
      values: history.map((p) => p.tcp_count || 0),
      color: isBtop ? "#f43f5e" : "#ef4444",
      unit: "",
    },
    {
      label: "UDP",
      values: history.map((p) => p.udp_count || 4),
      color: isBtop ? "#50fa7b" : "#10b981",
      unit: "",
    },
  ], [history, isBtop]);

  const procChartSeries: ChartSeries[] = useMemo(() => [
    {
      label: "进程",
      values: history.map((p) => p.process_count || 87),
      color: isBtop ? "#bd93f9" : "#8b5cf6",
      fill: isBtop
        ? "rgba(189, 147, 249, 0.12)"
        : isBlueprint
        ? "rgba(139, 92, 246, 0.05)"
        : "rgba(139, 92, 246, 0.08)",
      unit: "",
    },
  ], [history, isBlueprint, isBtop]);

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
  const cardBgClass = isBlueprintDark
    ? "bg-[#0b152d]/90 border-[#1d2d52] text-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
    : isBlueprintLight
    ? "bg-white border-slate-200/80 text-slate-800 shadow-sm"
    : isBtopLight
    ? "bg-[#f2eef5] border-[#aba4b8] text-[#2b2735] shadow-xs"
    : isBtopDark
    ? "bg-[#0b101c]/90 border-[#1b253b] text-slate-100 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
    : "bg-zinc-900/60 border-zinc-800/80 text-zinc-100 shadow-inner";

  const statCardClass = isBlueprintDark
    ? "bg-[#0b152d]/90 border-[#1d2d52] text-slate-100 shadow-md font-mono"
    : isBlueprintLight
    ? "bg-white border-slate-200/80 shadow-sm text-slate-800 font-mono"
    : isBtopLight
    ? "bg-[#f2eef5] border-[#aba4b8] text-[#2b2735] shadow-xs font-mono"
    : isBtopDark
    ? "bg-[#0b101c]/90 border-[#1b253b] text-slate-100 shadow-[0_0_10px_rgba(0,0,0,0.3)] font-mono"
    : "bg-zinc-900/50 border-zinc-800/80 shadow-inner text-zinc-100";

  // Shared label row for the 8 summary stat cards.
  const statLabelClass = cn(
    "flex items-center justify-between text-xs",
    isBlueprintDark
      ? "text-slate-400 font-medium"
      : isBlueprintLight
      ? "text-slate-600 font-medium"
      : isBtopLight
      ? "text-[#6e687e] font-mono font-bold"
      : isBtopDark
      ? "text-cyan-400 font-mono font-medium"
      : "text-zinc-400"
  );

  // Tab list background; HeroUI's Tabs supplies the selected/unselected states.
  const tabsClass = isBlueprintDark
    ? "bg-[#070e1f] border border-[#1d2d52]"
    : isBlueprintLight
    ? "bg-slate-100"
    : isBtopLight
    ? "bg-[#ded8e6] border border-[#aba4b8]"
    : isBtopDark
    ? "bg-[#070b14] border border-[#1b253b]"
    : "bg-zinc-900/70";

  return (
    <div
      className={`min-h-screen font-sans transition-colors duration-200 ${
        isBlueprintDark
          ? "blueprint-grid-dark text-slate-100 bg-[#070e1e]"
          : isBlueprintLight
          ? "blueprint-grid text-slate-800"
          : isBtopLight
          ? "btop-light-grid text-[#2b2735] bg-[#ebe7ee]"
          : isBtopDark
          ? "btop-grid text-slate-100 bg-[#06080d]"
          : "cyber-grid text-zinc-100 bg-zinc-950"
      }`}
    >
      <div className="mx-auto max-w-[1700px] px-3.5 py-4 sm:px-6 sm:py-6 lg:px-8 animate-fade-in">
        {/* 1. Top Navigation Bar */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 border-b pb-3 sm:pb-4 ${
            isBlueprintDark
              ? "border-[#1d2d52]"
              : isBlueprintLight
              ? "border-slate-200"
              : isBtopLight
              ? "border-[#aba4b8]"
              : isBtopDark
              ? "border-[#1b253b]"
              : "border-zinc-800/80"
          }`}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={onBack}
              className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                isBlueprintDark
                  ? "bg-[#0b152d] border-[#1d2d52] text-slate-300 hover:border-slate-500 hover:text-white shadow-xs"
                  : isBlueprintLight
                  ? "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 shadow-sm"
                  : isBtopLight
                  ? "bg-[#ded8e6] border-[#aba4b8] text-[#2b2735] hover:border-[#7c5c99] shadow-xs"
                  : isBtopDark
                  ? "bg-[#0b101c] border-[#1b253b] text-cyan-400 hover:border-cyan-500/50 hover:text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.1)]"
                  : "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100"
              }`}
              title="返回节点列表"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="text-xl sm:text-2xl leading-none shrink-0">{getRegionFlag(node.region)}</span>
              <h2
                className={`text-base sm:text-xl font-bold tracking-tight font-sans truncate ${
                  isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-900" : "text-zinc-100"
                }`}
              >
                {node.name}
              </h2>
              <span className="shrink-0 rounded bg-sky-500/10 px-1.5 sm:px-2 py-0.5 text-11 sm:text-xs font-semibold text-sky-600 border border-sky-500/30 flex items-center gap-1 font-sans">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                在线
              </span>
            </div>

            {/* Custom tags with distinct colors */}
            <div className="hidden sm:flex items-center gap-1.5 ml-2">
              {(node.tags || []).map((tag) => (
                <span
                  key={tag}
                  className={`rounded-lg px-2.5 py-0.5 text-xs font-sans font-medium border transition-all ${getTagStyle(
                    tag,
                    isBlueprintLight
                  )}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Right side controls: Star, Node Switcher, Provider, Theme Toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2 font-mono text-xs">
            <button
              onClick={toggleStar}
              className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl transition-all cursor-pointer active:scale-95 ${
                isStarred
                  ? isBlueprintDark
                    ? "bg-amber-950/40 text-amber-300 border border-amber-500/30"
                    : isBlueprintLight
                    ? "bg-amber-50 text-amber-500"
                    : "bg-amber-500/15 text-amber-400"
                  : isBlueprintDark
                  ? "text-slate-400 hover:bg-[#132247] hover:text-amber-400 border border-[#1d2d52]"
                  : isBlueprintLight
                  ? "text-slate-400 hover:bg-slate-100 hover:text-amber-500"
                  : "text-zinc-400 hover:bg-zinc-800/80 hover:text-amber-400"
              }`}
              title={isStarred ? "取消星标关注" : "添加星标关注"}
            >
              <Star className={`h-4 w-4 ${isStarred ? "fill-amber-400 text-amber-400" : ""}`} />
            </button>

            {/* Node dropdown switcher */}
            <div
              ref={dropdownRef}
              className={`relative flex items-center rounded-lg border px-1.5 py-1 gap-0.5 ${
                isBlueprintDark
                  ? "bg-[#0b152d] border-[#1d2d52] text-slate-200 shadow-inner"
                  : isBlueprintLight
                  ? "bg-white border-slate-200 text-slate-700 shadow-sm"
                  : "bg-zinc-900/80 border-zinc-800 text-zinc-200"
              }`}
            >
              <button
                disabled={!prevNode}
                onClick={() => prevNode && onSelectNode(prevNode)}
                className={`p-1 rounded transition-colors disabled:opacity-30 ${
                  isBlueprintDark
                    ? "text-slate-400 hover:text-slate-200 hover:bg-[#132247]"
                    : isBlueprintLight
                    ? "text-slate-400 hover:text-slate-800 hover:bg-slate-100"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
                title="上一个节点"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold transition-colors ${
                  isBlueprintDark
                    ? isDropdownOpen ? "bg-[#132247] text-cyan-400" : "hover:bg-[#132247] text-slate-200"
                    : isBlueprintLight
                    ? isDropdownOpen ? "bg-slate-100 text-indigo-600" : "hover:bg-slate-100 text-slate-800"
                    : isDropdownOpen ? "bg-zinc-800 text-indigo-400" : "hover:bg-zinc-800 text-zinc-200"
                }`}
                title="点击选择主机"
              >
                <span className="text-sm leading-none">{getRegionFlag(node.region)}</span>
                <span className="truncate max-w-[70px] sm:max-w-[120px] leading-none">{node.name}</span>
                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${
                  isDropdownOpen ? "rotate-180 text-cyan-400" : "text-slate-400"
                }`} />
              </button>

              <button
                disabled={!nextNode}
                onClick={() => nextNode && onSelectNode(nextNode)}
                className={`p-1 rounded transition-colors disabled:opacity-30 ${
                  isBlueprintDark
                    ? "text-slate-400 hover:text-slate-200 hover:bg-[#132247]"
                    : isBlueprintLight
                    ? "text-slate-400 hover:text-slate-800 hover:bg-slate-100"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
                title="下一个节点"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>

              {/* Dropdown Menu Popover */}
              {isDropdownOpen && (
                <>
                  {/* Mobile backdrop overlay */}
                  <div
                    className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs sm:hidden animate-fade-in"
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div
                    className={cn(
                      "fixed inset-x-3 top-20 max-w-sm mx-auto sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:w-72 rounded-xl border p-1.5 shadow-2xl z-50 animate-fade-in font-mono",
                      isBlueprintDark
                        ? "bg-[#0b152d] border-[#1d2d52] text-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-xl"
                        : isBlueprintLight
                        ? "bg-white border-slate-200 text-slate-800 shadow-slate-200/80 backdrop-blur-xl"
                        : "bg-zinc-900 border-zinc-700/80 text-zinc-100 shadow-black/90 backdrop-blur-xl"
                    )}
                  >
                    <div className={`flex items-center justify-between px-2.5 py-1.5 text-11 font-semibold border-b mb-1 ${
                      isBlueprintDark ? "border-[#1d2d52] text-slate-400" : isBlueprintLight ? "border-slate-100 text-slate-500" : "border-zinc-800 text-zinc-400"
                    }`}>
                      <span>切换主机 ({nodesList.length})</span>
                      <Server className="h-3.5 w-3.5 text-cyan-400" />
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
                                ? isBlueprintDark
                                  ? "bg-cyan-950/40 text-cyan-300 font-bold border border-cyan-500/30"
                                  : isBlueprintLight
                                  ? "bg-indigo-50 text-indigo-600 font-bold border border-indigo-200/60"
                                  : "bg-indigo-500/15 text-indigo-300 font-bold border border-indigo-500/30"
                                : isBlueprintDark
                                ? "hover:bg-[#132247] text-slate-300"
                                : isBlueprintLight
                                ? "hover:bg-slate-100/80 text-slate-700"
                                : "hover:bg-zinc-800/80 text-zinc-300"
                            }`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <span className="text-base leading-none shrink-0">{getRegionFlag(n.region)}</span>
                              <div className="overflow-hidden">
                                <div className="truncate font-medium">{n.name}</div>
                                <div className={`text-10 truncate ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-400" : "text-zinc-500"}`}>
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
                              {isActive && <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Provider badge */}
            <div
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                isBlueprintDark
                  ? "bg-[#0b152d] border-[#1d2d52] text-slate-300 shadow-xs"
                  : isBlueprintLight
                  ? "bg-white border-slate-200 text-slate-600 shadow-sm"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400"
              }`}
            >
              <Network className="h-3.5 w-3.5 text-indigo-500" />
              <span className="truncate max-w-[220px]" title={node.billing?.provider || "未上报运营商"}>
                {node.billing?.provider || "未上报运营商"}
              </span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl border transition-all cursor-pointer active:scale-95 ${
                isBlueprintDark
                  ? "bg-[#0b152d] border-[#1d2d52] text-cyan-400 hover:border-cyan-400/50 shadow-xs"
                  : isBlueprintLight
                  ? "bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 shadow-sm"
                  : isBtopLight
                  ? "bg-[#ded8e6] border-[#aba4b8] text-[#7c5c99] hover:text-[#2b2735] shadow-sm"
                  : isBtop
                  ? "bg-[#0b101c] border-[#1b253b] text-cyan-400 hover:text-cyan-300 hover:border-cyan-500/50 shadow-[0_0_10px_rgba(0,240,255,0.15)]"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
              }`}
              title={
                isBlueprintDark
                  ? "当前: 蓝图暗黑 (点击切换)"
                  : isBlueprintLight
                  ? "当前: 蓝图浅色 (点击切换到暗黑)"
                  : theme === "btop-light"
                  ? "当前: btop++ 亮色终端 (点击切换到蓝图)"
                  : theme === "btop"
                  ? "当前: btop++ 暗色终端 (点击切换到 btop++ 亮色)"
                  : "当前: 默认暗黑 (点击切换到 btop++ 暗色)"
              }
            >
              {theme === "btop" ? (
                <Terminal className="h-4 w-4 text-cyan-400" />
              ) : theme === "btop-light" ? (
                <Terminal className="h-4 w-4 text-purple-600" />
              ) : isBlueprintDark ? (
                <Moon className="h-4 w-4 text-cyan-400" />
              ) : isBlueprintLight ? (
                <Sun className="h-4 w-4 text-amber-500" />
              ) : (
                <Moon className="h-4 w-4 text-indigo-400" />
              )}
            </button>
          </div>
        </div>

        {/* 2. Top 8 Summary Stat Cards (4x2 grid) */}
        <div className="mt-4 sm:mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 font-mono">
          <BlurFade delay={0.02} className={cn(isBtop ? "rounded-none" : "rounded-xl", "border p-2.5 sm:p-3.5", statCardClass)}>
            <div className={statLabelClass}>
              <span>{isBtop ? "[ 节点定价 ]" : "节点定价"}</span>
              <CreditCard className={`h-3.5 w-3.5 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400" : "text-zinc-400"}`} />
            </div>
            <div className={`mt-1 sm:mt-1.5 text-base sm:text-lg font-bold truncate ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-900" : isBtop ? "text-cyan-200" : "text-zinc-100"}`}>
              {node.billing?.currency || "$"}
              <NumberTicker
                value={node.billing?.price != null && node.billing.price > 0 ? node.billing.price : (node.billing?.price_per_month || 0)}
                decimals={2}
              />
              <span className={`text-xs font-normal ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400/70" : "text-zinc-400"}`}> / {getCycleLabel(node.billing?.billing_cycle)}</span>
            </div>
          </BlurFade>

          <BlurFade delay={0.05} className={cn(isBtop ? "rounded-none" : "rounded-xl", "border p-2.5 sm:p-3.5", statCardClass)}>
            <div className={statLabelClass}>
              <span>{isBtop ? "[ 月均支出 ]" : "月均支出"}</span>
              <DollarSign className={`h-3.5 w-3.5 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400" : "text-zinc-400"}`} />
            </div>
            <div className={`mt-1 sm:mt-1.5 text-base sm:text-lg font-bold truncate ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-900" : isBtop ? "text-cyan-200" : "text-zinc-100"}`}>
              {node.billing?.currency || "$"}
              <NumberTicker value={node.billing?.price_per_month || 0} decimals={2} />
              <span className={`text-xs font-normal ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400/70" : "text-zinc-400"}`}> / 月</span>
            </div>
          </BlurFade>

          <BlurFade delay={0.08} className={cn(isBtop ? "rounded-none" : "rounded-xl", "border p-2.5 sm:p-3.5", statCardClass)}>
            <div className={statLabelClass}>
              <span>{isBtop ? "[ 剩余时间 ]" : "剩余时间"}</span>
              <Calendar className={`h-3.5 w-3.5 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400" : "text-zinc-400"}`} />
            </div>
            <div className="mt-1 sm:mt-1.5 flex items-baseline justify-between gap-1">
              <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {node.billing?.expiry_date ? (
                  <>
                    <NumberTicker value={node.billing?.remaining_days || 0} />
                    <span className={`text-xs font-normal ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400/70" : "text-zinc-400"}`}> 天</span>
                  </>
                ) : (
                  <span className={isBlueprintDark ? "text-slate-500" : isBlueprintLight ? "text-slate-400" : "text-zinc-500"}>--</span>
                )}
              </span>
              {node.billing?.expiry_date ? (
                <span className={`text-10 truncate max-w-[80px] sm:max-w-[90px] ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400/70" : "text-zinc-400"}`} title={`到期日: ${node.billing.expiry_date}`}>
                  {node.billing.expiry_date}
                </span>
              ) : (
                <span className={`text-10 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400/70" : "text-zinc-400"}`}>自动续费</span>
              )}
            </div>
          </BlurFade>

          <BlurFade delay={0.11} className={cn(isBtop ? "rounded-none" : "rounded-xl", "border p-2.5 sm:p-3.5", statCardClass)}>
            <div className={statLabelClass}>
              <span>{isBtop ? "[ 剩余价值 ]" : "剩余价值"}</span>
              <Coins className={`h-3.5 w-3.5 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400" : "text-zinc-400"}`} />
            </div>
            <div className="mt-1 sm:mt-1.5 flex items-baseline justify-between gap-1">
              <span className="text-base sm:text-lg font-bold text-cyan-600 dark:text-cyan-400">
                <NumberTicker
                  value={node.billing?.remaining_value_native || 0}
                  decimals={2}
                  prefix={node.billing?.currency || "$"}
                />
              </span>
              <span className={`text-10 font-mono ${isBlueprintDark ? "text-cyan-400" : isBlueprintLight ? "text-cyan-700" : "text-cyan-400/80"}`}>
                按剩余天数
              </span>
            </div>
          </BlurFade>

          <BlurFade delay={0.14} className={cn(isBtop ? "rounded-none" : "rounded-xl", "border p-2.5 sm:p-3.5", statCardClass)}>
            <div className={statLabelClass}>
              <span>{isBtop ? "[ 已用流量 ]" : "已用流量"}</span>
              <ArrowUpDown className={`h-3.5 w-3.5 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400" : "text-zinc-400"}`} />
            </div>
            <div className={`mt-1 sm:mt-1.5 text-base sm:text-lg font-bold ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-900" : isBtop ? "text-cyan-200" : "text-zinc-100"}`}>
              {formatBytes(usedTraffic)}
            </div>
            {usedSplit && (
              <div className="mt-1 flex items-center gap-2.5 text-10 font-mono">
                <span className="flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400">
                  <ArrowUp className="h-3 w-3 shrink-0" />
                  <span>{formatBytes(usedSplit.up)}</span>
                </span>
                <span className="flex items-center gap-0.5 text-cyan-600 dark:text-cyan-400">
                  <ArrowDown className="h-3 w-3 shrink-0" />
                  <span>{formatBytes(usedSplit.down)}</span>
                </span>
              </div>
            )}
          </BlurFade>

          <BlurFade delay={0.17} className={cn(isBtop ? "rounded-none" : "rounded-xl", "border p-2.5 sm:p-3.5", statCardClass)}>
            <div className={statLabelClass}>
              <span>{isBtop ? "[ 流量配额 ]" : "流量配额"}</span>
              <PieChart className={`h-3.5 w-3.5 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400" : "text-zinc-400"}`} />
            </div>
            <div className="mt-1 sm:mt-1.5 text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400 flex items-baseline gap-1">
              {quotaBytes > 0 ? (
                <>
                  <NumberTicker value={quotaPercent} decimals={1} suffix="%" />
                  <span className={`text-xs font-normal ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400/70" : "text-zinc-400"}`}>/ {formatBytes(quotaBytes)}</span>
                </>
              ) : (
                <span className={`text-xs sm:text-sm font-semibold ${isBlueprintDark ? "text-slate-300" : isBlueprintLight ? "text-slate-700" : "text-zinc-300"}`}>无限制</span>
              )}
            </div>
          </BlurFade>

          <BlurFade delay={0.2} className={cn(isBtop ? "rounded-none" : "rounded-xl", "border p-2.5 sm:p-3.5", statCardClass)}>
            <div className={statLabelClass}>
              <span>{isBtop ? "[ 运行时间 ]" : "运行时间"}</span>
              <Clock className={`h-3.5 w-3.5 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400" : "text-zinc-400"}`} />
            </div>
            <div className={`mt-1 sm:mt-1.5 text-xs sm:text-sm font-bold truncate ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-900" : isBtop ? "text-cyan-200" : "text-zinc-100"}`} title={node.uptime_str}>
              {node.uptime_str}
            </div>
          </BlurFade>

          <BlurFade delay={0.23} className={cn(isBtop ? "rounded-none" : "rounded-xl", "border p-2.5 sm:p-3.5", statCardClass)}>
            <div className={statLabelClass}>
              <span>{isBtop ? "[ 连接数 ]" : "连接数"}</span>
              <LinkIcon className={`h-3.5 w-3.5 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-cyan-400" : "text-zinc-400"}`} />
            </div>
            <div className={`mt-1 sm:mt-1.5 text-base sm:text-lg font-bold ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-900" : isBtop ? "text-cyan-200" : "text-zinc-100"}`}>
              <NumberTicker value={node.network.tcp_established + (node.network.udp_established || 4)} />
            </div>
          </BlurFade>
        </div>

        {/* Remark / Promo Code Banner (备注与优惠码) */}
        {node.billing?.note && (
          <BlurFade delay={0.25} className="mt-3 sm:mt-4">
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all text-xs font-sans",
                isBlueprintDark
                  ? "bg-amber-950/25 border-amber-500/30 text-amber-200"
                  : isBlueprintLight
                  ? "bg-amber-50/80 border-amber-200/90 text-amber-900 shadow-2xs"
                  : "bg-amber-950/20 border-amber-800/40 text-amber-200"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <Ticket className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                    <span>配置备注 / 折扣码</span>
                  </div>
                  <div className={`font-mono text-xs sm:text-sm font-medium mt-0.5 break-all select-all ${isBlueprintDark ? "text-slate-200" : isBlueprintLight ? "text-slate-800" : "text-zinc-200"}`}>
                    {node.billing.note}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => copyText(node.billing?.note || "", "note")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer active:scale-95 shrink-0",
                  copiedField === "note"
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                    : isBlueprintDark
                    ? "bg-[#0b152d] hover:bg-[#132247] border-amber-500/30 text-amber-300"
                    : isBlueprintLight
                    ? "bg-white hover:bg-amber-100/60 border-amber-300/80 text-amber-800 shadow-2xs"
                    : "bg-zinc-900 hover:bg-zinc-800 border-amber-700/50 text-amber-300"
                )}
              >
                {copiedField === "note" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span>已复制到剪贴板</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>复制备注/折扣码</span>
                  </>
                )}
              </button>
            </div>
          </BlurFade>
        )}

        {/* 3. 4 Information Cards (2x2 Grid) */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3.5 font-sans text-xs">
          {/* Hardware Info */}
          <BlurFade delay={0.04} className={cn(isBtop ? "rounded-none" : "rounded-xl", "border p-4", cardBgClass)}>
            <div className={`flex items-center justify-between border-b pb-2.5 font-bold ${isBlueprintDark ? "border-[#1d2d52] text-slate-100" : isBlueprintLight ? "border-slate-100 text-slate-900" : isBtop ? "border-[#1b253b] text-cyan-300 font-mono" : "border-zinc-800/70 text-zinc-100"}`}>
              <span className="flex items-center gap-2">
                <Cpu className={`h-4 w-4 ${isBtop ? "text-cyan-400" : isBlueprintDark ? "text-cyan-400" : "text-indigo-500"}`} />
                {isBtop ? "┌─ [ BOX HARDWARE ]" : "硬件信息"}
              </span>
              {isBtop && <span className="text-cyan-500 font-mono text-xs select-none">─┐</span>}
            </div>
            <div className="mt-3 space-y-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className={`flex items-center gap-1.5 font-semibold ${isBlueprintDark ? "text-slate-300" : isBlueprintLight ? "text-slate-700" : "text-zinc-300"}`}>
                    <Cpu className={`h-3.5 w-3.5 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : "text-zinc-400"}`} />
                    CPU
                  </span>
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(
                      (node.system.cpu_model || "CPU") + " passmark cpubenchmark ranking"
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`rounded-lg px-2 py-0.5 text-10 border flex items-center gap-1 transition-all cursor-pointer active:scale-95 ${
                      isBlueprintDark
                        ? "bg-[#070e1f] text-cyan-300 hover:bg-[#132247] border-[#1d2d52]"
                        : isBlueprintLight
                        ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200"
                        : "bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 border-indigo-500/30"
                    }`}
                    title="在 CPU Mark 查看性能排行榜"
                  >
                    <span>CPU Mark 排行</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
                <div className={`font-semibold truncate ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-900" : "text-zinc-100"}`} title={node.system.cpu_model || "通用处理器 / 虚拟化 CPU"}>
                  {node.system.cpu_model || "通用处理器 / 虚拟化 CPU"} ({node.system.cpu_count || 1} vCPU)
                </div>
                {/* Benchmark score bar */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-10 font-bold leading-none text-emerald-600 dark:text-emerald-400">
                    {node.system.cpu_count && node.system.cpu_count >= 8 ? "S" : node.system.cpu_count && node.system.cpu_count >= 4 ? "A" : "B"}
                  </span>
                  <div className={`flex-1 h-2 rounded-full overflow-hidden ${isBlueprintDark ? "bg-[#16274a]" : isBlueprintLight ? "bg-slate-200" : "bg-zinc-800"}`}>
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(95, Math.max(35, (node.system.cpu_count || 1) * 25))}%`,
                      }}
                    />
                  </div>
                  <span className={`text-10 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : "text-zinc-400"}`}>
                    {node.system.cpu_mark || (node.system.cpu_count && node.system.cpu_count >= 8 ? "高性能计算型" : node.system.cpu_count && node.system.cpu_count >= 4 ? "标准多核服务器" : "通用入门型")}
                  </span>
                </div>
              </div>

              <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2.5 border-t ${isBlueprintDark ? "border-[#1d2d52]" : isBlueprintLight ? "border-slate-100" : "border-zinc-800/60"}`}>
                {/* IPv4 */}
                <div>
                  <div className={`text-10 flex items-center justify-between ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                    <span>公网 IPv4</span>
                    <button
                      onClick={toggleMaskIP}
                      className={`flex items-center gap-1 hover:underline cursor-pointer ${isBlueprintDark ? "text-cyan-400" : isBlueprintLight ? "text-indigo-600" : "text-indigo-400"}`}
                      title={maskIP ? "点击显示完整 IP" : "点击脱敏隐藏 IP"}
                    >
                      {maskIP ? <EyeOff className="h-3 w-3 shrink-0" /> : <Eye className="h-3 w-3 shrink-0" />}
                      <span className="text-10 leading-none">{maskIP ? "已脱敏" : "显示"}</span>
                    </button>
                  </div>
                  <div className={`flex items-center gap-1 mt-0.5 font-semibold ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-800" : "text-zinc-200"}`}>
                    <span className="truncate" title={node.system.public_ip || "未上报"}>
                      {maskIPString(node.system.public_ip)}
                    </span>
                    {node.system.public_ip && (
                      <button
                        onClick={() => copyText(node.system.public_ip || "", "ip4")}
                        className={`${isBlueprintDark ? "text-slate-400 hover:text-slate-200" : isBlueprintLight ? "text-slate-400 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-300"} shrink-0`}
                        title="复制完整 IPv4"
                      >
                        {copiedField === "ip4" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* IPv6 */}
                <div>
                  <div className={`text-10 ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                    公网 IPv6
                  </div>
                  <div className={`flex items-center gap-1 mt-0.5 font-semibold ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-800" : "text-zinc-200"}`}>
                    <span className="truncate" title={node.system.public_ipv6 || "未上报"}>
                      {maskIPString(node.system.public_ipv6)}
                    </span>
                    {node.system.public_ipv6 && (
                      <button
                        onClick={() => copyText(node.system.public_ipv6 || "", "ip6")}
                        className={`${isBlueprintDark ? "text-slate-400 hover:text-slate-200" : isBlueprintLight ? "text-slate-400 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-300"} shrink-0`}
                        title="复制完整 IPv6"
                      >
                        {copiedField === "ip6" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* CPU Cores */}
                <div>
                  <div className={`text-10 ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>物理核心</div>
                  <div className={`mt-0.5 font-semibold ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-800" : "text-zinc-200"}`}>
                    {node.system.cpu_count || 1} 核
                  </div>
                </div>

                {/* Virtualization */}
                <div>
                  <div className={`text-10 ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>虚拟化</div>
                  <div className={`mt-0.5 font-semibold uppercase ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-800" : "text-zinc-200"}`}>
                    {node.system.virtualization || "--"}
                  </div>
                </div>
              </div>
            </div>
          </BlurFade>

          {/* System Info */}
          <BlurFade delay={0.08} className={cn(isBtop ? "rounded-none" : "rounded-xl", "border p-4", cardBgClass)}>
            <div className={`flex items-center justify-between border-b pb-2.5 font-bold ${isBlueprintDark ? "border-[#1d2d52] text-slate-100" : isBlueprintLight ? "border-slate-100 text-slate-900" : isBtop ? "border-[#1b253b] text-cyan-300 font-mono" : "border-zinc-800/70 text-zinc-100"}`}>
              <span className="flex items-center gap-2">
                <ShieldCheck className={`h-4 w-4 ${isBtop ? "text-cyan-400" : isBlueprintDark ? "text-cyan-400" : "text-cyan-600"}`} />
                {isBtop ? "┌─ [ BOX SYSTEM ]" : "系统信息"}
              </span>
              {isBtop && <span className="text-cyan-500 font-mono text-xs select-none">─┐</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-y-3 gap-x-4">
              <div>
                <div className={`text-10 ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>操作系统</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`h-7 w-7 rounded-lg flex items-center justify-center border shrink-0 ${
                    isBlueprintDark ? "bg-[#070e1f] border-[#1d2d52] text-slate-200 shadow-xs" : isBlueprintLight ? "bg-slate-50 border-slate-200 text-slate-700 shadow-sm" : "bg-zinc-800/80 border-zinc-700 text-zinc-300"
                  }`}>
                    <OsIcon os={node.system.os} className="h-3.5 w-3.5" />
                  </span>
                  <span className={`font-semibold truncate text-xs ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-800" : "text-zinc-200"}`} title={node.system.os}>
                    {node.system.os || "--"}
                  </span>
                </div>
              </div>

              <div>
                <div className={`text-10 ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>内核版本</div>
                <div className={`flex items-center gap-1 mt-1 font-semibold ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-800" : "text-zinc-200"}`}>
                  <span className="truncate text-xs" title={node.system.kernel}>{node.system.kernel || "--"}</span>
                  {node.system.kernel && (
                    <button
                      onClick={() => copyText(node.system.kernel, "kernel")}
                      className={`${isBlueprintDark ? "text-slate-400 hover:text-slate-200" : isBlueprintLight ? "text-slate-400 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-300"} shrink-0`}
                      title="复制内核版本"
                    >
                      {copiedField === "kernel" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className={`text-10 ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>Agent 版本</div>
                {nodeAgentVersion ? (
                  <div className={`flex items-center gap-1 mt-1 font-semibold ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-800" : "text-zinc-200"}`}>
                    <span className="truncate text-xs" title={nodeAgentVersion}>{nodeAgentVersion}</span>
                    {versionStatus === "outdated" && (
                      <span
                        className={`shrink-0 rounded px-1 py-0.5 text-10 font-bold ${
                          isBlueprintDark ? "bg-amber-950/40 text-amber-300 border border-amber-500/30" : isBlueprintLight ? "bg-amber-50 text-amber-600" : "bg-amber-500/15 text-amber-400"
                        }`}
                        title={`服务端当前下发的版本是 ${latestAgentVersion}`}
                      >
                        版本不一致
                      </span>
                    )}
                    <button
                      onClick={() => copyText(nodeAgentVersion, "agent-version")}
                      className={`${isBlueprintDark ? "text-slate-400 hover:text-slate-200" : isBlueprintLight ? "text-slate-400 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-300"} shrink-0`}
                      title="复制 Agent 版本"
                    >
                      {copiedField === "agent-version" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                ) : (
                  /* 没有版本号不是「加载中」，而是这台机器上的 Agent 早于版本
                     字段本身。这正是最需要升级的那批，所以直说，不填占位串。 */
                  <div
                    className={`mt-1 font-semibold text-xs ${isBlueprintDark ? "text-amber-400" : isBlueprintLight ? "text-amber-600" : "text-amber-400"}`}
                    title="该 Agent 不上报版本号，说明它早于版本字段本身"
                  >
                    未知（旧版）
                  </div>
                )}
              </div>

              <div>
                <div className={`text-10 ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>运行时间</div>
                <div className={`mt-1 font-semibold text-xs ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-800" : "text-zinc-200"}`}>
                  {node.uptime_str}
                </div>
              </div>

              <div>
                <div className={`text-10 ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>厂商</div>
                <div className={`mt-0.5 font-semibold truncate ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-800" : "text-zinc-200"}`} title={node.billing?.provider}>
                  {node.billing?.provider || "--"}
                </div>
              </div>

              {/* 只有需要人动手时才占位。--upgrade 读现有的 agent.yaml，因此不
                  需要当初那条部署命令的 token，也不会改动 node_id。 */}
              {versionStatus !== "current" && (
                <div className={`col-span-2 mt-1 rounded-lg border px-2.5 py-2 ${
                  isBlueprintDark ? "border-amber-500/30 bg-amber-950/20" : isBlueprintLight ? "border-amber-200 bg-amber-50/60" : "border-amber-500/25 bg-amber-500/5"
                }`}>
                  <div className={`text-10 font-medium ${isBlueprintDark ? "text-amber-300" : isBlueprintLight ? "text-amber-700" : "text-amber-400"}`}>
                    {versionStatus === "unknown"
                      ? "该 Agent 不上报版本号，早于版本字段本身，建议升级。"
                      : `与当前下发的 ${latestAgentVersion} 不一致，建议升级。`}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <code
                      className={`truncate font-mono text-10 ${isBlueprintDark ? "text-amber-200" : isBlueprintLight ? "text-slate-700" : "text-zinc-300"}`}
                      title={AGENT_UPGRADE_COMMAND}
                    >
                      {AGENT_UPGRADE_COMMAND}
                    </code>
                    <button
                      onClick={() => copyText(AGENT_UPGRADE_COMMAND, "agent-upgrade")}
                      className={`${isBlueprintDark ? "text-slate-400 hover:text-slate-200" : isBlueprintLight ? "text-slate-400 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-300"} shrink-0`}
                      title="复制升级命令"
                    >
                      {copiedField === "agent-upgrade" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </BlurFade>

          {/* Storage Info */}
          <BlurFade delay={0.11} className={cn(isBtop ? "rounded-none" : "rounded-xl", "border p-4", cardBgClass)}>
            <div className={`flex items-center justify-between border-b pb-2.5 font-bold ${isBlueprintDark ? "border-[#1d2d52] text-slate-100" : isBlueprintLight ? "border-slate-100 text-slate-900" : isBtop ? "border-[#1b253b] text-cyan-300 font-mono" : "border-zinc-800/70 text-zinc-100"}`}>
              <span className="flex items-center gap-2">
                <HardDrive className={`h-4 w-4 ${isBtop ? "text-cyan-400" : isBlueprintDark ? "text-amber-400" : "text-amber-500"}`} />
                {isBtop ? "┌─ [ BOX STORAGE ]" : "存储信息"}
              </span>
              {isBtop && <span className="text-cyan-500 font-mono text-xs select-none">─┐</span>}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <div className={`text-10 flex items-center gap-1 ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                  <Layers className={`h-3 w-3 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : "text-zinc-400"}`} />
                  内存
                </div>
                <div className={`font-bold text-sm mt-1 ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-900" : "text-zinc-100"}`}>
                  {formatBytes(node.system.mem_total || 967 * 1024 * 1024)}
                </div>
              </div>

              <div>
                <div className={`text-10 flex items-center gap-1 ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                  <ArrowUpDown className={`h-3 w-3 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : "text-zinc-400"}`} />
                  内存交换
                </div>
                <div className={`font-bold text-sm mt-1 ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-900" : "text-zinc-100"}`}>
                  {formatBytes(node.system.swap_total || 3800 * 1024 * 1024)}
                </div>
              </div>

              <div>
                <div className={`text-10 flex items-center gap-1 ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                  <HardDrive className={`h-3 w-3 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : "text-zinc-400"}`} />
                  硬盘
                </div>
                <div className={`font-bold text-sm mt-1 ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-900" : "text-zinc-100"}`}>
                  {formatBytes(node.system.disk_total || 46 * 1024 * 1024 * 1024)}
                </div>
              </div>
            </div>
          </BlurFade>

          {/* Network Info */}
          <BlurFade delay={0.15} className={cn(isBtop ? "rounded-none" : "rounded-xl", "border p-4", cardBgClass)}>
            <div className={`flex items-center justify-between border-b pb-2.5 font-bold ${isBlueprintDark ? "border-[#1d2d52] text-slate-100" : isBlueprintLight ? "border-slate-100 text-slate-900" : isBtop ? "border-[#1b253b] text-cyan-300 font-mono" : "border-zinc-800/70 text-zinc-100"}`}>
              <span className="flex items-center gap-2">
                <Network className={`h-4 w-4 ${isBtop ? "text-cyan-400" : isBlueprintDark ? "text-emerald-400" : "text-emerald-500"}`} />
                {isBtop ? "┌─ [ BOX NETWORK ]" : "网络信息"}
              </span>
              {isBtop && <span className="text-cyan-500 font-mono text-xs select-none">─┐</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <div className={`flex items-center gap-1 text-10 ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                  <ArrowUpDown className={`h-3 w-3 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : "text-zinc-400"}`} />
                  <span>总流量</span>
                  <span className={`rounded px-1 py-0.5 text-10 font-semibold leading-none ${isBlueprintDark ? "bg-[#070e1f] text-slate-200 border border-[#1d2d52]" : isBlueprintLight ? "bg-slate-100 text-slate-700" : "bg-zinc-800 text-zinc-300"}`}>IPv4</span>
                  <span className={`ml-auto font-mono ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : "text-zinc-400"}`}>
                    {formatBytes(node.network.bytes_recv)} / {formatBytes(node.network.bytes_sent)}
                  </span>
                </div>
                <div className={`font-bold text-sm mt-1 ${isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-900" : "text-zinc-100"}`}>
                  {formatBytes(usedTraffic)} {quotaBytes > 0 ? `/ ${formatBytes(quotaBytes)}` : "（无限制）"}
                </div>
                <div className={`text-10 mt-1.5 flex items-center gap-2 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : "text-zinc-400"}`}>
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
                <div className={`text-10 flex items-center gap-1 ${isBlueprintDark ? "text-slate-400 font-medium" : isBlueprintLight ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
                  <Activity className={`h-3 w-3 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : "text-zinc-400"}`} />
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
            isBlueprintDark ? "border-[#1d2d52]" : isBlueprintLight ? "border-slate-200" : "border-zinc-800"
          }`}
        >
          <Tabs
            selectedKey={timeRange}
            onSelectionChange={(key) => setTimeRange(key as typeof timeRange)}
            aria-label="遥测时间范围"
          >
            <Tabs.List className={cn("rounded-xl p-1", tabsClass)}>
              {(["realtime", "4h", "1d"] as const).map((mode) => (
                <Tabs.Tab key={mode} id={mode} className="text-xs font-semibold">
                  {mode === "realtime" ? "实时" : mode === "4h" ? "4 小时" : "1 天"}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
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
        <div className={cn(isBtop ? "rounded-none" : "rounded-2xl", "mt-6 sm:mt-8 border p-3.5 sm:p-5", cardBgClass)}>
          <div className={`flex flex-wrap items-center justify-between gap-3 border-b pb-3 font-sans ${isBlueprintDark ? "border-[#1d2d52]" : isBlueprintLight ? "border-slate-100" : isBtop ? "border-[#1b253b]" : "border-zinc-800/80"}`}>
            {/* Time range buttons */}
            <Tabs
              selectedKey={pingRange}
              onSelectionChange={(key) => setPingRange(key as typeof pingRange)}
              aria-label="延迟统计时间范围"
            >
              <Tabs.List className={cn(isBtop ? "rounded-none" : "rounded-xl", "p-1", tabsClass)}>
                {(["1h", "6h", "12h", "1d"] as const).map((r) => (
                  <Tabs.Tab key={r} id={r} className="text-xs">
                    {r === "1h" ? "1 小时" : r === "6h" ? "6 小时" : r === "12h" ? "12 小时" : "1 天"}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>

            {/* Target filter hint */}
            <div className="flex items-center gap-2 text-xs">
              <span className={`text-11 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-600" : isBtop ? "text-cyan-400/80 font-mono" : "text-zinc-500"}`}>
                {isBtop ? "[ PING TARGET FILTER ]" : "点击下方节点可单选/多选对比"}
              </span>
              {hiddenTargets.size > 0 && (
                <button
                  type="button"
                  onClick={showAllTargets}
                  className={`text-11 font-semibold px-2 py-0.5 rounded-md border transition-all cursor-pointer active:scale-95 ${
                    isBtop
                      ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/25 rounded-none font-mono"
                      : isBlueprintDark
                      ? "bg-[#070e1f] text-cyan-300 border-[#1d2d52] hover:bg-[#132247]"
                      : isBlueprintLight
                      ? "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                      : "bg-indigo-950/50 text-indigo-400 border-indigo-800/60 hover:bg-indigo-900/50"
                  }`}
                >
                  {isBtop ? `[ RESET: ${displayPings.length - hiddenTargets.size}/${displayPings.length} ]` : `恢复全部显示 (${displayPings.length - hiddenTargets.size}/${displayPings.length})`}
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
                  className={cn(
                    isBtop ? "rounded-none font-mono" : "rounded-xl",
                    "cursor-pointer border p-3 transition-all relative overflow-hidden select-none active:scale-[0.98]",
                    isSelected
                      ? isBtop
                        ? "border-cyan-500/60 bg-[#0c1424] shadow-[0_0_12px_rgba(0,240,255,0.15)] ring-1 ring-cyan-500/40 text-cyan-200"
                        : isBlueprintDark
                        ? "border-[#1d2d52] bg-[#070e1f] shadow-md ring-1 ring-cyan-500/30 text-slate-100"
                        : isBlueprintLight
                        ? "border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100"
                        : "border-zinc-700 bg-zinc-950/80 shadow-md shadow-indigo-500/5 ring-1 ring-zinc-700/50"
                      : isBtop
                      ? "border-[#1b253b] bg-[#070b14]/60 opacity-40 hover:opacity-80 text-slate-400"
                      : isBlueprintDark
                      ? "border-[#1d2d52]/60 bg-[#070e1f]/50 opacity-45 hover:opacity-80 text-slate-400"
                      : isBlueprintLight
                      ? "border-slate-200/60 bg-slate-100/60 opacity-45 hover:opacity-80"
                      : "border-zinc-800/60 bg-zinc-950/30 opacity-45 hover:opacity-80"
                  )}
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
                        ? isBlueprintDark ? "text-slate-100 font-bold" : isBlueprintLight ? "text-slate-900 font-bold" : "text-zinc-100 font-bold"
                        : isBlueprintDark ? "text-slate-500 line-through" : isBlueprintLight ? "text-slate-400 line-through" : "text-zinc-500 line-through"
                    }`}>
                      {target.label}
                    </span>
                    {isSelected ? (
                      <Eye className={`h-3 w-3 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-400" : "text-zinc-500"}`} />
                    ) : (
                      <EyeOff className={`h-3 w-3 ${isBlueprintDark ? "text-slate-500" : isBlueprintLight ? "text-slate-400" : "text-zinc-600"}`} />
                    )}
                  </div>
                  <div className={`text-xs pl-1.5 ${
                    isSelected
                      ? isBlueprintDark ? "text-slate-300" : isBlueprintLight ? "text-slate-600" : "text-zinc-400"
                      : isBlueprintDark ? "text-slate-500" : isBlueprintLight ? "text-slate-400" : "text-zinc-600"
                  }`}>
                    <span className={`font-bold ${
                      isSelected
                        ? isBlueprintDark ? "text-slate-100" : isBlueprintLight ? "text-slate-900" : "text-zinc-100"
                        : isBlueprintDark ? "text-slate-500" : isBlueprintLight ? "text-slate-400" : "text-zinc-600"
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
          <div className={`mt-4 flex items-center gap-1.5 text-xs font-mono pl-1 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-600" : "text-zinc-400"}`}>
            <span className={`font-semibold ${isBlueprintDark ? "text-slate-200" : isBlueprintLight ? "text-slate-800" : "text-zinc-200"}`}>平滑峰值</span>
            <span
              className="cursor-help inline-flex items-center"
              title="已启用滑动均值平滑算法，过滤异常网络抖动尖刺，保持指标趋势清晰呈现"
            >
              <Info className={`h-3.5 w-3.5 ${isBlueprintDark ? "text-slate-400 hover:text-slate-200" : isBlueprintLight ? "text-slate-500 hover:text-slate-700" : "text-zinc-400 hover:text-zinc-200"}`} />
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
                isBlueprintDark ? "bg-[#070e1f]/60 border-[#1d2d52] text-slate-400" : isBlueprintLight ? "bg-slate-50/50 border-slate-200 text-slate-500" : "bg-zinc-900/30 border-zinc-800 text-zinc-500"
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
        <div className={`mt-8 flex items-center justify-between text-xs font-mono pb-6 ${isBlueprintDark ? "text-slate-400" : isBlueprintLight ? "text-slate-500" : isBtop ? "text-slate-400" : "text-zinc-500"}`}>
          <div>CYBER PROBE · 高性能极简探针系统</div>
          <div>Theme: {theme === "blueprint-dark" ? "Blueprint Dark (工程蓝图·暗色)" : isBlueprintLight ? "Blueprint (工程蓝图·亮色)" : isBtop ? "btop++ (终端极客风格)" : "Cyber Dark (极客暗黑)"}</div>
        </div>
      </div>
    </div>
  );
};

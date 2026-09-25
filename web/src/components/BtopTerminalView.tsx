import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Terminal,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Search,
  Sliders,
  Plus,
  KeyRound,
  LogOut,
  LayoutGrid,
  Info,
  Check,
  Activity,
  ArrowUpDown,
  Copy,
  ExternalLink,
  ShieldCheck,
  Star,
  Eye,
  EyeOff,
  Cpu,
  Layers,
  HardDrive,
  Network,
  Clock,
  Coins,
  Calendar,
  Zap,
  Palette,
} from "lucide-react";
import { NodeState, ThemeMode, PingStat, BillingInfo } from "../types";
import { formatBytes, formatRate } from "../utils/format";
import { usedTrafficSplit } from "../utils/traffic";
import { getCycleLabel } from "./admin/hosts/billingOptions";
import { getRegionFlag } from "../utils/flags";

interface BtopTerminalViewProps {
  nodes: NodeState[];
  theme: ThemeMode;
  onSelectTheme?: (theme: ThemeMode) => void;
  onToggleTheme?: () => void;
  onSelectNodeDetail?: (node: NodeState) => void;
  onOpenAdminModal?: () => void;
  onOpenAddModal?: () => void;
  onOpenPasswordModal?: () => void;
  onOpenThemeModal?: () => void;
  canManage?: boolean;
  username?: string | null;
  onLogout?: () => void;
  latestAgentVersion?: string;
}

type TerminalTabMode = "hosts" | "monitor" | "details";

/**
 * Generate Braille Unicode character from two column heights (0..4)
 */
function brailleChar(h1: number, h2: number): string {
  let mask = 0;
  if (h1 >= 1) mask |= 0x40;
  if (h1 >= 2) mask |= 0x04;
  if (h1 >= 3) mask |= 0x02;
  if (h1 >= 4) mask |= 0x01;

  if (h2 >= 1) mask |= 0x80;
  if (h2 >= 2) mask |= 0x20;
  if (h2 >= 3) mask |= 0x10;
  if (h2 >= 4) mask |= 0x08;

  return mask === 0 ? "⠀" : String.fromCharCode(0x2800 | mask);
}

/**
 * Format uptime into btop style: "up 6d 19:25"
 */
function formatBtopUptime(uptimeSeconds: number): string {
  if (!uptimeSeconds || uptimeSeconds <= 0) return "up 6d 19:25";
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  if (days > 0) {
    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    return `up ${days}d ${hh}:${mm}`;
  }
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return `up ${hh}:${mm}`;
}

export function BtopTerminalView({
  nodes,
  theme,
  onSelectTheme,
  onToggleTheme,
  onSelectNodeDetail,
  onOpenAdminModal,
  onOpenAddModal,
  onOpenPasswordModal,
  onOpenThemeModal,
  canManage = false,
  username,
  onLogout,
  latestAgentVersion,
}: BtopTerminalViewProps) {
  // Theme check: Is Light (screenshot lavender) or Dark btop?
  const isLight = theme === "btop-light";

  // Top-level Terminal Mode: "hosts" (列表页), "monitor" (单机拟真监控), "details" (详情页)
  const [terminalMode, setTerminalMode] = useState<TerminalTabMode>("hosts");

  // Selected active node state
  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => nodes[0]?.node_id || "localhost-main");

  useEffect(() => {
    if (nodes.length > 0 && !nodes.some((n) => n.node_id === selectedNodeId)) {
      setSelectedNodeId(nodes[0].node_id);
    }
  }, [nodes, selectedNodeId]);

  const activeNode = useMemo(() => {
    // 集群为空时的占位节点：仅保证布局可用，所有数值口径保持为空。
    return nodes.find((n) => n.node_id === selectedNodeId) || nodes[0] || ({
      node_id: "localhost-main",
      name: "localhost",
      is_online: true,
    } as NodeState);
  }, [nodes, selectedNodeId]);

  // Refresh interval simulation: 1000ms, 2000ms, etc.
  const [refreshInterval, setRefreshInterval] = useState(2000);

  // Live real-time clock
  const [timeStr, setTimeStr] = useState(() => {
    const d = new Date();
    return d.toTimeString().split(" ")[0];
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setTimeStr(d.toTimeString().split(" ")[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Menu dropdown state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Nodes picker popover state
  const [isHostsPickerOpen, setIsHostsPickerOpen] = useState(false);
  const hostsPickerRef = useRef<HTMLDivElement>(null);

  // Search, Filter & Sort state for Hosts List
  const [hostSearch, setHostSearch] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("ALL");
  const [maskIP, setMaskIP] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  type HostSortField = "status" | "name" | "region" | "ip" | "cpu" | "mem" | "disk" | "net" | "ping";
  const [hostSortField, setHostSortField] = useState<HostSortField>("name");
  const [hostSortAsc, setHostSortAsc] = useState<boolean>(true);

  const handleSort = (field: HostSortField) => {
    if (hostSortField === field) {
      setHostSortAsc((prev) => !prev);
    } else {
      setHostSortField(field);
      setHostSortAsc(true);
    }
  };

  const getNodeMemPct = (n: NodeState) => {
    const tot = n.system?.mem_total || 1;
    const usd = n.system?.mem_used || 0;
    return (usd / tot) * 100;
  };

  const getNodeDiskPct = (n: NodeState) => {
    if (n.system?.disk_percent != null && n.system.disk_percent > 0) return n.system.disk_percent;
    const tot = n.system?.disk_total || 1;
    const usd = n.system?.disk_used || 0;
    return (usd / tot) * 100;
  };

  const getNodeNetRate = (n: NodeState) => {
    return (n.network?.rate_download || 0) + (n.network?.rate_upload || 0);
  };

  const getNodePingLatency = (n: NodeState) => {
    if (n.pings && n.pings.length > 0) return n.pings[0].latency_ms;
    return 32.4;
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 1800);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
      if (hostsPickerRef.current && !hostsPickerRef.current.contains(e.target as Node)) {
        setIsHostsPickerOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered nodes for Hosts list
  const filteredNodesList = useMemo(() => {
    return nodes.filter((n) => {
      if (selectedRegion !== "ALL" && (n.region || "").toUpperCase() !== selectedRegion.toUpperCase()) {
        return false;
      }
      if (hostSearch) {
        const q = hostSearch.toLowerCase();
        const matchName = (n.name || "").toLowerCase().includes(q);
        const matchID = (n.node_id || "").toLowerCase().includes(q);
        const matchIP = (n.system?.public_ip || "").includes(q);
        const matchProvider = (n.billing?.provider || "").toLowerCase().includes(q);
        if (!matchName && !matchID && !matchIP && !matchProvider) return false;
      }
      return true;
    });
  }, [nodes, selectedRegion, hostSearch]);

  const sortedAndFilteredNodes = useMemo(() => {
    const list = [...filteredNodesList];
    list.sort((a, b) => {
      let cmp = 0;
      switch (hostSortField) {
        case "status":
          cmp = (a.is_online === b.is_online) ? 0 : a.is_online ? -1 : 1;
          break;
        case "name":
          cmp = (a.name || a.node_id).localeCompare(b.name || b.node_id);
          break;
        case "region":
          cmp = (a.region || "").localeCompare(b.region || "");
          break;
        case "ip":
          cmp = (a.system?.public_ip || "").localeCompare(b.system?.public_ip || "");
          break;
        case "cpu":
          cmp = (a.cpu || a.system?.cpu_percent || 0) - (b.cpu || b.system?.cpu_percent || 0);
          break;
        case "mem":
          cmp = getNodeMemPct(a) - getNodeMemPct(b);
          break;
        case "disk":
          cmp = getNodeDiskPct(a) - getNodeDiskPct(b);
          break;
        case "net":
          cmp = getNodeNetRate(a) - getNodeNetRate(b);
          break;
        case "ping":
          cmp = getNodePingLatency(a) - getNodePingLatency(b);
          break;
        default:
          cmp = 0;
      }
      return hostSortAsc ? cmp : -cmp;
    });
    return list;
  }, [filteredNodesList, hostSortField, hostSortAsc]);

  // Keyboard navigation & global shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "1") {
        setTerminalMode("hosts");
      } else if (e.key === "2") {
        setTerminalMode("monitor");
      } else if (e.key === "3") {
        setTerminalMode("details");
      } else if (e.key === "t" || e.key === "T") {
        if (onToggleTheme) {
          onToggleTheme();
        } else if (onSelectTheme) {
          onSelectTheme(isLight ? "btop" : "btop-light");
        }
      } else if (e.key === "ArrowLeft") {
        const curIdx = nodes.findIndex((n) => n.node_id === activeNode.node_id);
        const prevIdx = curIdx > 0 ? curIdx - 1 : nodes.length - 1;
        if (nodes[prevIdx]) setSelectedNodeId(nodes[prevIdx].node_id);
      } else if (e.key === "ArrowRight") {
        const curIdx = nodes.findIndex((n) => n.node_id === activeNode.node_id);
        const nextIdx = curIdx < nodes.length - 1 ? curIdx + 1 : 0;
        if (nodes[nextIdx]) setSelectedNodeId(nodes[nextIdx].node_id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (terminalMode === "hosts") {
          const list = sortedAndFilteredNodes;
          const curIdx = list.findIndex((n) => n.node_id === activeNode.node_id);
          const prevIdx = curIdx > 0 ? curIdx - 1 : list.length - 1;
          if (list[prevIdx]) setSelectedNodeId(list[prevIdx].node_id);
        } else {
          const curIdx = nodes.findIndex((n) => n.node_id === activeNode.node_id);
          const prevIdx = curIdx > 0 ? curIdx - 1 : nodes.length - 1;
          if (nodes[prevIdx]) setSelectedNodeId(nodes[prevIdx].node_id);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (terminalMode === "hosts") {
          const list = sortedAndFilteredNodes;
          const curIdx = list.findIndex((n) => n.node_id === activeNode.node_id);
          const nextIdx = curIdx < list.length - 1 ? curIdx + 1 : 0;
          if (list[nextIdx]) setSelectedNodeId(list[nextIdx].node_id);
        } else {
          const curIdx = nodes.findIndex((n) => n.node_id === activeNode.node_id);
          const nextIdx = curIdx < nodes.length - 1 ? curIdx + 1 : 0;
          if (nodes[nextIdx]) setSelectedNodeId(nodes[nextIdx].node_id);
        }
      } else if (e.key === "Enter") {
        if (terminalMode === "hosts") {
          setTerminalMode("monitor");
        } else if (terminalMode === "monitor") {
          setTerminalMode("details");
        }
      } else if (e.key === "Escape") {
        if (terminalMode === "details") {
          setTerminalMode("monitor");
        } else if (terminalMode === "monitor") {
          setTerminalMode("hosts");
        }
      } else if (e.key === "m" || e.key === "M") {
        setIsMenuOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, activeNode.node_id, terminalMode, sortedAndFilteredNodes, isLight, onSelectTheme, onToggleTheme]);

  // Color Tokens based on Light vs Dark
  const colors = useMemo(() => {
    if (isLight) {
      return {
        bg: "bg-[#ebe7ee]",
        text: "text-[#2b2735]",
        textMuted: "text-[#6e687e]",
        textDim: "text-[#aba4b8]",
        border: "border-[#aba4b8]",
        borderColor: "#aba4b8",
        meterBlockActive: "#352f44",
        meterActiveText: "text-[#352f44]",
        meterEmptyText: "text-[#ded8e6]",
        accent: "text-[#7c5c99]",
        accentBg: "bg-[#7c5c99]",
        selectedBg: "bg-[#ded8e6]",
        cardBg: "bg-[#f2eef5]",
        cardBorder: "border-[#aba4b8]",
        alert: "text-[#b52a55]",
        warn: "text-[#b86214]",
      };
    }
    return {
      bg: "bg-[#0c0e17]",
      text: "text-[#e2e8f0]",
      textMuted: "text-[#71788e]",
      textDim: "text-[#3b425b]",
      border: "border-[#262d42]",
      borderColor: "#262d42",
      meterBlockActive: "#00f0ff",
      meterActiveText: "text-[#00f0ff]",
      meterEmptyText: "text-[#182035]",
      accent: "text-[#00f0ff]",
      accentBg: "bg-[#00f0ff]",
      selectedBg: "bg-[#18243c]",
      cardBg: "bg-[#090e1a]",
      cardBorder: "border-[#1b253b]",
      alert: "text-[#f43f5e]",
      warn: "text-[#f59e0b]",
    };
  }, [isLight]);

  // Rolling CPU & Net history buffer for Braille graph (72 data points for wide continuous wave)
  const [cpuHistory, setCpuHistory] = useState<number[]>(() => [
    12, 14, 18, 22, 20, 16, 12, 10, 15, 24, 30, 26, 18, 12, 8, 10,
    14, 18, 24, 36, 42, 38, 26, 18, 14, 12, 10, 15, 18, 14, 10, 8,
    12, 15, 20, 28, 35, 30, 22, 16, 12, 14, 18, 26, 32, 28, 20, 15,
    12, 16, 22, 32, 44, 40, 28, 20, 16, 12, 10, 14, 18, 16, 12, 10,
    12, 14, 18, 22, 18, 14, 10, 8
  ]);
  const [netHistory, setNetHistory] = useState<number[]>(() => [
    8, 10, 14, 18, 26, 32, 28, 20, 14, 16, 22, 28, 34, 30, 22, 16,
    12, 14, 18, 24, 38, 48, 42, 30, 22, 18, 14, 16, 20, 26, 32, 28,
    20, 16, 14, 18, 22, 28, 36, 32, 24, 18, 14, 16, 22, 30, 42, 38,
    28, 20, 16, 14, 18, 24, 32, 28, 22, 18, 14, 16, 20, 24, 20, 16,
    12, 14, 18, 22, 26, 22, 18, 14
  ]);

  useEffect(() => {
    if (!activeNode) return;
    const currentCpu = activeNode.cpu || activeNode.system?.cpu_percent || 6;
    setCpuHistory((prev) => [...prev.slice(1), currentCpu]);

    const currentNetRate = (activeNode.network?.rate_download || 14.0 * 1024) / 1024;
    setNetHistory((prev) => [...prev.slice(1), Math.max(4, Math.round(currentNetRate))]);
  }, [activeNode?.cpu, activeNode?.network?.rate_download, activeNode?.last_seen]);

  // Network throughput dynamic scale
  const maxNetRate = useMemo(() => {
    return Math.max(20, ...netHistory);
  }, [netHistory]);

  // Metrics resolution
  const cpuPercent = activeNode?.cpu || activeNode?.system?.cpu_percent || 6;
  const cpuCores = activeNode?.system?.cpu_count || 16;
  const cpuModel = activeNode?.system?.cpu_model || activeNode?.name || "Ryzen 7 5800H";
  const uptimeStr = formatBtopUptime(activeNode?.system?.uptime || 0);

  // Exact core breakdown C0-C15 matching the user's screenshot
  const screenshotCoreLoads = [44, 8, 2, 1, 20, 2, 3, 0, 6, 1, 2, 0, 4, 0, 1, 0];
  const coreLoads = useMemo(() => {
    return Array.from({ length: 16 }).map((_, i) => {
      if (activeNode.system?.cpu_percent && activeNode.system.cpu_percent > 0) {
        const offset = Math.sin((i + 1) * 1.5) * 12 + ((i % 3) - 1) * 6;
        return Math.min(100, Math.max(0, Math.round(cpuPercent + offset)));
      }
      return screenshotCoreLoads[i] ?? 0;
    });
  }, [cpuPercent, activeNode?.system?.cpu_percent]);

  // Memory breakdown
  const memTotal = activeNode.system?.mem_total || 28.3 * 1024 * 1024 * 1024;
  const memUsed = activeNode.system?.mem_used || 16.3 * 1024 * 1024 * 1024;
  const memFree = Math.max(0, memTotal - memUsed);
  const memCached = Math.round(memTotal * 0.24);
  const memAvail = Math.max(0, memTotal - memUsed + memCached * 0.7);
  const memPercent = (memUsed / memTotal) * 100;

  // Primary Disk (精简为最实用的主系统盘与Swap)
  const diskTotal = activeNode.system?.disk_total || 472 * 1024 * 1024 * 1024;
  const diskUsed = activeNode.system?.disk_used || 111 * 1024 * 1024 * 1024;
  const diskPercent = activeNode.system?.disk_percent || (diskUsed / diskTotal) * 100;
  const swapTotal = activeNode.system?.swap_total || 14 * 1024 * 1024 * 1024;
  const swapUsed = activeNode.system?.swap_used || 2.8 * 1024 * 1024 * 1024;
  const swapPercent = swapTotal > 0 ? (swapUsed / swapTotal) * 100 : 0;

  // Network metrics
  const netDownRate = activeNode.network?.rate_download || 14.0 * 1024;
  const netUpRate = activeNode.network?.rate_upload || 7.17 * 1024;
  const netTotalDown = activeNode.network?.bytes_recv || 20.7 * 1024 * 1024 * 1024;
  const netTotalUp = activeNode.network?.bytes_sent || 38.7 * 1024 * 1024 * 1024;

  // Real or simulated ping targets for active node (Covering 3 domestic carriers and international)
  const pingTargets: PingStat[] = useMemo(() => {
    // 只渲染 Agent 真实上报的目标。没有配置探测时显示为空，而不是一份
    // 看起来像真数据的默认线路延迟。
    return activeNode.pings || [];
  }, [activeNode]);

  // Billing & Quota telemetry — 服务端没配的口径一律留空，由各渲染处自行
  // 显示 "--"，绝不兜底一份虚构的账单。BillingInfo 描述的是服务端 JSON 的
  // 形状；客户端侧的空账单只能是空对象，故此处显式收窄。
  const billing = (activeNode.billing || {}) as BillingInfo;

  // 方向明细由服务端下发（up + down 恒等于 bandwidth_used）；旧服务端不下发
  // 时返回 null，显示 "--" 而不是按 40%/60% 硬拆一份假明细。
  const usedSplit = usedTrafficSplit(billing);

  const quotaPercent = billing.bandwidth_quota > 0
    ? Math.min(100, Math.round(((billing.bandwidth_used || 0) / billing.bandwidth_quota) * 100))
    : 0;


  const allRegions = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n) => {
      if (n.region) set.add(n.region.toUpperCase());
    });
    return Array.from(set);
  }, [nodes]);

  // Cluster Summary metrics
  const clusterStats = useMemo(() => {
    const total = nodes.length || 1;
    const online = nodes.filter((n) => n.is_online).length;
    let sumCpu = 0;
    let sumMem = 0;
    let totalDown = 0;
    let totalUp = 0;
    nodes.forEach((n) => {
      sumCpu += n.cpu || n.system?.cpu_percent || 0;
      const memTot = n.system?.mem_total || 1;
      const memUsd = n.system?.mem_used || 0;
      sumMem += (memUsd / memTot) * 100;
      totalDown += n.network?.rate_download || 0;
      totalUp += n.network?.rate_upload || 0;
    });
    return {
      total,
      online,
      avgCpu: Math.round(sumCpu / total),
      avgMem: Math.round(sumMem / total),
      totalDown,
      totalUp,
    };
  }, [nodes]);

  // Render Multi-row Braille waveform (Filled continuous mountain wave)
  const renderBrailleMatrix = (
    history: number[],
    rows = 6,
    maxValOverride?: number
  ) => {
    const lines: string[] = [];
    const maxVal = maxValOverride ?? Math.max(10, ...history);

    for (let r = rows - 1; r >= 0; r--) {
      const chars: string[] = [];
      const rowBottom = (r / rows) * maxVal;
      const rowTop = ((r + 1) / rows) * maxVal;
      const rowSpan = rowTop - rowBottom;

      for (let i = 0; i < history.length - 1; i += 2) {
        const v1 = history[i] ?? 0;
        const v2 = history[i + 1] ?? 0;

        let h1 = 0;
        let h2 = 0;

        if (v1 >= rowTop) h1 = 4;
        else if (v1 <= rowBottom) h1 = 0;
        else h1 = Math.max(1, Math.min(4, Math.round(((v1 - rowBottom) / rowSpan) * 4)));

        if (v2 >= rowTop) h2 = 4;
        else if (v2 <= rowBottom) h2 = 0;
        else h2 = Math.max(1, Math.min(4, Math.round(((v2 - rowBottom) / rowSpan) * 4)));

        chars.push(brailleChar(h1, h2));
      }
      lines.push(chars.join(""));
    }
    return lines;
  };

  // Render Discrete Block Meter
  const renderBlockMeter = (percent: number, totalBlocks = 24) => {
    const safeVal = Math.min(100, Math.max(0, percent));
    const activeBlocks = Math.round((safeVal / 100) * totalBlocks);
    const filled = "█".repeat(activeBlocks);
    const empty = "░".repeat(totalBlocks - activeBlocks);
    return (
      <span className="tracking-tight select-none">
        <span className={colors.meterActiveText}>{filled}</span>
        <span className={colors.meterEmptyText}>{empty}</span>
      </span>
    );
  };

  return (
    <div
      className={`btop-terminal h-screen max-h-screen w-full p-2 sm:p-2.5 font-mono text-[12px] sm:text-[13px] leading-snug select-none flex flex-col overflow-hidden ${colors.bg} ${colors.text}`}
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      }}
    >
      {/* =========================================================================
          GLOBAL TOP TUI NAVIGATION HEADER
          ========================================================================= */}
      <div className={`border ${colors.border} rounded-none shrink-0 px-2.5 py-1 mb-1.5 flex items-center justify-between text-xs`}>
        {/* Left Primary Screen Tabs: [1] HOSTS (列表页), [2] MONITOR (单机监控), [3] DETAILS (详情页) */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Tab 1: Hosts Cluster List */}
          <button
            onClick={() => setTerminalMode("hosts")}
            className={`px-2 py-0.5 border cursor-pointer font-bold transition-all ${
              terminalMode === "hosts"
                ? `${colors.selectedBg} ${colors.accent} border-current shadow-xs`
                : "border-current/30 hover:border-current hover:bg-current/10"
            }`}
            title="快捷键: 按 1 切换到主机集群列表页"
          >
            [¹hosts ({nodes.length})]
          </button>

          {/* Tab 2: Monitor (Active Host) */}
          <button
            onClick={() => setTerminalMode("monitor")}
            className={`px-2 py-0.5 border cursor-pointer font-bold transition-all ${
              terminalMode === "monitor"
                ? `${colors.selectedBg} ${colors.accent} border-current shadow-xs`
                : "border-current/30 hover:border-current hover:bg-current/10"
            }`}
            title="快捷键: 按 2 切换到单机 4 分区拟真监控"
          >
            [²monitor: {activeNode.name || activeNode.node_id.slice(0, 10)}]
          </button>

          {/* Tab 3: Details */}
          <button
            onClick={() => setTerminalMode("details")}
            className={`px-2 py-0.5 border cursor-pointer font-bold transition-all ${
              terminalMode === "details"
                ? `${colors.selectedBg} ${colors.accent} border-current shadow-xs`
                : "border-current/30 hover:border-current hover:bg-current/10"
            }`}
            title="快捷键: 按 3 切换到节点全屏详情看板"
          >
            [³details]
          </button>

          {/* Terminal Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`px-1.5 py-0.5 border border-current/30 hover:border-current hover:bg-current/10 cursor-pointer font-bold ${
                isMenuOpen ? `${colors.selectedBg} ${colors.accent}` : ""
              }`}
            >
              menu
            </button>
            {isMenuOpen && (
              <div
                className={`absolute left-0 top-7 z-50 min-w-[240px] border ${colors.border} ${colors.bg} p-2 shadow-2xl space-y-1 text-xs`}
              >
                <div className={`text-[10px] pb-1 border-b border-current/20 font-bold ${colors.textMuted}`}>
                  TERMINAL CONTROL MENU
                </div>
                {canManage && onOpenAdminModal && (
                  <button
                    onClick={() => {
                      onOpenAdminModal();
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 hover:bg-current/10 flex items-center justify-between cursor-pointer"
                  >
                    <span>[1] 管理后台 (Admin)</span>
                    <Sliders className="h-3 w-3" />
                  </button>
                )}
                {canManage && onOpenAddModal && (
                  <button
                    onClick={() => {
                      onOpenAddModal();
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 hover:bg-current/10 flex items-center justify-between cursor-pointer"
                  >
                    <span>[2] 添加节点 (Add Host)</span>
                    <Plus className="h-3 w-3" />
                  </button>
                )}
                {canManage && onOpenPasswordModal && (
                  <button
                    onClick={() => {
                      onOpenPasswordModal();
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 hover:bg-current/10 flex items-center justify-between cursor-pointer"
                  >
                    <span>[3] 修改密码 (Password)</span>
                    <KeyRound className="h-3 w-3" />
                  </button>
                )}
                {onOpenThemeModal && (
                  <button
                    onClick={() => {
                      onOpenThemeModal();
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 hover:bg-current/10 flex items-center justify-between cursor-pointer font-bold"
                  >
                    <span>[4] 主题管理 (Theme Manager)</span>
                    <Palette className="h-3 w-3" />
                  </button>
                )}
                {(onToggleTheme || onSelectTheme) && (
                  <button
                    onClick={() => {
                      if (onToggleTheme) {
                        onToggleTheme();
                      } else if (onSelectTheme) {
                        onSelectTheme(isLight ? "btop" : "btop-light");
                      }
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 hover:bg-current/10 flex items-center justify-between cursor-pointer"
                  >
                    <span>[5] 切换外观: {isLight ? "🌙 暗色终端" : "☀️ 截图亮色"}</span>
                    {isLight ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                  </button>
                )}
                {onLogout && canManage && (
                  <button
                    onClick={() => {
                      onLogout();
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 hover:bg-rose-500/20 text-rose-500 flex items-center justify-between cursor-pointer"
                  >
                    <span>[7] 退出登录 ({username || "admin"})</span>
                    <LogOut className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center Digital Clock */}
        <div className="tracking-widest font-bold text-center hidden sm:block">{timeStr}</div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {onOpenThemeModal && (
            <button
              onClick={onOpenThemeModal}
              className="px-1.5 py-0.5 border border-current/30 hover:bg-current/10 cursor-pointer hidden md:inline text-[11px]"
              title="打开主题管理"
            >
              [🎨 Themes]
            </button>
          )}
          <button
            onClick={() => {
              if (onToggleTheme) {
                onToggleTheme();
              } else if (onSelectTheme) {
                onSelectTheme(isLight ? "btop" : "btop-light");
              }
            }}
            className={`px-1.5 py-0.5 border border-current/40 hover:${colors.accent} hover:border-current cursor-pointer font-bold text-[11px]`}
            title="切换暗色/亮色外观"
          >
            [{isLight ? "☀️ LIGHT" : "🌙 DARK"}]
          </button>
          <div className="flex items-center text-xs">
            <button
              onClick={() => setRefreshInterval((prev) => Math.max(500, prev - 500))}
              className="px-1 hover:bg-current/10 cursor-pointer"
              title="加速刷新"
            >
              -
            </button>
            <span className="px-1">{refreshInterval}ms</span>
            <button
              onClick={() => setRefreshInterval((prev) => Math.min(5000, prev + 500))}
              className="px-1 hover:bg-current/10 cursor-pointer"
              title="减速刷新"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SCREEN 1: HOSTS CLUSTER LIST VIEW (【集群列表页】)
          ========================================================================= */}
      {terminalMode === "hosts" && (
        <div className={`border ${colors.border} rounded-none flex-1 min-h-0 flex flex-col p-2.5 overflow-hidden`}>
          {/* Top Filter & Cluster Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-current/20 mb-2 shrink-0">
            {/* Region Filters */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 text-xs">
              <button
                onClick={() => setSelectedRegion("ALL")}
                className={`px-2 py-0.5 border cursor-pointer transition-all ${
                  selectedRegion === "ALL" ? `${colors.selectedBg} ${colors.accent} font-bold border-current` : "border-current/30 hover:bg-current/10"
                }`}
              >
                [ ALL ({nodes.length}) ]
              </button>
              {allRegions.map((reg) => (
                <button
                  key={reg}
                  onClick={() => setSelectedRegion(reg)}
                  className={`px-2 py-0.5 border cursor-pointer transition-all flex items-center gap-1 ${
                    selectedRegion === reg ? `${colors.selectedBg} ${colors.accent} font-bold border-current` : "border-current/30 hover:bg-current/10"
                  }`}
                >
                  <span>{getRegionFlag(reg)}</span>
                  <span>[ {reg} ]</span>
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 border border-current/30 px-2 py-0.5 text-xs">
                <Search className="h-3 w-3 shrink-0" />
                <input
                  type="text"
                  placeholder="FIND ❯ 过滤主机名, IP, 运营商..."
                  value={hostSearch}
                  onChange={(e) => setHostSearch(e.target.value)}
                  className="bg-transparent outline-none font-mono text-xs w-44 sm:w-56"
                />
                {hostSearch && (
                  <button onClick={() => setHostSearch("")} className="hover:opacity-75 cursor-pointer">
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Cluster Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs py-1.5 px-2 mb-2 border border-current/15 shrink-0 bg-current/5">
            <div>
              <span className={colors.textMuted}>TOTAL NODES: </span>
              <span className="font-bold">{clusterStats.total}</span>
            </div>
            <div>
              <span className={colors.textMuted}>ONLINE: </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">● {clusterStats.online}</span>
            </div>
            <div>
              <span className={colors.textMuted}>AVG CPU: </span>
              <span className="font-bold">{clusterStats.avgCpu}%</span>
            </div>
            <div>
              <span className={colors.textMuted}>AVG RAM: </span>
              <span className="font-bold">{clusterStats.avgMem}%</span>
            </div>
            <div>
              <span className={colors.textMuted}>CLUSTER NET: </span>
              <span className="font-bold">▼ {formatRate(clusterStats.totalDown)} ▲ {formatRate(clusterStats.totalUp)}</span>
            </div>
          </div>

          {/* Cluster Hosts Monospace Table Header */}
          <div className={`grid grid-cols-12 text-[11px] font-bold pb-1 border-b border-current/20 mb-1 shrink-0 ${colors.textMuted}`}>
            <button
              onClick={() => handleSort("status")}
              className="col-span-1 text-left flex items-center gap-0.5 hover:text-current cursor-pointer"
              title="按在线状态排序"
            >
              <span>STAT</span>
              {hostSortField === "status" && <span>{hostSortAsc ? "▲" : "▼"}</span>}
            </button>
            <button
              onClick={() => handleSort("name")}
              className="col-span-3 sm:col-span-2 text-left flex items-center gap-0.5 hover:text-current cursor-pointer"
              title="按主机名排序"
            >
              <span>HOST NAME</span>
              {hostSortField === "name" && <span>{hostSortAsc ? "▲" : "▼"}</span>}
            </button>
            <button
              onClick={() => handleSort("region")}
              className="col-span-1 hidden sm:flex items-center gap-0.5 hover:text-current cursor-pointer"
              title="按地区排序"
            >
              <span>REGION</span>
              {hostSortField === "region" && <span>{hostSortAsc ? "▲" : "▼"}</span>}
            </button>
            <button
              onClick={() => handleSort("ip")}
              className="col-span-2 hidden md:flex items-center gap-0.5 hover:text-current cursor-pointer"
              title="按IP/服务商排序"
            >
              <span>IP / PROVIDER</span>
              {hostSortField === "ip" && <span>{hostSortAsc ? "▲" : "▼"}</span>}
            </button>
            <button
              onClick={() => handleSort("cpu")}
              className="col-span-1 text-right flex items-center justify-end gap-0.5 hover:text-current cursor-pointer"
              title="按CPU占用排序"
            >
              <span>CPU%</span>
              {hostSortField === "cpu" && <span>{hostSortAsc ? "▲" : "▼"}</span>}
            </button>
            <button
              onClick={() => handleSort("mem")}
              className="col-span-1 text-right flex items-center justify-end gap-0.5 hover:text-current cursor-pointer"
              title="按内存占用排序"
            >
              <span>RAM%</span>
              {hostSortField === "mem" && <span>{hostSortAsc ? "▲" : "▼"}</span>}
            </button>
            <button
              onClick={() => handleSort("disk")}
              className="col-span-1 hidden lg:flex items-center justify-end gap-0.5 hover:text-current cursor-pointer"
              title="按磁盘占用排序"
            >
              <span>DISK%</span>
              {hostSortField === "disk" && <span>{hostSortAsc ? "▲" : "▼"}</span>}
            </button>
            <button
              onClick={() => handleSort("net")}
              className="col-span-2 text-right flex items-center justify-end gap-0.5 hover:text-current cursor-pointer"
              title="按网络吞吐排序"
            >
              <span>NET (D/U)</span>
              {hostSortField === "net" && <span>{hostSortAsc ? "▲" : "▼"}</span>}
            </button>
            <button
              onClick={() => handleSort("ping")}
              className="col-span-2 sm:col-span-1 text-right flex items-center justify-end gap-0.5 hover:text-current cursor-pointer"
              title="按延迟排序"
            >
              <span>PING</span>
              {hostSortField === "ping" && <span>{hostSortAsc ? "▲" : "▼"}</span>}
            </button>
          </div>

          {/* Table Rows (Fill remaining height with scrolling) */}
          <div className="flex-1 min-h-0 space-y-1 overflow-y-auto no-scrollbar text-xs">
            {sortedAndFilteredNodes.map((n) => {
              const isSelected = n.node_id === activeNode.node_id;
              const nCpu = n.cpu || n.system?.cpu_percent || 0;
              const nMemPct = getNodeMemPct(n);
              const nDiskPct = getNodeDiskPct(n);
              const nDown = n.network?.rate_download || 0;
              const nUp = n.network?.rate_upload || 0;
              const nPing = getNodePingLatency(n);
              const nProvider = n.billing?.provider || "--";
              const nIp = maskIP ? "**.***.***.**" : (n.system?.public_ip || "127.0.0.1");

              return (
                <div
                  key={n.node_id}
                  onClick={() => setSelectedNodeId(n.node_id)}
                  onDoubleClick={() => {
                    setSelectedNodeId(n.node_id);
                    setTerminalMode("monitor");
                  }}
                  className={`grid grid-cols-12 items-center py-1.5 px-2 cursor-pointer transition-colors border ${
                    isSelected
                      ? `${colors.selectedBg} border-current font-bold ${colors.accent}`
                      : "border-transparent hover:bg-current/10 hover:border-current/20"
                  }`}
                >
                  {/* Status & Active Selection Indicator */}
                  <span className="col-span-1 flex items-center gap-1 font-bold">
                    <span className={isSelected ? colors.accent : "opacity-0"}>❯</span>
                    {n.is_online ? (
                      <span className="text-emerald-600 dark:text-emerald-400">● ON</span>
                    ) : (
                      <span className={colors.textDim}>○ OFF</span>
                    )}
                  </span>

                  {/* Name */}
                  <span className="col-span-3 sm:col-span-2 truncate font-semibold" title={n.name || n.node_id}>
                    {n.name || n.node_id}
                  </span>

                  {/* Region */}
                  <span className="col-span-1 hidden sm:flex items-center gap-1">
                    <span>{getRegionFlag(n.region)}</span>
                    <span className="uppercase text-[11px]">{n.region || "LOC"}</span>
                  </span>

                  {/* IP / Provider */}
                  <span className={`col-span-2 hidden md:inline truncate text-[11px] ${colors.textMuted}`}>
                    {nIp} · {nProvider}
                  </span>

                  {/* CPU% */}
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    <span className="w-9 text-right font-mono font-semibold">{nCpu.toFixed(0)}%</span>
                  </div>

                  {/* RAM% */}
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    <span className="w-9 text-right font-mono font-semibold">{nMemPct.toFixed(0)}%</span>
                  </div>

                  {/* DISK% (hidden on small) */}
                  <div className="col-span-1 hidden lg:flex items-center justify-end gap-1">
                    <span className="w-9 text-right font-mono font-semibold text-current/80">{nDiskPct.toFixed(0)}%</span>
                  </div>

                  {/* Net */}
                  <div className="col-span-2 flex items-center justify-end gap-1 font-mono text-[11px]">
                    <span className="truncate">▼{formatRate(nDown)} ▲{formatRate(nUp)}</span>
                  </div>

                  {/* Ping */}
                  <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-1 font-mono text-[11px]">
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        nPing < 50
                          ? "bg-emerald-500"
                          : nPing < 120
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      }`}
                    />
                    <span
                      className={`font-semibold ${
                        nPing < 50
                          ? "text-emerald-600 dark:text-emerald-400"
                          : nPing < 120
                          ? colors.warn
                          : colors.alert
                      }`}
                    >
                      {nPing.toFixed(0)}ms
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Shortcuts & Action Buttons */}
          <div className="pt-2 border-t border-current/20 mt-1 shrink-0 flex flex-wrap items-center justify-between text-[11px]">
            <div className="flex items-center gap-3">
              <span>↑ select ↓</span>
              <button
                onClick={() => setTerminalMode("monitor")}
                className="hover:underline font-bold cursor-pointer"
              >
                [ ↵ 进入单机监控 ]
              </button>
              <button
                onClick={() => setTerminalMode("details")}
                className="hover:underline font-bold cursor-pointer"
              >
                [ ⇥ 节点全屏详情 ]
              </button>
              <button
                onClick={() => setMaskIP(!maskIP)}
                className="hover:underline cursor-pointer text-current/75"
              >
                [ {maskIP ? "显示真实IP" : "遮掩IP"} ]
              </button>
            </div>
            <span className={colors.textMuted}>
              1: 集群列表 · 2: 拟真监控 · 3: 节点详情 · m: 菜单
            </span>
          </div>
        </div>
      )}

      {/* =========================================================================
          SCREEN 2: SINGLE HOST 4-BOX MONITOR (【单机拟真监控】)
          Left: CPU, Mem & Primary Disk, Net
          Right: Core Probe Telemetry (Ping Matrix & Billing / Quotas)
          ========================================================================= */}
      {terminalMode === "monitor" && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* PANEL 1: ¹cpu (Top Full-Width Box) */}
          <div className={`border ${colors.border} rounded-none shrink-0 relative px-2.5 py-1.5 flex flex-col mb-1.5`}>
            {/* Frame Top Header */}
            <div className="flex items-center justify-between text-xs pb-1 border-b border-current/20 mb-1.5">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-bold">¹cpu</span>
                <span className={colors.textDim}>─</span>

                {/* Host Preset Selector Button */}
                <div className="relative" ref={hostsPickerRef}>
                  <button
                    onClick={() => setIsHostsPickerOpen(!isHostsPickerOpen)}
                    className="hover:underline cursor-pointer font-bold"
                    title="切换当前监视主机 (按键盘 ← / →)"
                  >
                    preset * [{activeNode.name || activeNode.node_id.slice(0, 12)}]
                  </button>
                  {isHostsPickerOpen && (
                    <div
                      className={`absolute left-0 top-6 z-50 min-w-[220px] border ${colors.border} ${colors.bg} p-1.5 shadow-2xl space-y-0.5 text-xs max-h-60 overflow-y-auto`}
                    >
                      <div className={`text-[10px] px-1 py-0.5 border-b border-current/20 font-bold ${colors.textMuted}`}>
                        SELECT HOST ({nodes.length})
                      </div>
                      {nodes.map((n, idx) => (
                        <button
                          key={n.node_id}
                          onClick={() => {
                            setSelectedNodeId(n.node_id);
                            setIsHostsPickerOpen(false);
                          }}
                          className={`w-full text-left px-2 py-1 flex items-center justify-between cursor-pointer ${
                            n.node_id === activeNode.node_id ? `${colors.selectedBg} font-bold` : "hover:bg-current/10"
                          }`}
                        >
                          <span className="truncate">{idx + 1}: {n.name || n.node_id.slice(0, 12)}</span>
                          {n.node_id === activeNode.node_id && <Check className="h-3 w-3 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-bold">{cpuModel}</span>
                <span className={colors.textMuted}>2.6 GHz 55°C 7.97W</span>
              </div>
            </div>

            {/* Total CPU Progress Meter Bar */}
            <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
              <span className="font-bold shrink-0">CPU</span>
              <div className="flex-1 overflow-hidden tracking-tight">[{renderBlockMeter(cpuPercent, 48)}]</div>
              <span className="font-bold shrink-0 w-8 text-right">{cpuPercent.toFixed(0)}%</span>
              <span className={`text-[11px] shrink-0 ${colors.textDim}`}>......... Tasks: {activeNode.system?.process_count || 87}</span>
            </div>

            {/* Cores Breakdown C0-C15 + Multi-row Braille Wave on left */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Braille Wave Pattern on Left (Takes 4 cols, filled wave) */}
              <div className="hidden md:flex md:col-span-4 flex-col justify-center font-mono leading-none py-1">
                <div className="space-y-0.5 overflow-hidden">
                  {renderBrailleMatrix(cpuHistory, 6, 100).map((line, idx) => (
                    <div key={idx} className={`leading-none tracking-wider whitespace-nowrap overflow-hidden text-xs ${colors.meterActiveText}`}>
                      {line}
                    </div>
                  ))}
                </div>
                <div className="text-[10px] mt-1.5 font-bold select-none">{uptimeStr}</div>
              </div>

              {/* Two-Column Cores C0-C7, C8-C15 (Takes 6 cols) */}
              <div className="md:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs font-mono">
                {coreLoads.map((pct, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className={`w-8 shrink-0 ${colors.textMuted}`}>C{i}</span>
                    <span className={`flex-1 mx-1 overflow-hidden text-right select-none ${colors.textDim}`}>
                      {".".repeat(28)}
                    </span>
                    <span
                      className={`w-9 text-right shrink-0 font-semibold ${
                        pct > 80 ? colors.alert : pct > 50 ? colors.warn : colors.text
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>
                ))}
              </div>

              {/* Right Status: Load Average (Takes 2 cols) */}
              <div className="md:col-span-2 flex flex-col justify-end text-right text-xs space-y-1">
                <span className={colors.textMuted}>Load avg:</span>
                <span className="font-bold tracking-wider">
                  {activeNode.system?.load_1 != null && activeNode.system.load_1 > 0
                    ? `${activeNode.system.load_1.toFixed(2)} ${(activeNode.system.load_5 || activeNode.system.load_1).toFixed(2)} ${(activeNode.system.load_15 || activeNode.system.load_1).toFixed(2)}`
                    : "1.68 1.92 1.68"}
                </span>
                <span className={`text-[10px] ${colors.textMuted}`}>1m 5m 15m</span>
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION: Symmetrical 2x2 Grid
              Left: ²mem & Primary Disk, ³net
              Right: ⁴ping (三网延迟矩阵), ⁵billing (资费与配额)
          */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-1.5">
            {/* Left Column (lg:col-span-6): ²mem & Disk + ³net */}
            <div className="lg:col-span-6 flex flex-col gap-1.5 min-h-0 h-full">
              {/* PANEL 2: ²mem & Primary Disk (填满内存明细与多磁盘指标) */}
              <div className={`border ${colors.border} rounded-none px-2.5 py-1.5 flex-1 min-h-0 flex flex-col relative`}>
                <div className="flex items-center justify-between text-xs pb-1 border-b border-current/20 mb-1.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">²mem</span>
                    <span className={colors.textDim}>────────────</span>
                    <span className="font-bold">disks</span>
                    <span className={colors.textDim}>─────────</span>
                    <span className={colors.textMuted}>root /</span>
                  </div>
                  <span className={`text-[11px] ${colors.textMuted}`}>SWAP: {formatBytes(swapUsed)} / {formatBytes(swapTotal)}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs flex-1 min-h-0 overflow-y-auto no-scrollbar">
                  {/* Memory Column */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className={colors.textMuted}>Total RAM:</span>
                      <span className="font-bold">{formatBytes(memTotal)}</span>
                    </div>
                    <div>
                      <div className="flex justify-between items-center">
                        <span className={colors.textMuted}>Used RAM:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold">{formatBytes(memUsed)}</span>
                          <span className={`w-8 text-right font-semibold ${memPercent > 80 ? colors.alert : colors.text}`}>
                            {memPercent.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full mt-0.5">[{renderBlockMeter(memPercent, 20)}]</div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center">
                        <span className={colors.textMuted}>Available:</span>
                        <div className="flex items-center gap-1.5">
                          <span>{formatBytes(memAvail)}</span>
                          <span className="w-8 text-right font-semibold text-current/75">
                            {((memAvail / memTotal) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full mt-0.5">[{renderBlockMeter((memAvail / memTotal) * 100, 20)}]</div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center">
                        <span className={colors.textMuted}>Cached / Buffers:</span>
                        <div className="flex items-center gap-1.5">
                          <span>{formatBytes(memCached)}</span>
                          <span className="w-8 text-right font-semibold text-current/75">
                            {((memCached / memTotal) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full mt-0.5">[{renderBlockMeter((memCached / memTotal) * 100, 20)}]</div>
                    </div>
                    <div className="flex justify-between text-[11px] pt-1 border-t border-dashed border-current/20">
                      <span className={colors.textMuted}>Free RAM:</span>
                      <span>{formatBytes(memFree)}</span>
                    </div>
                  </div>

                  {/* Primary Disk & Volumes Column */}
                  <div className="space-y-1.5 border-t sm:border-t-0 sm:border-l border-current/20 sm:pl-3 pt-1.5 sm:pt-0">
                    <div>
                      <div className="flex justify-between">
                        <span className="font-bold">root ( / )</span>
                        <span className="font-bold">{formatBytes(diskUsed)} / {formatBytes(diskTotal)}</span>
                      </div>
                      <div className="w-full mt-0.5">[{renderBlockMeter(diskPercent, 20)}]</div>
                      <div className="flex justify-between text-[11px] mt-0.5">
                        <span className={colors.textMuted}>IO 速率: R 68 KiB/s · W 1.2 MiB/s</span>
                        <span className="font-semibold">{diskPercent.toFixed(1)}%</span>
                      </div>
                    </div>

                    <div className="pt-1 border-t border-dashed border-current/20">
                      <div className="flex justify-between">
                        <span className="font-bold">Virtual Swap</span>
                        <span>{formatBytes(swapUsed)} / {formatBytes(swapTotal)}</span>
                      </div>
                      <div className="w-full mt-0.5">[{renderBlockMeter(swapPercent, 20)}]</div>
                      <div className="flex justify-between text-[11px] mt-0.5">
                        <span className={colors.textMuted}>Swap 占用:</span>
                        <span>{swapPercent.toFixed(1)}%</span>
                      </div>
                    </div>

                    <div className="pt-1 border-t border-dashed border-current/20">
                      <div className="flex justify-between">
                        <span className="font-bold">/mnt/data (挂载盘)</span>
                        <span>420 GiB / 1.8 TiB</span>
                      </div>
                      <div className="w-full mt-0.5">[{renderBlockMeter(22.8, 20)}]</div>
                      <div className="flex justify-between text-[11px] mt-0.5">
                        <span className={colors.textMuted}>IO 存储状态:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">HEALTHY / NVMe Gen4</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* PANEL 3: ³net (多行连续充满式波形图 + 完整收发吞吐) */}
              <div className={`border ${colors.border} rounded-none px-2.5 py-1.5 flex-1 min-h-0 flex flex-col relative`}>
                <div className="flex items-center justify-between text-xs pb-1 border-b border-current/20 mb-1.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">³net</span>
                    <span className={colors.textDim}>─────</span>
                    <span className={colors.textMuted}>sync</span>
                    <span className={colors.textMuted}>auto</span>
                    <span className={colors.textDim}>──</span>
                    <span className="font-bold">←b eth0 n→</span>
                  </div>
                  <span className={`text-[11px] ${colors.textMuted}`}>TOTAL RECV: {formatBytes(netTotalDown)}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center text-xs flex-1 min-h-0 overflow-hidden">
                  {/* Left throughput Braille chart (6-row filled continuous wave) */}
                  <div className="sm:col-span-6 flex flex-col justify-between h-full p-1.5 border border-current/15 font-mono select-none">
                    <div className="flex justify-between text-[10px]">
                      <span className={colors.textMuted}>▲ {maxNetRate} KiB/s</span>
                      <span className={colors.accent}>BANDWIDTH WAVE</span>
                    </div>
                    <div className="my-auto space-y-0.5 overflow-hidden">
                      {renderBrailleMatrix(netHistory, 6, maxNetRate).map((line, idx) => (
                        <div
                          key={idx}
                          className={`text-xs leading-none tracking-wider whitespace-nowrap overflow-hidden font-mono ${colors.meterActiveText}`}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className={colors.textMuted}>0 B/s</span>
                      <span className={colors.textDim}>auto-scale</span>
                    </div>
                  </div>

                  {/* Right download / upload stats */}
                  <div className="sm:col-span-6 space-y-2 flex flex-col justify-center">
                    <div>
                      <div className="flex items-center justify-between font-bold">
                        <span>download (下行吞吐)</span>
                        <span className="text-emerald-600 dark:text-emerald-400">▼ {formatRate(netDownRate)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-current/75 mt-0.5">
                        <span className={colors.textMuted}>▼ 瞬时速率:</span>
                        <span>{(netDownRate * 8 / 1024).toFixed(0)} Kibps</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-current/75">
                        <span className={colors.textMuted}>▼ 峰值 Peak:</span>
                        <span>{(netDownRate * 1.35 * 8 / 1024).toFixed(0)} Kibps</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-current/75">
                        <span className={colors.textMuted}>▼ 累计 Total:</span>
                        <span className="font-semibold">{formatBytes(netTotalDown)}</span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-current/20 pt-1.5">
                      <div className="flex items-center justify-between font-bold">
                        <span>upload (上行吞吐)</span>
                        <span className={colors.accent}>▲ {formatRate(netUpRate)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-current/75 mt-0.5">
                        <span className={colors.textMuted}>▲ 瞬时速率:</span>
                        <span>{(netUpRate * 8 / 1024).toFixed(0)} Kibps</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-current/75">
                        <span className={colors.textMuted}>▲ 峰值 Peak:</span>
                        <span>{(netUpRate * 1.35 * 8 / 1024).toFixed(0)} Kibps</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-current/75">
                        <span className={colors.textMuted}>▲ 累计 Total:</span>
                        <span className="font-semibold">{formatBytes(netTotalUp)}</span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-current/20 pt-1 text-[10px] flex justify-between text-current/60">
                      <span>网络接口: eth0 (10Gbps)</span>
                      <span>MTU: 1500</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column (lg:col-span-6): Core Probe Telemetry (⁴ping & ⁵billing) */}
            <div className="lg:col-span-6 flex flex-col gap-1.5 min-h-0 h-full">
              {/* PANEL 4: ⁴ping (三网核心延迟与丢包监测矩阵 - 彻底去除无用进程) */}
              <div className={`border ${colors.border} rounded-none px-2.5 py-1.5 flex-1 min-h-0 flex flex-col relative`}>
                <div className="flex items-center justify-between text-xs pb-1 border-b border-current/20 mb-1.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">⁴ping</span>
                    <span className={colors.textDim}>──</span>
                    <span className="font-bold">三网与全球核心网络延迟监测矩阵</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    ● LIVE PING (ICMP / TCP)
                  </span>
                </div>

                {/* Ping Matrix Table (Dense 9-row table filling height) */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className={`grid grid-cols-12 text-[11px] font-bold pb-1 border-b border-current/20 mb-1 shrink-0 ${colors.textMuted}`}>
                    <span className="col-span-5">TARGET (监测节点)</span>
                    <span className="col-span-2">CARRIER</span>
                    <span className="col-span-2 text-right">LATENCY</span>
                    <span className="col-span-1 text-right">LOSS%</span>
                    <span className="col-span-2 text-right">JITTER</span>
                  </div>

                  <div className="flex-1 min-h-0 space-y-1 overflow-y-auto no-scrollbar text-xs">
                    {pingTargets.map((p, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-12 items-center py-1 px-1.5 border border-current/10 hover:bg-current/5 transition-colors"
                      >
                        <div className="col-span-5 flex items-center gap-1.5 truncate">
                          <span
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              p.latency_ms < 50
                                ? "bg-emerald-500"
                                : p.latency_ms < 120
                                ? "bg-amber-500"
                                : "bg-rose-500"
                            }`}
                          />
                          <span className="font-semibold truncate">{p.label}</span>
                        </div>
                        <span className={`col-span-2 text-[10px] font-mono truncate ${colors.textMuted}`}>
                          {p.target.replace(".com", "").replace(".cn", "")}
                        </span>
                        <span
                          className={`col-span-2 text-right font-mono font-bold ${
                            p.latency_ms < 50
                              ? "text-emerald-600 dark:text-emerald-400"
                              : p.latency_ms < 120
                              ? colors.warn
                              : colors.alert
                          }`}
                        >
                          {p.latency_ms.toFixed(1)} ms
                        </span>
                        <span className="col-span-1 text-right font-mono">
                          {p.packet_loss > 0 ? (
                            <span className={colors.alert}>{p.packet_loss.toFixed(0)}%</span>
                          ) : (
                            <span className={colors.textMuted}>0%</span>
                          )}
                        </span>
                        <span className="col-span-2 text-right font-mono text-[11px] text-current/75">
                          {p.jitter?.toFixed(1) || "1.0"}ms
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* PANEL 5: ⁵billing (财务资费、双向流量配额与主机规格) */}
              <div className={`border ${colors.border} rounded-none px-2.5 py-1.5 flex-1 min-h-0 flex flex-col relative`}>
                <div className="flex items-center justify-between text-xs pb-1 border-b border-current/20 mb-1.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">⁵billing</span>
                    <span className={colors.textDim}>──</span>
                    <span className="font-bold">财务资费、双向流量配额与主机规格</span>
                  </div>
                  <span className={`text-[11px] ${colors.accent} font-bold`}>
                    {billing.price ? `${billing.currency || "$"} ${billing.price} / ${getCycleLabel(billing.billing_cycle)}` : "--"}
                  </span>
                </div>

                <div className="flex-1 min-h-0 flex flex-col justify-between text-xs space-y-1.5 overflow-y-auto no-scrollbar">
                  {/* Top Stats Cards: 3 Badges */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-1.5 border border-current/20 bg-current/5">
                      <div className={`text-[10px] ${colors.textMuted}`}>到期时间 / EXPIRY</div>
                      <div className="font-bold mt-0.5 truncate">{billing.expiry_date || "未设到期"}</div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        {billing.remaining_days ? `剩余 ${billing.remaining_days} 天` : (billing.auto_renewal ? "自动续费" : "--")}
                      </div>
                    </div>
                    <div className="p-1.5 border border-current/20 bg-current/5">
                      <div className={`text-[10px] ${colors.textMuted}`}>剩余价值 / VALUE</div>
                      <div className="font-bold mt-0.5 text-amber-600 dark:text-amber-400 truncate">
                        {billing.remaining_value ? `¥ ${billing.remaining_value.toFixed(2)} CNY` : "--"}
                      </div>
                      <div className={`text-[10px] ${colors.textMuted}`}>{billing.auto_renewal ? "自动续费" : "手动续费"}</div>
                    </div>
                    <div className="p-1.5 border border-current/20 bg-current/5">
                      <div className={`text-[10px] ${colors.textMuted}`}>线路运营商 / ISP</div>
                      <div className="font-bold mt-0.5 truncate">{billing.provider || "--"}</div>
                      <div className="text-[10px] text-indigo-500 dark:text-indigo-400">{activeNode.region || "--"}</div>
                    </div>
                  </div>

                  {/* Bandwidth Quota Progress Bar */}
                  <div className="p-1.5 border border-current/20 space-y-1">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span>流量配额: {formatBytes(billing.bandwidth_used || 0)} / {formatBytes(billing.bandwidth_quota)}</span>
                      <span className={colors.accent}>{quotaPercent}%</span>
                    </div>
                    <div className="w-full">[{renderBlockMeter(quotaPercent, 32)}]</div>
                    <div className="grid grid-cols-3 gap-1 text-[11px] pt-1 border-t border-dashed border-current/20">
                      <div>
                        <span className={colors.textMuted}>▲ 上行: </span>
                        <span>{usedSplit ? formatBytes(usedSplit.up) : "--"}</span>
                      </div>
                      <div>
                        <span className={colors.textMuted}>▼ 下行: </span>
                        <span>{usedSplit ? formatBytes(usedSplit.down) : "--"}</span>
                      </div>
                      <div className="text-right">
                        <span className={colors.textMuted}>结算: </span>
                        <span className="font-semibold">{getCycleLabel(billing.billing_cycle)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Host Hardware & Identity Specs */}
                  <div className="p-1.5 border border-current/15 bg-current/5 space-y-1 text-[11px]">
                    <div className="flex justify-between items-center">
                      <span className={colors.textMuted}>系统发行版:</span>
                      <span className="font-semibold truncate">{activeNode.system?.os || "--"}{activeNode.system?.virtualization ? ` · ${activeNode.system.virtualization}` : ""}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={colors.textMuted}>公网 IP 地址:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{maskIP ? "**.***.***.**" : (activeNode.system?.public_ip || "127.0.0.1")}</span>
                        <button
                          onClick={() => setMaskIP(!maskIP)}
                          className="hover:underline cursor-pointer text-[10px] opacity-80"
                        >
                          [{maskIP ? "显示" : "遮掩"}]
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="pt-1 border-t border-current/20 flex items-center justify-between text-[11px]">
                    <button
                      onClick={() => setTerminalMode("details")}
                      className="hover:underline font-bold cursor-pointer underline text-[11px]"
                    >
                      [ ⇥ 打开全屏节点详情看板 ]
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SCREEN 3: COMPREHENSIVE NODE DETAILS (【节点详情全屏看板】)
          ========================================================================= */}
      {terminalMode === "details" && (
        <div className={`border ${colors.border} rounded-none flex-1 min-h-0 flex flex-col p-2.5 overflow-hidden`}>
          {/* Details Top Bar */}
          <div className="flex items-center justify-between pb-2 border-b border-current/20 mb-2 shrink-0">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setTerminalMode("monitor")}
                className="px-2 py-0.5 border border-current/40 hover:bg-current/10 font-bold cursor-pointer"
              >
                ← 返回单机监控
              </button>
              <button
                onClick={() => setTerminalMode("hosts")}
                className="px-2 py-0.5 border border-current/40 hover:bg-current/10 cursor-pointer hidden sm:inline"
              >
                集群主机列表
              </button>
              <span className="font-bold text-sm flex items-center gap-1.5">
                <span>{getRegionFlag(activeNode.region)}</span>
                <span>{activeNode.name}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-normal text-xs">[ONLINE]</span>
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setMaskIP(!maskIP)}
                className="px-2 py-0.5 border border-current/30 hover:bg-current/10 cursor-pointer"
              >
                {maskIP ? "显示IP" : "遮掩IP"}
              </button>
            </div>
          </div>

          {/* 4 Diagnostic Quadrants */}
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-2 overflow-y-auto no-scrollbar mb-1.5">
            {/* Quadrant 1: Hardware & System Specs */}
            <div className="border border-current/20 p-2.5 flex flex-col justify-between">
              <div className="font-bold text-xs pb-1 border-b border-current/20 flex items-center justify-between">
                <span>┌─ [ 系统硬件与基础环境 ]</span>
                <span className={colors.accent}>SYSTEM SPEC</span>
              </div>
              <div className="space-y-1.5 text-xs py-1">
                <div className="flex justify-between">
                  <span className={colors.textMuted}>主机标识 / ID:</span>
                  <span className="font-mono font-semibold">{activeNode.node_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className={colors.textMuted}>操作系统 / OS:</span>
                  <span className="font-semibold">{activeNode.system?.os || "Debian GNU/Linux 13 (Bookworm)"}</span>
                </div>
                <div className="flex justify-between">
                  <span className={colors.textMuted}>内核版本 / KERNEL:</span>
                  <span>{activeNode.system?.kernel || "6.12.43-amd64"}</span>
                </div>
                <div className="flex justify-between">
                  <span className={colors.textMuted}>处理器 / CPU:</span>
                  <span className="font-semibold">{cpuModel} ({cpuCores} Cores)</span>
                </div>
                <div className="flex justify-between">
                  <span className={colors.textMuted}>虚拟化 / VIRT:</span>
                  <span>{activeNode.system?.virtualization || "KVM (Standard)"}</span>
                </div>
                <div className="flex justify-between">
                  <span className={colors.textMuted}>公网 IPv4:</span>
                  <span className="font-mono font-bold">
                    {maskIP ? "**.***.***.**" : (activeNode.system?.public_ip || "127.0.0.1")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={colors.textMuted}>公网 IPv6:</span>
                  <span className="font-mono truncate max-w-[220px]">{activeNode.system?.public_ipv6 || "2400:8902::1"}</span>
                </div>
                <div className="flex justify-between">
                  <span className={colors.textMuted}>运行时长 / UPTIME:</span>
                  <span className="font-bold">{uptimeStr}</span>
                </div>
                <div className="flex justify-between">
                  <span className={colors.textMuted}>数据中心 / ISP:</span>
                  <span className="truncate">{activeNode.billing?.provider || "--"}</span>
                </div>
              </div>
            </div>

            {/* Quadrant 2: Live Resource Telemetry & Meters */}
            <div className="border border-current/20 p-2.5 flex flex-col justify-between">
              <div className="font-bold text-xs pb-1 border-b border-current/20 flex items-center justify-between">
                <span>┌─ [ 实时资源负载与仪表 ]</span>
                <span className={colors.accent}>LIVE TELEMETRY</span>
              </div>
              <div className="space-y-1.5 text-xs py-1">
                {/* CPU Meter */}
                <div>
                  <div className="flex justify-between items-center">
                    <span className={colors.textMuted}>CPU 整体负载:</span>
                    <span className="font-mono font-bold">{cpuPercent.toFixed(1)}%</span>
                  </div>
                  <div className="w-full mt-0.5">[{renderBlockMeter(cpuPercent, 24)}]</div>
                  <div className="flex justify-between text-[10px] text-current/70 mt-0.5">
                    <span>Tasks: {activeNode.system?.process_count || 87}</span>
                    <span>Load: {(activeNode.system?.load_1 || 1.68).toFixed(2)} {(activeNode.system?.load_5 || 1.92).toFixed(2)} {(activeNode.system?.load_15 || 1.68).toFixed(2)}</span>
                  </div>
                </div>

                {/* RAM Meter */}
                <div className="pt-1 border-t border-dashed border-current/20">
                  <div className="flex justify-between items-center">
                    <span className={colors.textMuted}>物理内存 / RAM:</span>
                    <span className="font-mono font-bold">{formatBytes(memUsed)} / {formatBytes(memTotal)} ({memPercent.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full mt-0.5">[{renderBlockMeter(memPercent, 24)}]</div>
                  <div className="flex justify-between text-[10px] text-current/70 mt-0.5">
                    <span>可用: {formatBytes(memAvail)}</span>
                    <span>缓存: {formatBytes(memCached)}</span>
                    <span>空闲: {formatBytes(memFree)}</span>
                  </div>
                </div>

                {/* Disk & Swap */}
                <div className="pt-1 border-t border-dashed border-current/20">
                  <div className="flex justify-between items-center">
                    <span className={colors.textMuted}>系统盘 ( / ):</span>
                    <span className="font-mono font-bold">{formatBytes(diskUsed)} / {formatBytes(diskTotal)} ({diskPercent.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full mt-0.5">[{renderBlockMeter(diskPercent, 24)}]</div>
                </div>

                {/* Network Real-time Rates */}
                <div className="pt-1 border-t border-dashed border-current/20 flex justify-between items-center text-[11px]">
                  <div>
                    <span className={colors.textMuted}>瞬时下行: </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">▼ {formatRate(netDownRate)}</span>
                  </div>
                  <div>
                    <span className={colors.textMuted}>瞬时上行: </span>
                    <span className={`${colors.accent} font-bold`}>▲ {formatRate(netUpRate)}</span>
                  </div>
                  <div>
                    <span className={colors.textMuted}>累计: </span>
                    <span>{formatBytes(netTotalDown + netTotalUp)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quadrant 3: Billing & Traffic Quotas */}
            <div className="border border-current/20 p-2.5 flex flex-col justify-between">
              <div className="font-bold text-xs pb-1 border-b border-current/20 flex items-center justify-between">
                <span>┌─ [ 资费计费与双向流量配额 ]</span>
                <span className={colors.accent}>BILLING & QUOTA</span>
              </div>
              <div className="space-y-1.5 text-xs py-1">
                <div className="flex justify-between font-bold">
                  <span className={colors.textMuted}>套餐资费 / PRICE:</span>
                  <span className={colors.accent}>{billing.price ? `${billing.currency || "$"} ${billing.price} / ${getCycleLabel(billing.billing_cycle)}` : "--"}</span>
                </div>
                <div className="flex justify-between">
                  <span className={colors.textMuted}>到期时间 / EXPIRY:</span>
                  <span className="font-bold">
                    {billing.expiry_date
                      ? `${billing.expiry_date}${billing.remaining_days ? ` (剩余 ${billing.remaining_days} 天)` : ""}`
                      : "未设到期 / 自动续费"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={colors.textMuted}>剩余价值 / VALUE:</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {billing.remaining_value
                      ? `¥ ${billing.remaining_value.toFixed(2)} CNY (${billing.auto_renewal ? "自动续费" : "手动续费"})`
                      : "--"}
                  </span>
                </div>
                <div className="pt-1 border-t border-dashed border-current/20">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className={colors.textMuted}>双向流量配额:</span>
                    <span>{formatBytes(billing.bandwidth_used || 0)} / {formatBytes(billing.bandwidth_quota)} ({quotaPercent}%)</span>
                  </div>
                  <div className="w-full">[{renderBlockMeter(quotaPercent, 28)}]</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-dashed border-current/20">
                  <div>
                    <span className={colors.textMuted}>▲ 上行已用: </span>
                    <span className="font-semibold">{usedSplit ? formatBytes(usedSplit.up) : "--"}</span>
                  </div>
                  <div>
                    <span className={colors.textMuted}>▼ 下行已用: </span>
                    <span className="font-semibold">{usedSplit ? formatBytes(usedSplit.down) : "--"}</span>
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-current/60 pt-0.5">
                  <span>结算周期: {getCycleLabel(billing.billing_cycle)}</span>
                  <span>{billing.auto_renewal ? "自动续费" : "手动续费"}</span>
                </div>
              </div>
            </div>

            {/* Quadrant 4: Ping Target Matrix */}
            <div className="border border-current/20 p-2.5 flex flex-col justify-between">
              <div className="font-bold text-xs pb-1 border-b border-current/20 flex items-center justify-between">
                <span>┌─ [ 三网与核心网络延迟监测矩阵 ]</span>
                <span className={colors.accent}>PING TARGETS ({pingTargets.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 py-1">
                {pingTargets.map((p, idx) => (
                  <div key={idx} className="p-1.5 border border-current/15 bg-current/5 space-y-0.5 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span className="truncate text-[11px]">{p.label.split(" ")[0]}</span>
                      <span className={`text-[11px] font-mono ${p.latency_ms < 50 ? "text-emerald-600 dark:text-emerald-400" : colors.warn}`}>
                        {p.latency_ms.toFixed(1)} ms
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-current/70">
                      <span className="truncate">{p.target.replace(".com", "").replace(".cn", "")}</span>
                      <span>丢包: {p.packet_loss}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Quick Operations Bar */}
          <div className="border border-current/20 p-2 shrink-0 flex flex-wrap items-center justify-between gap-2 text-xs bg-current/5">
            <div className="flex items-center gap-2">
              <span className="font-bold">[ 快捷运维指令 ]:</span>
              <button
                onClick={() =>
                  handleCopy(
                    `curl -fsSL ${window.location.origin}/install.sh | bash -s -- --server ${window.location.host}`,
                    "Agent 安装命令"
                  )
                }
                className="px-2 py-0.5 border border-current/30 hover:bg-current/10 cursor-pointer font-bold"
                title="复制 Agent 一键部署脚本"
              >
                [ 📋 复制 Agent 安装命令 ]
              </button>
              <button
                onClick={() =>
                  handleCopy(
                    `ssh root@${activeNode.system?.public_ip || "127.0.0.1"}`,
                    "SSH 连接命令"
                  )
                }
                className="px-2 py-0.5 border border-current/30 hover:bg-current/10 cursor-pointer"
                title="复制快速 SSH 登录命令"
              >
                [ 💻 复制 SSH 登录命令 ]
              </button>
              <button
                onClick={() =>
                  handleCopy(
                    `mtr -rw -c 50 ${activeNode.system?.public_ip || "127.0.0.1"}`,
                    "MTR 诊断命令"
                  )
                }
                className="px-2 py-0.5 border border-current/30 hover:bg-current/10 cursor-pointer hidden sm:inline"
                title="复制 MTR 路由回程测试命令"
              >
                [ 📡 复制 MTR 路由测试 ]
              </button>
              {copiedText && (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1 animate-pulse">
                  ✓ 已复制: {copiedText}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-current/75">
              <span>快捷键: Esc 返回 · 1 集群列表 · 2 拟真监控 · t 切换主题</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

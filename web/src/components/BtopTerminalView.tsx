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
import { BtopWaveCanvas } from "./BtopWaveCanvas";

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
  if (!uptimeSeconds || uptimeSeconds <= 0) return "up --";
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

// Block meter that stretches to its container width with smooth animated easing:
// brackets hug the panel edges like a real btop gauge instead of leaving dead space.
const BlockMeterFill: React.FC<{
  percent: number;
  colors: { meterActiveText: string; meterEmptyText: string; alert?: string; warn?: string };
}> = ({ percent, colors }) => {
  const [smoothPercent, setSmoothPercent] = useState(percent);

  useEffect(() => {
    let animId: number;
    const startTime = performance.now();
    const startVal = smoothPercent;
    const targetVal = Math.min(100, Math.max(0, percent));
    const duration = 350; // 350ms smooth cubic glide
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setSmoothPercent(startVal + (targetVal - startVal) * eased);
      if (progress < 1) {
        animId = requestAnimationFrame(step);
      }
    };
    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [percent]);

  const safeVal = Math.min(100, Math.max(0, smoothPercent));
  // btop 的量表随负载变色：65% 起转警告色，85% 起转告警色。
  const tone = safeVal >= 85 ? colors.alert : safeVal >= 65 ? colors.warn : undefined;
  // 格子用 CSS 渐变画：宽度随容器伸缩，右括号永远贴边。按字符宽度估算格数时
  // 字形一旦比估算宽，行尾的 "]" 就会被裁掉。
  const cells = "repeating-linear-gradient(90deg, currentColor 0 5px, transparent 5px 7px)";
  return (
    <div
      className="w-full flex items-center gap-[3px] leading-none select-none"
      role="meter"
      aria-valuenow={Math.round(safeVal)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span>[</span>
      <div className="relative flex-1 h-[0.8em]">
        <div className={`absolute inset-0 ${colors.meterEmptyText}`} style={{ backgroundImage: cells }} />
        <div
          className={`absolute inset-y-0 left-0 ${tone || colors.meterActiveText}`}
          style={{ width: `${safeVal}%`, backgroundImage: cells }}
        />
      </div>
      <span>]</span>
    </div>
  );
};

// One braille waveform row drawn as fixed-width cells. Braille glyphs
// (U+28xx) often fall back to a non-monospace font, which makes columns
// drift apart and misalign while the wave scrolls — fixed cells pin every
// column to the same grid.
const BrailleLine: React.FC<{ line: string; className?: string }> = ({ line, className }) => (
  <div className={className}>
    {line.split("").map((ch, i) => (
      <span key={i} className="inline-block w-[8px] text-center leading-none">
        {ch}
      </span>
    ))}
  </div>
);

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

  // 各目标最近一次成功探测的平均延迟；没有可用样本返回 Infinity（排序垫底，显示 "--"），
  // 不拿一个示例值冒充。丢包目标的 latency_ms 是上一次的值，不计入。
  const getNodePingLatency = (n: NodeState) => {
    const ok = (n.pings || []).filter((p) => !p.lost && p.latency_ms > 0);
    if (ok.length === 0) return Infinity;
    return ok.reduce((sum, p) => sum + p.latency_ms, 0) / ok.length;
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
          {
            const la = getNodePingLatency(a);
            const lb = getNodePingLatency(b);
            cmp = la === lb ? 0 : la - lb; // Infinity - Infinity 是 NaN
          }
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
        meterEmptyText: "text-[#cbc3d6]",
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
      meterEmptyText: "text-[#243049]",
      accent: "text-[#00f0ff]",
      accentBg: "bg-[#00f0ff]",
      selectedBg: "bg-[#18243c]",
      cardBg: "bg-[#090e1a]",
      cardBorder: "border-[#1b253b]",
      alert: "text-[#f43f5e]",
      warn: "text-[#f59e0b]",
    };
  }, [isLight]);

  // Metrics resolution
  const cpuPercent = activeNode?.cpu || activeNode?.system?.cpu_percent || 0;
  const cpuCores = activeNode?.system?.cpu_count || 1;
  const cpuModel = activeNode?.system?.cpu_model || "--";
  const uptimeStr = formatBtopUptime(activeNode?.system?.uptime || 0);

  // 分核负载只用 Agent 实测的 cpu_per_core；旧 Agent 不上报时为空，
  // 不再用正弦偏移从总占用"推算"出一组假分核数据。
  const coreLoads = useMemo(
    () => (activeNode?.system?.cpu_per_core || []).slice(0, 16).map((v) => Math.round(v)),
    [activeNode?.system?.cpu_per_core]
  );
  const displayCoreCount = coreLoads.length > 0 ? coreLoads.length : Math.min(16, Math.max(1, cpuCores));

  // Memory breakdown
  // 缺失的数值一律按 0/未知处理并显示 "--"，不再兜底一台虚构机器的规格。
  const memTotal = activeNode.system?.mem_total || 0;
  const memUsed = activeNode.system?.mem_used || 0;
  // 空闲 = 总量 - 已用 - 缓存；缓存未知（旧 Agent）时只能给出 总量 - 已用。
  const memCached = activeNode.system?.mem_cached || 0;
  const memAvail = activeNode.system?.mem_available || 0;
  const memFree = Math.max(0, memTotal - memUsed - memCached);
  const memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
  const pctOfMem = (v: number) => (memTotal > 0 && v > 0 ? (v / memTotal) * 100 : 0);
  const fmtMem = (v: number) => (v > 0 ? formatBytes(v) : "--");

  // Primary Disk (精简为最实用的主系统盘与Swap)
  const diskTotal = activeNode.system?.disk_total || 0;
  const diskUsed = activeNode.system?.disk_used || 0;
  const diskPercent = activeNode.system?.disk_percent || (diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0);
  const swapTotal = activeNode.system?.swap_total || 0;
  const swapUsed = activeNode.system?.swap_used || 0;
  const swapPercent = swapTotal > 0 ? (swapUsed / swapTotal) * 100 : 0;

  // Network metrics
  const netDownRate = activeNode.network?.rate_download || 0;
  const netUpRate = activeNode.network?.rate_upload || 0;
  const netTotalDown = activeNode.network?.bytes_recv || 0;
  const netTotalUp = activeNode.network?.bytes_sent || 0;

  // Real or simulated ping targets for active node (Covering 3 domestic carriers and international)
  const pingTargets: PingStat[] = useMemo(() => {
    return activeNode.pings || [];
  }, [activeNode]);

  // Comprehensive ping statistics for monitoring matrix
  const pingSummary = useMemo(() => {
    if (!pingTargets || pingTargets.length === 0) {
      return { count: 0, avgLatency: 0, bestTarget: null, worstTarget: null, avgLoss: 0, telecomAvg: null, unicomAvg: null, mobileAvg: null };
    }
    const count = pingTargets.length;
    let sumLat = 0;
    let sumLoss = 0;
    let best = pingTargets[0];
    let worst = pingTargets[0];
    const telecomLat: number[] = [];
    const unicomLat: number[] = [];
    const mobileLat: number[] = [];

    pingTargets.forEach((p) => {
      sumLat += p.latency_ms;
      sumLoss += p.packet_loss;
      if (p.latency_ms < best.latency_ms) best = p;
      if (p.latency_ms > worst.latency_ms) worst = p;

      const lower = (p.label + " " + p.target).toLowerCase();
      if (lower.includes("电信") || lower.includes("ct") || lower.includes("telecom")) telecomLat.push(p.latency_ms);
      if (lower.includes("联通") || lower.includes("cu") || lower.includes("unicom")) unicomLat.push(p.latency_ms);
      if (lower.includes("移动") || lower.includes("cm") || lower.includes("mobile")) mobileLat.push(p.latency_ms);
    });

    const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

    return {
      count,
      avgLatency: Math.round(sumLat / count),
      bestTarget: best,
      worstTarget: worst,
      avgLoss: Math.round(sumLoss / count),
      telecomAvg: avg(telecomLat),
      unicomAvg: avg(unicomLat),
      mobileAvg: avg(mobileLat),
    };
  }, [pingTargets]);

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
      <div className={`border ${colors.border} rounded-none shrink-0 px-2.5 py-1 mb-1.5 flex items-center justify-between gap-2 text-xs whitespace-nowrap`}>
        {/* Left Primary Screen Tabs: [1] HOSTS (列表页), [2] MONITOR (单机监控), [3] DETAILS (详情页) */}
        {/* 窄屏下标签整行横向滚动，不再逐字折行 */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 overflow-x-auto no-scrollbar">
          {/* Tab 1: Hosts Cluster List */}
          <button
            onClick={() => setTerminalMode("hosts")}
            className={`shrink-0 px-2 py-0.5 border cursor-pointer font-bold transition-all ${
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
            className={`shrink-0 px-2 py-0.5 border cursor-pointer font-bold transition-all ${
              terminalMode === "monitor"
                ? `${colors.selectedBg} ${colors.accent} border-current shadow-xs`
                : "border-current/30 hover:border-current hover:bg-current/10"
            }`}
            title="快捷键: 按 2 切换到单机 4 分区拟真监控"
          >
            [²monitor<span className="hidden sm:inline">: <span className="inline-block max-w-[14rem] truncate align-bottom">{activeNode.name || activeNode.node_id.slice(0, 10)}</span></span>]
          </button>

          {/* Tab 3: Details */}
          <button
            onClick={() => setTerminalMode("details")}
            className={`shrink-0 px-2 py-0.5 border cursor-pointer font-bold transition-all ${
              terminalMode === "details"
                ? `${colors.selectedBg} ${colors.accent} border-current shadow-xs`
                : "border-current/30 hover:border-current hover:bg-current/10"
            }`}
            title="快捷键: 按 3 切换到节点全屏详情看板"
          >
            [³details]
          </button>

        </div>
          {/* Terminal Menu — 放在滚动容器之外，下拉层才不会被裁掉 */}
          <div className="relative shrink-0" ref={menuRef}>
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
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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
          <div className="hidden sm:flex items-center text-xs">
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
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 text-xs min-w-0 max-w-full whitespace-nowrap">
              <button
                onClick={() => setSelectedRegion("ALL")}
                className={`shrink-0 px-2 py-0.5 border cursor-pointer transition-all ${
                  selectedRegion === "ALL" ? `${colors.selectedBg} ${colors.accent} font-bold border-current` : "border-current/30 hover:bg-current/10"
                }`}
              >
                [ ALL ({nodes.length}) ]
              </button>
              {allRegions.map((reg) => (
                <button
                  key={reg}
                  onClick={() => setSelectedRegion(reg)}
                  className={`shrink-0 px-2 py-0.5 border cursor-pointer transition-all flex items-center gap-1 ${
                    selectedRegion === reg ? `${colors.selectedBg} ${colors.accent} font-bold border-current` : "border-current/30 hover:bg-current/10"
                  }`}
                >
                  <span>{getRegionFlag(reg)}</span>
                  <span>[ {reg} ]</span>
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1 border border-current/30 px-2 py-0.5 text-xs w-full sm:w-auto">
                <Search className="h-3 w-3 shrink-0" />
                <input
                  type="text"
                  placeholder="FIND ❯ 过滤主机名, IP, 运营商..."
                  value={hostSearch}
                  onChange={(e) => setHostSearch(e.target.value)}
                  className="bg-transparent outline-none font-mono text-xs flex-1 min-w-0 sm:w-56 sm:flex-none"
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-2 gap-y-1 text-xs py-1.5 px-2 mb-2 border border-current/15 shrink-0 bg-current/5">
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
            <div className="col-span-2 sm:col-span-1 sm:text-right">
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
              <span className="hidden sm:inline">STAT</span>
              <span className="sm:hidden">●</span>
              {hostSortField === "status" && <span>{hostSortAsc ? "▲" : "▼"}</span>}
            </button>
            <button
              onClick={() => handleSort("name")}
              className="col-span-5 sm:col-span-2 text-left flex items-center gap-0.5 hover:text-current cursor-pointer"
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
              className="col-span-2 sm:col-span-1 text-right flex items-center justify-end gap-0.5 hover:text-current cursor-pointer"
              title="按CPU占用排序"
            >
              <span>CPU%</span>
              {hostSortField === "cpu" && <span>{hostSortAsc ? "▲" : "▼"}</span>}
            </button>
            <button
              onClick={() => handleSort("mem")}
              className="col-span-2 sm:col-span-1 text-right flex items-center justify-end gap-0.5 hover:text-current cursor-pointer"
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
              className="col-span-2 hidden sm:flex text-right items-center justify-end gap-0.5 hover:text-current cursor-pointer"
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
              const nIp = maskIP ? "**.***.***.**" : (n.system?.public_ip || "--");

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
                      <span className="text-emerald-600 dark:text-emerald-400">●<span className="hidden sm:inline"> ON</span></span>
                    ) : (
                      <span className={colors.textDim}>○<span className="hidden sm:inline"> OFF</span></span>
                    )}
                  </span>

                  {/* Name */}
                  <span className="col-span-5 sm:col-span-2 truncate font-semibold pr-1" title={n.name || n.node_id}>
                    {n.name || n.node_id}
                  </span>

                  {/* Region */}
                  <span className="col-span-1 hidden sm:flex items-center gap-1">
                    <span>{getRegionFlag(n.region)}</span>
                    <span className="uppercase text-[11px]">{n.region || "--"}</span>
                  </span>

                  {/* IP / Provider */}
                  <span className={`col-span-2 hidden md:inline truncate text-[11px] ${colors.textMuted}`}>
                    {nIp} · {nProvider}
                  </span>

                  {/* CPU% */}
                  <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-1">
                    <UsageCell pct={nCpu} online={n.is_online} colors={colors} />
                  </div>

                  {/* RAM% */}
                  <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-1">
                    <UsageCell pct={nMemPct} online={n.is_online} colors={colors} />
                  </div>

                  {/* DISK% (hidden on small) — 离线节点的磁盘占用仍是最后一次上报值，照常显示 */}
                  <div className="col-span-1 hidden lg:flex items-center justify-end gap-1">
                    <UsageCell pct={nDiskPct} online={nDiskPct > 0} colors={colors} />
                  </div>

                  {/* Net */}
                  <div className="col-span-2 hidden sm:flex items-center justify-end gap-1 font-mono text-[11px]">
                    {n.is_online ? (
                      <span className="truncate">
                        <span className="text-sky-600 dark:text-sky-400">▼</span>{formatRate(nDown)}{" "}
                        <span className="text-fuchsia-600 dark:text-fuchsia-400">▲</span>{formatRate(nUp)}
                      </span>
                    ) : (
                      <span className={colors.textDim}>--</span>
                    )}
                  </div>

                  {/* Ping */}
                  <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-1 font-mono text-[11px]">
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        !Number.isFinite(nPing)
                          ? "bg-zinc-500"
                          : nPing < 50
                          ? "bg-emerald-500"
                          : nPing < 120
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      }`}
                    />
                    <span
                      className={`font-semibold ${
                        !Number.isFinite(nPing)
                          ? colors.textMuted
                          : nPing < 50
                          ? "text-emerald-600 dark:text-emerald-400"
                          : nPing < 120
                          ? colors.warn
                          : colors.alert
                      }`}
                    >
                      {Number.isFinite(nPing) ? `${nPing.toFixed(0)}ms` : "--"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Shortcuts & Action Buttons */}
          <div className="pt-2 border-t border-current/20 mt-1 shrink-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] whitespace-nowrap">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="hidden sm:inline">↑ select ↓</span>
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
            <span className={`hidden sm:inline ${colors.textMuted}`}>
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
                <span className={colors.textMuted}>{cpuCores} threads</span>
              </div>
            </div>

            {/* Total CPU Progress Meter Bar */}
            <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
              <span className="font-bold shrink-0">CPU</span>
              <div className="flex-1 min-w-0"><BlockMeterFill percent={cpuPercent} colors={colors} /></div>
              <span className="font-bold shrink-0 w-8 text-right">{cpuPercent.toFixed(0)}%</span>
              <span className={`text-[11px] shrink-0 ${colors.textDim}`}>......... Tasks: {activeNode.system?.process_count || "--"}</span>
            </div>

            {/* Cores Breakdown + Smooth Wave on left */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Smooth CPU Waveform on Left (Takes 4 cols) */}
              <div className="hidden md:flex md:col-span-4 flex-col justify-center font-mono leading-none py-0.5">
                <div className="w-full h-[96px] border border-current/15 bg-current/5 p-1 relative">
                  <BtopWaveCanvas
                    downRate={cpuPercent}
                    mode="cpu"
                    colors={colors}
                    isLight={isLight}
                    title="CPU LOAD WAVE"
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] mt-1 font-bold select-none text-current/75">
                  <span>{uptimeStr}</span>
                  <span className={colors.textMuted}>Tasks: {activeNode.system?.process_count || "--"}</span>
                </div>
              </div>

              {/* Cores Breakdown or Hardware Spec Box (Takes 6 cols) */}
              {displayCoreCount <= 2 ? (
                <div className="md:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  {coreLoads.map((pct, i) => (
                    <div key={i} className="p-1.5 border border-current/15 bg-current/5 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-[11px]">Core {i}</span>
                        <span className={`font-mono font-bold ${pct > 80 ? colors.alert : pct > 50 ? colors.warn : colors.text}`}>
                          {pct}%
                        </span>
                      </div>
                      <BlockMeterFill percent={pct} colors={colors} />
                    </div>
                  ))}
                  <div className="p-1.5 border border-current/15 bg-current/5 space-y-0.5 text-[11px] flex flex-col justify-between">
                    <div className="flex justify-between">
                      <span className={colors.textMuted}>虚拟化:</span>
                      <span>{activeNode.system?.virtualization || "--"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={colors.textMuted}>系统内核:</span>
                      <span className="truncate max-w-[130px]">{activeNode.system?.kernel || "--"}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="md:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs font-mono">
                  {coreLoads.length === 0 && (
                    <span className={`sm:col-span-2 ${colors.textMuted}`}>
                      {cpuCores} cores · 总占用 {cpuPercent.toFixed(1)}%（分核数据需升级 Agent）
                    </span>
                  )}
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
              )}

              {/* Right Status: Load Average (Takes 2 cols) */}
              <div className="md:col-span-2 flex flex-col justify-end text-right text-xs space-y-1">
                <span className={colors.textMuted}>Load avg:</span>
                <span className="font-bold tracking-wider">
                  {activeNode.system?.load_1 != null && activeNode.system.load_1 > 0
                    ? `${activeNode.system.load_1.toFixed(2)} ${(activeNode.system.load_5 || activeNode.system.load_1).toFixed(2)} ${(activeNode.system.load_15 || activeNode.system.load_1).toFixed(2)}`
                    : "--"}
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
                      <div className="w-full mt-0.5"><BlockMeterFill percent={memPercent} colors={colors} /></div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center">
                        <span className={colors.textMuted}>Available:</span>
                        <div className="flex items-center gap-1.5">
                          <span>{fmtMem(memAvail)}</span>
                          <span className="w-8 text-right font-semibold text-current/75">
                            {memAvail > 0 ? `${pctOfMem(memAvail).toFixed(0)}%` : "--"}
                          </span>
                        </div>
                      </div>
                      <div className="w-full mt-0.5"><BlockMeterFill percent={pctOfMem(memAvail)} colors={colors} /></div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center">
                        <span className={colors.textMuted}>Cached / Buffers:</span>
                        <div className="flex items-center gap-1.5">
                          <span>{fmtMem(memCached)}</span>
                          <span className="w-8 text-right font-semibold text-current/75">
                            {memCached > 0 ? `${pctOfMem(memCached).toFixed(0)}%` : "--"}
                          </span>
                        </div>
                      </div>
                      <div className="w-full mt-0.5"><BlockMeterFill percent={pctOfMem(memCached)} colors={colors} /></div>
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
                      <div className="w-full mt-0.5"><BlockMeterFill percent={diskPercent} colors={colors} /></div>
                      <div className="flex justify-between text-[11px] mt-0.5">
                        <span className={colors.textMuted}>根分区使用率:</span>
                        <span className="font-semibold">{diskPercent.toFixed(1)}%</span>
                      </div>
                    </div>

                    <div className="pt-1 border-t border-dashed border-current/20">
                      <div className="flex justify-between">
                        <span className="font-bold">Virtual Swap</span>
                        <span>{formatBytes(swapUsed)} / {formatBytes(swapTotal)}</span>
                      </div>
                      <div className="w-full mt-0.5"><BlockMeterFill percent={Math.min(100, Math.max(0, swapPercent))} colors={colors} /></div>
                      <div className="flex justify-between text-[11px] mt-0.5">
                        <span className={colors.textMuted}>Swap 占用:</span>
                        <span className={swapPercent > 100 ? colors.alert : ""}>
                          {swapPercent.toFixed(1)}%{swapPercent > 100 ? " (Overcommitted)" : ""}
                        </span>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

              {/* PANEL 3: ³net (高帧率平滑波形图 + 完整收发吞吐) */}
              <div className={`border ${colors.border} rounded-none px-2.5 py-1.5 flex-1 min-h-0 flex flex-col relative`}>
                <div className="flex items-center justify-between text-xs pb-1 border-b border-current/20 mb-1.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">³net</span>
                    <span className={colors.textDim}>─────</span>
                    <span className={colors.textMuted}>sync</span>
                    <span className={colors.textMuted}>auto</span>
                    <span className={colors.textDim}>──</span>
                    <span className="font-bold" title="Agent 汇总全部物理网卡，已排除 lo / docker / veth / 隧道等虚拟接口">←b ∑ 物理网卡 n→</span>
                  </div>
                  <span className={`text-[11px] ${colors.textMuted}`}>TOTAL RECV: {formatBytes(netTotalDown)}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center text-xs flex-1 min-h-0 overflow-hidden">
                  {/* Left throughput wave chart (High-FPS smooth canvas wave filling height) */}
                  <div className="sm:col-span-6 flex flex-col h-full border border-current/15 bg-current/5 p-1 relative min-h-[140px]">
                    <BtopWaveCanvas
                      downRate={netDownRate}
                      upRate={netUpRate}
                      mode="net"
                      colors={colors}
                      isLight={isLight}
                      title="BANDWIDTH WAVE"
                    />
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
                        <span className={colors.textMuted}>▼ 本月峰值:</span>
                        <span>{activeNode.network?.monthly_peak_down ? `${(activeNode.network.monthly_peak_down * 8 / 1024).toFixed(0)} Kibps` : "--"}</span>
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
                        <span className={colors.textMuted}>▲ 本月峰值:</span>
                        <span>{activeNode.network?.monthly_peak_up ? `${(activeNode.network.monthly_peak_up * 8 / 1024).toFixed(0)} Kibps` : "--"}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-current/75">
                        <span className={colors.textMuted}>▲ 累计 Total:</span>
                        <span className="font-semibold">{formatBytes(netTotalUp)}</span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-current/20 pt-1 text-[10px] flex justify-between text-current/60">
                      <span>∑ 物理网卡汇总</span>
                      <span>TCP {activeNode.network?.tcp_established ?? "--"} · UDP {activeNode.network?.udp_established ?? "--"}</span>
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

                {pingSummary.count > 0 && (
                  <div className="flex items-center justify-between text-[10px] px-1.5 py-0.5 mb-1.5 border border-current/15 bg-current/5 shrink-0">
                    <span className={colors.textMuted}>三网延迟概览:</span>
                    <div className="flex items-center gap-2">
                      {pingSummary.telecomAvg != null && (
                        <span>电信 <span className="font-mono font-bold text-emerald-500">{pingSummary.telecomAvg.toFixed(0)}ms</span></span>
                      )}
                      {pingSummary.mobileAvg != null && (
                        <span>移动 <span className="font-mono font-bold text-emerald-500">{pingSummary.mobileAvg.toFixed(0)}ms</span></span>
                      )}
                      {pingSummary.unicomAvg != null && (
                        <span>联通 <span className="font-mono font-bold text-amber-500">{pingSummary.unicomAvg.toFixed(0)}ms</span></span>
                      )}
                    </div>
                  </div>
                )}

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
                      <span>流量配额: {formatBytes(billing.bandwidth_used || 0)} / {billing.bandwidth_quota > 0 ? formatBytes(billing.bandwidth_quota) : "无限制"}</span>
                      <span className={colors.accent}>{billing.bandwidth_quota > 0 ? `${quotaPercent}%` : "--"}</span>
                    </div>
                    <BlockMeterFill percent={quotaPercent} colors={colors} />
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
                        <span className="font-mono">{maskIP ? "**.***.***.**" : (activeNode.system?.public_ip || "--")}</span>
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
            <div className="border border-current/20 p-2.5 flex flex-col justify-between h-full overflow-y-auto no-scrollbar gap-2">
              <div className="font-bold text-xs pb-1 border-b border-current/20 flex items-center justify-between shrink-0">
                <span>┌─ [ 系统硬件与基础环境 ]</span>
                <span className={colors.accent}>SYSTEM SPEC</span>
              </div>

              {/* Host Overview Identity Card */}
              <div className="p-2 border border-current/15 bg-current/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">{getRegionFlag(activeNode.region)}</span>
                  <div>
                    <div className="font-bold text-xs flex items-center gap-1.5">
                      <span>{activeNode.name}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px] px-1 border border-emerald-500/30">
                        ONLINE
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-current/60">
                      ID: {activeNode.node_id}
                    </div>
                  </div>
                </div>
                <div className="text-right text-[11px]">
                  <div className="font-bold font-mono">{uptimeStr}</div>
                  <div className="text-[10px] text-current/60">Agent: {activeNode.system?.agent_version || latestAgentVersion || "v1.0"}</div>
                </div>
              </div>

              {/* Specs 2x2 Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs flex-1">
                {/* Compute Spec Box */}
                <div className="p-2 border border-current/15 bg-current/5 space-y-1.5 flex flex-col justify-between">
                  <div className="font-bold text-[11px] pb-1 border-b border-dashed border-current/20 flex justify-between">
                    <span className={colors.accent}>COMPUTE / 算力规格</span>
                    <span className="font-mono text-[10px]">x86_64</span>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className={colors.textMuted}>CPU 架构:</span>
                      <span className="font-semibold truncate max-w-[170px]" title={cpuModel}>{cpuModel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={colors.textMuted}>核心规格:</span>
                      <span className="font-mono font-bold">{cpuCores} Cores / {cpuCores} Threads</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={colors.textMuted}>虚拟化技术:</span>
                      <span>{activeNode.system?.virtualization || "--"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={colors.textMuted}>任务进程数:</span>
                      <span className="font-mono">{activeNode.system?.process_count || "--"} Tasks</span>
                    </div>
                  </div>
                </div>

                {/* OS & Platform Box */}
                <div className="p-2 border border-current/15 bg-current/5 space-y-1.5 flex flex-col justify-between">
                  <div className="font-bold text-[11px] pb-1 border-b border-dashed border-current/20 flex justify-between">
                    <span className={colors.accent}>PLATFORM / 操作系统</span>
                    <span className="text-[10px] text-current/60">LINUX</span>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className={colors.textMuted}>发行版本:</span>
                      <span className="font-semibold truncate max-w-[170px]">{activeNode.system?.os || "--"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={colors.textMuted}>系统内核:</span>
                      <span className="font-mono truncate max-w-[170px]">{activeNode.system?.kernel || "--"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={colors.textMuted}>数据中心/ISP:</span>
                      <span className="truncate max-w-[170px]">{billing.provider || "--"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={colors.textMuted}>主机区域:</span>
                      <span className="font-bold">{activeNode.region || "--"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Network Address & Interfaces Matrix */}
              <div className="p-2 border border-current/15 bg-current/5 space-y-1.5 text-xs shrink-0">
                <div className="font-bold text-[11px] pb-1 border-b border-dashed border-current/20 flex justify-between">
                  <span className={colors.accent}>NETWORK ADDRESS / 网络地址</span>
                  <button
                    onClick={() => setMaskIP(!maskIP)}
                    className="text-[10px] hover:underline cursor-pointer"
                  >
                    [{maskIP ? "显示真实IP" : "遮掩IP"}]
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center justify-between bg-current/5 px-2 py-1 border border-current/10">
                    <span className={colors.textMuted}>公网 IPv4:</span>
                    <div className="flex items-center gap-1 font-mono font-bold">
                      <span>{maskIP ? "**.***.***.**" : (activeNode.system?.public_ip || "--")}</span>
                      <button
                        onClick={() => activeNode.system?.public_ip && handleCopy(activeNode.system.public_ip, "IPv4 地址")}
                        className="hover:opacity-75 cursor-pointer ml-1"
                        title="复制 IPv4"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-current/5 px-2 py-1 border border-current/10">
                    <span className={colors.textMuted}>公网 IPv6:</span>
                    <div className="flex items-center gap-1 font-mono">
                      <span className="truncate max-w-[160px]">{maskIP ? "****:****::**" : (activeNode.system?.public_ipv6 || "2605:52c0:2:65f8::1")}</span>
                      <button
                        onClick={() => handleCopy(activeNode.system?.public_ipv6 || "2605:52c0:2:65f8::1", "IPv6 地址")}
                        className="hover:opacity-75 cursor-pointer ml-1"
                        title="复制 IPv6"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hardware Capacity Badges */}
              <div className="grid grid-cols-3 gap-2 text-[11px] text-center shrink-0">
                <div className="py-1 px-1.5 border border-current/15 bg-current/5">
                  <div className={`text-[10px] ${colors.textMuted}`}>总内存容量</div>
                  <div className="font-bold font-mono mt-0.5">{formatBytes(memTotal)}</div>
                </div>
                <div className="py-1 px-1.5 border border-current/15 bg-current/5">
                  <div className={`text-[10px] ${colors.textMuted}`}>系统总存储</div>
                  <div className="font-bold font-mono mt-0.5">{formatBytes(diskTotal)}</div>
                </div>
                <div className="py-1 px-1.5 border border-current/15 bg-current/5">
                  <div className={`text-[10px] ${colors.textMuted}`}>虚拟 Swap</div>
                  <div className="font-bold font-mono mt-0.5">{formatBytes(swapTotal)}</div>
                </div>
              </div>
            </div>

            {/* Quadrant 2: Live Resource Telemetry & Meters */}
            <div className="border border-current/20 p-2.5 flex flex-col justify-between h-full overflow-y-auto no-scrollbar gap-2">
              <div className="font-bold text-xs pb-1 border-b border-current/20 flex items-center justify-between shrink-0">
                <span>┌─ [ 实时资源负载与仪表 ]</span>
                <span className={colors.accent}>LIVE TELEMETRY</span>
              </div>

              {/* CPU Meter Block */}
              <div className="p-2 border border-current/15 bg-current/5 space-y-1 shrink-0">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold flex items-center gap-1.5">
                    <span className={colors.accent}>CPU</span> 整体负载:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-current/70">
                      Load: {(activeNode.system?.load_1 || 0).toFixed(2)} {(activeNode.system?.load_5 || 0).toFixed(2)} {(activeNode.system?.load_15 || 0).toFixed(2)}
                    </span>
                    <span className="font-mono font-bold text-xs">{cpuPercent.toFixed(1)}%</span>
                  </div>
                </div>
                <BlockMeterFill percent={cpuPercent} colors={colors} />
              </div>

              {/* RAM Meter Block */}
              <div className="p-2 border border-current/15 bg-current/5 space-y-1 shrink-0">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold flex items-center gap-1.5">
                    <span className={colors.accent}>RAM</span> 物理内存:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-current/70">
                      {formatBytes(memUsed)} / {formatBytes(memTotal)}
                    </span>
                    <span className="font-mono font-bold text-xs">{memPercent.toFixed(0)}%</span>
                  </div>
                </div>
                <BlockMeterFill percent={memPercent} colors={colors} />
                <div className="flex justify-between text-[10px] text-current/70 pt-0.5">
                  <span>可用: {fmtMem(memAvail)}</span>
                  <span>缓存: {fmtMem(memCached)}</span>
                  <span>空闲: {formatBytes(memFree)}</span>
                </div>
              </div>

              {/* Disk & Swap Storage Block */}
              <div className="p-2 border border-current/15 bg-current/5 space-y-1 shrink-0">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold flex items-center gap-1.5">
                    <span className={colors.accent}>DISK</span> 系统盘 ( / ):
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-current/70">
                      {formatBytes(diskUsed)} / {formatBytes(diskTotal)}
                    </span>
                    <span className="font-mono font-bold text-xs">{diskPercent.toFixed(1)}%</span>
                  </div>
                </div>
                <BlockMeterFill percent={diskPercent} colors={colors} />
                <div className="flex justify-between text-[10px] text-current/70 pt-0.5">
                  <span>根分区 /</span>
                  <span>Swap: {formatBytes(swapUsed)} / {formatBytes(swapTotal)}</span>
                </div>
              </div>

              {/* Embedded Live Bandwidth Wave & Rates */}
              <div className="p-2 border border-current/15 bg-current/5 flex-1 min-h-[110px] flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs pb-1 border-b border-dashed border-current/20 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">实时网络波形 (LIVE WAVE)</span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400">● LIVE</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px] font-mono">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">▼ {formatRate(netDownRate)}</span>
                    <span className={`${colors.accent} font-bold`}>▲ {formatRate(netUpRate)}</span>
                  </div>
                </div>
                <div className="flex-1 min-h-[75px] w-full relative mt-1">
                  <BtopWaveCanvas
                    downRate={netDownRate}
                    upRate={netUpRate}
                    mode="net"
                    colors={colors}
                    isLight={isLight}
                    title="THROUGHPUT"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-current/60 pt-1 shrink-0">
                  <span>TCP {activeNode.network?.tcp_established ?? "--"} · UDP {activeNode.network?.udp_established ?? "--"}</span>
                  <span>累计流量: {formatBytes(netTotalDown + netTotalUp)}</span>
                </div>
              </div>
            </div>

            {/* Quadrant 3: Billing & Traffic Quotas */}
            <div className="border border-current/20 p-2.5 flex flex-col justify-between h-full overflow-y-auto no-scrollbar gap-2">
              <div className="font-bold text-xs pb-1 border-b border-current/20 flex items-center justify-between shrink-0">
                <span>┌─ [ 资费计费与双向流量配额 ]</span>
                <span className={colors.accent}>BILLING & QUOTA</span>
              </div>

              {/* Top 3 Financial Metric Badges */}
              <div className="grid grid-cols-3 gap-2 text-xs shrink-0">
                <div className="p-2 border border-current/15 bg-current/5 flex flex-col justify-between">
                  <div className={`text-[10px] ${colors.textMuted}`}>套餐资费 / PLAN</div>
                  <div className={`font-bold font-mono text-sm mt-0.5 ${colors.accent}`}>
                    {billing.price ? `${billing.currency || "$"} ${billing.price}` : "--"}
                  </div>
                  <div className="text-[10px] text-current/70">
                    {billing.price ? `周期: ${getCycleLabel(billing.billing_cycle)}` : "未配置资费"}
                  </div>
                </div>

                <div className="p-2 border border-current/15 bg-current/5 flex flex-col justify-between">
                  <div className={`text-[10px] ${colors.textMuted}`}>到期时间 / EXPIRY</div>
                  <div className="font-bold font-mono text-xs mt-0.5 truncate">
                    {billing.expiry_date || "长期有效"}
                  </div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                    {billing.remaining_days ? `剩余 ${billing.remaining_days} 天` : (billing.auto_renewal ? "自动续费" : "--")}
                  </div>
                </div>

                <div className="p-2 border border-current/15 bg-current/5 flex flex-col justify-between">
                  <div className={`text-[10px] ${colors.textMuted}`}>剩余价值 / VALUE</div>
                  <div className="font-bold font-mono text-xs mt-0.5 text-amber-600 dark:text-amber-400 truncate">
                    {billing.remaining_value ? `¥ ${billing.remaining_value.toFixed(2)} CNY` : "--"}
                  </div>
                  <div className="text-[10px] text-current/70">
                    {billing.auto_renewal ? "● 自动续费" : "○ 手动续费"}
                  </div>
                </div>
              </div>

              {/* Bandwidth Quota Management Card */}
              <div className="p-2.5 border border-current/15 bg-current/5 space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center text-xs font-bold mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className={colors.accent}>双向流量配额:</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">
                        {formatBytes(billing.bandwidth_used || 0)} / {billing.bandwidth_quota > 0 ? formatBytes(billing.bandwidth_quota) : "无限制"}
                      </span>
                      <span className={`${colors.accent} font-mono font-bold`}>{billing.bandwidth_quota > 0 ? `${quotaPercent}%` : "--"}</span>
                    </div>
                  </div>
                  <BlockMeterFill percent={quotaPercent} colors={colors} />
                </div>

                {/* Uplink vs Downlink Split */}
                <div className="grid grid-cols-3 gap-2 text-xs p-2 bg-current/5 border border-current/10">
                  <div>
                    <div className={`text-[10px] ${colors.textMuted}`}>▲ 上行已用</div>
                    <div className="font-semibold font-mono mt-0.5">{usedSplit ? formatBytes(usedSplit.up) : "--"}</div>
                  </div>
                  <div>
                    <div className={`text-[10px] ${colors.textMuted}`}>▼ 下行已用</div>
                    <div className="font-semibold font-mono mt-0.5">{usedSplit ? formatBytes(usedSplit.down) : "--"}</div>
                  </div>
                  <div>
                    <div className={`text-[10px] ${colors.textMuted}`}>剩余可用配额</div>
                    <div className="font-semibold font-mono mt-0.5 text-emerald-600 dark:text-emerald-400">
                      {billing.bandwidth_quota > 0 ? formatBytes(Math.max(0, billing.bandwidth_quota - (billing.bandwidth_used || 0))) : "--"}
                    </div>
                  </div>
                </div>

                {/* Consumption Analytics & Projection */}
                <div className="space-y-1 text-xs pt-1 border-t border-dashed border-current/20">
                  <div className="flex justify-between text-[11px]">
                    <span className={colors.textMuted}>网卡计数（开机以来）:</span>
                    <span className="font-mono">{billing.bandwidth_live ? formatBytes(billing.bandwidth_live) : "--"}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className={colors.textMuted}>线路运营服务商:</span>
                    <span className="font-semibold truncate max-w-[200px]">{billing.provider || "--"}</span>
                  </div>
                </div>
              </div>

              {/* Renewal Status & Tips */}
              <div className="p-2 border border-current/15 bg-current/5 flex items-center justify-between text-[11px] shrink-0">
                <span className={colors.textMuted}>
                  {billing.auto_renewal ? "✔ 服务已设自动续约，周期末将自动延续" : "⚠ 当前为手动续费模式，请留意到期时间"}
                </span>
                <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 border border-current/30">
                  {billing.auto_renewal ? "AUTO-RENEW" : "MANUAL"}
                </span>
              </div>
            </div>

            {/* Quadrant 4: Ping Target Matrix */}
            <div className="border border-current/20 p-2.5 flex flex-col justify-between h-full overflow-y-auto no-scrollbar gap-2">
              <div className="font-bold text-xs pb-1 border-b border-current/20 flex items-center justify-between shrink-0">
                <span>┌─ [ 三网与核心网络延迟监测矩阵 ]</span>
                <span className={colors.accent}>PING TARGETS ({pingTargets.length})</span>
              </div>

              {/* Summary Bar */}
              {pingSummary.count > 0 && (
                <div className="p-1.5 border border-current/15 bg-current/5 flex flex-wrap items-center justify-between gap-1.5 text-xs shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={colors.textMuted}>监测节点:</span>
                    <span className="font-bold font-mono">{pingSummary.count}</span>
                    <span className={colors.textDim}>|</span>
                    <span className={colors.textMuted}>均值:</span>
                    <span className="font-bold font-mono">{pingSummary.avgLatency} ms</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {pingSummary.telecomAvg != null && (
                      <span>电信 <span className="font-mono font-bold text-emerald-500">{pingSummary.telecomAvg.toFixed(0)}ms</span></span>
                    )}
                    {pingSummary.mobileAvg != null && (
                      <span>移动 <span className="font-mono font-bold text-emerald-500">{pingSummary.mobileAvg.toFixed(0)}ms</span></span>
                    )}
                    {pingSummary.unicomAvg != null && (
                      <span>联通 <span className="font-mono font-bold text-amber-500">{pingSummary.unicomAvg.toFixed(0)}ms</span></span>
                    )}
                  </div>
                </div>
              )}

              {/* Responsive Ping Target Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 flex-1 overflow-y-auto no-scrollbar">
                {pingTargets.map((p, idx) => {
                  const isFast = p.latency_ms < 60;
                  const isMedium = p.latency_ms < 150;
                  const latColor = isFast
                    ? "text-emerald-600 dark:text-emerald-400"
                    : isMedium
                    ? colors.warn
                    : colors.alert;
                  const dotColor = isFast
                    ? "bg-emerald-500"
                    : isMedium
                    ? "bg-amber-500"
                    : "bg-rose-500";
                  const qualityTag = isFast ? "极速" : isMedium ? "良好" : "偏高";

                  return (
                    <div
                      key={idx}
                      className="p-2 border border-current/15 bg-current/5 flex flex-col justify-between hover:bg-current/10 transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                          <span className="font-bold text-xs truncate">{p.label.split(" ")[0]}</span>
                        </div>
                        <span className={`text-[10px] px-1 border border-current/20 font-bold ${latColor}`}>
                          {qualityTag}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-sm font-bold tracking-tight">
                          <span className={latColor}>{p.latency_ms.toFixed(1)}</span>
                          <span className="text-[10px] text-current/60 ml-0.5">ms</span>
                        </span>
                        <span className={`text-[10px] font-mono ${p.packet_loss > 0 ? colors.alert : colors.textMuted}`}>
                          丢包: {p.packet_loss}%
                        </span>
                      </div>

                      {/* Mini latency visual meter */}
                      <div className="w-full bg-current/10 h-1 rounded-none overflow-hidden">
                        <div
                          className={`h-full ${isFast ? "bg-emerald-500" : isMedium ? "bg-amber-500" : "bg-rose-500"}`}
                          style={{ width: `${Math.min(100, Math.max(8, (p.latency_ms / 300) * 100))}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-[10px] text-current/60 font-mono truncate">
                        <span className="truncate">{p.target.replace(".com", "").replace(".cn", "")}</span>
                        <span>抖动: {p.jitter?.toFixed(1) || "1.0"}ms</span>
                      </div>
                    </div>
                  );
                })}
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
                    `ssh root@${activeNode.system?.public_ip || activeNode.system?.public_ipv6 || "<IP>"}`,
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
                    `mtr -rw -c 50 ${activeNode.system?.public_ip || activeNode.system?.public_ipv6 || "<IP>"}`,
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

/**
 * 主机列表里的占用率单元：btop 风格的 5 格小量表（宽屏才显示）+ 按阈值着色的百分比。
 * 离线节点显示 "--"，不把最后一次上报的 CPU/内存当成当前值。
 */
function UsageCell({ pct, online, colors }: { pct: number; online: boolean; colors: { alert: string; warn: string; textDim: string } }) {
  if (!online) return <span className={`w-9 text-right font-mono ${colors.textDim}`}>--</span>;
  const tone = pct >= 85 ? colors.alert : pct >= 65 ? colors.warn : "";
  const filled = Math.min(5, Math.max(pct > 0 ? 1 : 0, Math.round(pct / 20)));
  return (
    <>
      <span className="hidden xl:inline font-mono text-[10px] tracking-[-0.05em] select-none" aria-hidden>
        <span className={tone || "text-emerald-600 dark:text-emerald-400"}>{"■".repeat(filled)}</span>
        <span className={colors.textDim}>{"■".repeat(5 - filled)}</span>
      </span>
      <span className={`w-9 text-right font-mono font-semibold ${tone}`}>{pct.toFixed(0)}%</span>
    </>
  );
}

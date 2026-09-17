import React, { useRef, useState, useMemo } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Star,
  Cpu,
  Layers,
  HardDrive,
  ArrowUpDown,
  Calendar,
  Coins,
  Ticket,
  Check,
} from "lucide-react";
import { NodeState } from "../types";
import { formatBytes, formatRate } from "../utils/format";
import { getRegionFlag } from "../utils/flags";
import { getTagStyle } from "../utils/tagColors";
import { agentVersionOf } from "../utils/agentVersion";
import { OsIcon } from "./OsIcon";
import { AgentVersionMark } from "./AgentVersionMark";
import { cn } from "../lib/utils";
import { NumberTicker } from "./ui/NumberTicker";
import { BorderBeam } from "./ui/BorderBeam";

interface ServerCardProps {
  node: NodeState;
  onSelect: (node: NodeState) => void;
  theme?: "blueprint" | "dark";
  /** 服务端会下发的 Agent 版本，用作比较基准；缺省则不做版本判断。 */
  latestAgentVersion?: string;
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

export function ServerCard({ node, onSelect, theme = "dark", latestAgentVersion }: ServerCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);
  const [copiedNote, setCopiedNote] = useState(false);
  const [isStarred, setIsStarred] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(`starred_${node.node_id}`);
      return saved === "true";
    } catch {
      return false;
    }
  });

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

  const isBlueprint = theme === "blueprint";

  // undefined（旧 Agent 不发这个字段）与空串（未打版本戳的构建）都归为「未知」，
  // 绝不回落到任何版本号占位串。
  const agentVersion = agentVersionOf(node.system);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // RAM string
  const memUsedStr = formatBytes(node.system.mem_used);
  const memTotalStr = formatBytes(node.system.mem_total);
  const memSub = `${memUsedStr} / ${memTotalStr}`;

  // Disk string
  const diskUsedStr = node.system.disk_used ? formatBytes(node.system.disk_used) : "";
  const diskTotalStr = node.system.disk_total ? formatBytes(node.system.disk_total) : "";
  const diskSub = diskUsedStr && diskTotalStr ? `${diskUsedStr} / ${diskTotalStr}` : undefined;

  // Load string
  const loadStr = node.system.load_1 != null
    ? `${node.system.load_1.toFixed(2)}, ${(node.system.load_5 || node.system.load_1).toFixed(2)}, ${(node.system.load_15 || node.system.load_1).toFixed(2)}`
    : "0.00, 0.00, 0.00";

  // Bandwidth Quota calculation prioritizing configured bandwidth_used
  const usedTraffic = (node.billing?.bandwidth_used && node.billing.bandwidth_used > 0)
    ? node.billing.bandwidth_used
    : (node.network.bytes_recv + node.network.bytes_sent);
  const quotaBytes = node.billing?.bandwidth_quota || 2 * 1024 * 1024 * 1024 * 1024;
  const quotaPercent = quotaBytes > 0 ? Math.min(100, (usedTraffic / quotaBytes) * 100) : 0;

  // Pricing label
  const priceText = node.billing
    ? `${node.billing.currency || "$"}${node.billing.price != null && node.billing.price > 0 ? node.billing.price : (node.billing.price_per_month || 0)} / ${getCycleLabel(node.billing.billing_cycle)}`
    : null;

  // Dynamic status tags (only real tags configured on the host)
  const displayTags = node.tags && node.tags.length > 0 ? node.tags : [];

  // One tick per probe target — the agent reports a single current value per
  // target, so there is no time series here to draw.
  const pings = node.pings && node.pings.length > 0 ? node.pings : [];

  // The agent only writes `latency_ms` on a successful probe, so a target that
  // has never answered sits at 0 forever. Averaging those in drags latency down
  // and pushes loss up; they get their own tick instead.
  const reachable = useMemo(() => pings.filter((p) => p.latency_ms > 0), [pings]);

  const avgLatency = reachable.length > 0
    ? reachable.reduce((sum, p) => sum + p.latency_ms, 0) / reachable.length
    : null;
  const avgLoss = reachable.length > 0
    ? reachable.reduce((sum, p) => sum + p.packet_loss, 0) / reachable.length
    : null;

  const latencyQuality = useMemo(() => {
    if (!node.is_online || avgLatency === null) {
      return { label: "离线", color: "text-zinc-500", dot: "bg-zinc-500", badge: "bg-zinc-500/10 border-zinc-500/20 text-zinc-500" };
    }
    if (avgLatency < 50) {
      return { label: "极速", color: "text-emerald-500 dark:text-emerald-400", dot: "bg-emerald-500", badge: "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400" };
    }
    if (avgLatency < 100) {
      return { label: "优良", color: "text-teal-500 dark:text-teal-400", dot: "bg-teal-500", badge: "bg-teal-500/10 border-teal-500/25 text-teal-600 dark:text-teal-400" };
    }
    if (avgLatency < 180) {
      return { label: "良好", color: "text-sky-500 dark:text-sky-400", dot: "bg-sky-500", badge: "bg-sky-500/10 border-sky-500/25 text-sky-600 dark:text-sky-400" };
    }
    if (avgLatency < 260) {
      return { label: "稍慢", color: "text-amber-500 dark:text-amber-400", dot: "bg-amber-500", badge: "bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400" };
    }
    return { label: "拥堵", color: "text-rose-500 dark:text-rose-400", dot: "bg-rose-500", badge: "bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400" };
  }, [node.is_online, avgLatency]);

  const [expandedPings, setExpandedPings] = useState(false);
  const displayedPings = pings.length <= 4 || expandedPings ? pings : pings.slice(0, 4);


  // Progress Bar Semantic Colors
  const getBarColor = (pct: number) => {
    if (pct >= 85) return "bg-rose-500";
    if (pct >= 70) return "bg-amber-500";
    return "bg-emerald-500";
  };

  const getTextColor = (pct: number) => {
    if (pct >= 85) return "text-rose-500 dark:text-rose-400";
    if (pct >= 70) return "text-amber-500 dark:text-amber-400";
    return "text-emerald-600 dark:text-emerald-400";
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      onClick={() => onSelect(node)}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border p-4 sm:p-5 transition-all duration-200 ${
        isBlueprint
          ? "bg-white border-slate-200/90 text-slate-800 shadow-sm hover:border-slate-300 hover:shadow-md"
          : "border-zinc-800/80 bg-[#0d1829]/75 text-zinc-100 backdrop-blur-md hover:border-zinc-700/80 hover:shadow-lg hover:shadow-indigo-500/5"
      }`}
    >
      {/* Spotlight Hover Glow */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity,
          background: isBlueprint
            ? `radial-gradient(350px circle at ${position.x}px ${position.y}px, rgba(99, 102, 241, 0.08), transparent 80%)`
            : `radial-gradient(350px circle at ${position.x}px ${position.y}px, rgba(120, 119, 198, 0.16), transparent 80%)`,
        }}
      />

      {/* Traveling border beam — only on live nodes, revealed on hover */}
      {node.is_online && (
        <BorderBeam
          size={110}
          duration={7}
          className="opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          colorFrom={isBlueprint ? "#6366f1" : "#818cf8"}
          colorTo={isBlueprint ? "#06b6d4" : "#22d3ee"}
        />
      )}

      {/* 1. Top Header: Status Beacon, Name, Star, OS Icon, Flag */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <span
            className={`h-2.5 w-2.5 rounded-full shrink-0 transition-all ${
              node.is_online
                ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
                : "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]"
            }`}
          />
          <span
            className={`truncate font-bold font-sans text-sm sm:text-base tracking-tight ${
              isBlueprint ? "text-slate-900" : "text-zinc-100"
            }`}
            title={node.name}
          >
            {node.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* 1. Star Button Badge */}
          <button
            onClick={toggleStar}
            className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
              isStarred
                ? isBlueprint
                  ? "bg-amber-50 text-amber-500"
                  : "bg-amber-500/15 text-amber-400"
                : isBlueprint
                ? "text-slate-400 hover:bg-slate-100 hover:text-amber-500"
                : "text-zinc-400 hover:bg-zinc-800/80 hover:text-amber-400"
            }`}
            title={isStarred ? "取消星标" : "加入星标"}
          >
            <Star
              className={`h-3.5 w-3.5 ${
                isStarred ? "fill-amber-400 text-amber-400" : ""
              }`}
            />
          </button>

          {/* 2. OS Icon Badge. Borderless, so the icon itself carries the weight
              and is sized up to match the flag glyph beside it. */}
          <div
            className={`h-7 w-7 rounded-lg flex items-center justify-center ${
              isBlueprint ? "text-slate-600" : "text-zinc-300"
            }`}
            title={`${node.system.os || "Linux"} (${node.system.kernel || ""})`}
          >
            <OsIcon os={node.system.os} className="h-5 w-5" />
          </div>

          {/* 3. Region Flag Badge */}
          <div
            className={`h-7 px-1.5 rounded-lg flex items-center justify-center gap-1 text-xs font-mono font-bold ${
              isBlueprint ? "text-slate-700" : "text-zinc-200"
            }`}
            title={node.region}
          >
            <span className="text-sm leading-none">{getRegionFlag(node.region)}</span>
            <span className={`text-10 uppercase font-bold ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
              {node.region || "DEF"}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Sub-header Badges: Uptime & Pricing & Note */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
        <span
          className={`rounded-md px-2 py-0.5 text-11 font-sans font-medium border flex items-center gap-1 ${
            node.is_online
              ? isBlueprint
                ? "bg-sky-50 border-sky-200/80 text-sky-700"
                : "bg-sky-950/40 border-sky-500/30 text-sky-300"
              : isBlueprint
              ? "bg-rose-50 border-rose-200 text-rose-600"
              : "bg-rose-950/40 border-rose-500/30 text-rose-300"
          }`}
        >
          <Clock className="h-3 w-3 opacity-70" />
          <span>{node.is_online ? `在线 ${node.uptime_str || "0m"}` : "已离线"}</span>
        </span>

        <span
          className={`rounded-md px-2 py-0.5 text-11 font-sans font-medium border ${
            isBlueprint
              ? "bg-indigo-50 border-indigo-200/80 text-indigo-700"
              : "bg-indigo-950/40 border-indigo-500/30 text-indigo-300"
          }`}
        >
          {priceText}
        </span>

        {node.billing?.note && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(node.billing?.note || "");
              setCopiedNote(true);
              setTimeout(() => setCopiedNote(false), 1500);
            }}
            className={cn(
              "rounded-md px-2 py-0.5 text-11 font-sans font-medium border flex items-center gap-1 cursor-pointer transition-all active:scale-95 group/note max-w-[140px] truncate",
              copiedNote
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : isBlueprint
                ? "bg-amber-50/90 border-amber-200/90 text-amber-700 hover:bg-amber-100/90 shadow-2xs"
                : "bg-amber-950/40 border-amber-500/30 text-amber-300 hover:bg-amber-900/50"
            )}
            title={`备注/折扣码: ${node.billing.note} (点击复制)`}
          >
            {copiedNote ? (
              <Check className="h-3 w-3 text-emerald-500 shrink-0" />
            ) : (
              <Ticket className="h-3 w-3 text-amber-500 shrink-0 group-hover/note:rotate-12 transition-transform" />
            )}
            <span className="truncate">{copiedNote ? "已复制" : node.billing.note}</span>
          </span>
        )}

        {/* 与基准一致时这个组件返回 null，所以健康机群的卡片宽度不变。 */}
        <AgentVersionMark
          version={agentVersion}
          latestVersion={latestAgentVersion}
          isBlueprint={isBlueprint}
        />
      </div>

      {/* 3. 2x2 Core Metrics Matrix (CPU, RAM, Disk, Traffic) */}
      <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 font-mono">
        {/* CPU */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className={`flex items-center gap-1.5 font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
              <Cpu className="h-3.5 w-3.5 text-sky-500 shrink-0" />
              <span>CPU</span>
            </span>
            <span className={`font-bold ${getTextColor(node.cpu)}`}>
              <NumberTicker value={node.cpu} decimals={1} suffix="%" />
            </span>
          </div>
          <div className={`text-10 truncate ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
            {loadStr}
          </div>
          <div className={`h-1.5 w-full rounded-full overflow-hidden ${isBlueprint ? "bg-slate-200" : "bg-zinc-800"}`}>
            <div
              className={`h-full rounded-full transition-all duration-300 ${getBarColor(node.cpu)}`}
              style={{ width: `${Math.min(100, Math.max(0, node.cpu))}%` }}
            />
          </div>
        </div>

        {/* 内存 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className={`flex items-center gap-1.5 font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
              <Layers className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>内存</span>
            </span>
            <span className={`font-bold ${getTextColor(node.mem)}`}>
              <NumberTicker value={node.mem} decimals={1} suffix="%" />
            </span>
          </div>
          <div className={`text-10 truncate ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
            {memSub}
          </div>
          <div className={`h-1.5 w-full rounded-full overflow-hidden ${isBlueprint ? "bg-slate-200" : "bg-zinc-800"}`}>
            <div
              className={`h-full rounded-full transition-all duration-300 ${getBarColor(node.mem)}`}
              style={{ width: `${Math.min(100, Math.max(0, node.mem))}%` }}
            />
          </div>
        </div>

        {/* 硬盘 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className={`flex items-center gap-1.5 font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
              <HardDrive className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span>硬盘</span>
            </span>
            <span className={`font-bold ${getTextColor(node.disk)}`}>
              <NumberTicker value={node.disk} decimals={1} suffix="%" />
            </span>
          </div>
          <div className={`text-10 truncate ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
            {diskSub || `${formatBytes(node.system.disk_used || 0)} / ${formatBytes(node.system.disk_total || 0)}`}
          </div>
          <div className={`h-1.5 w-full rounded-full overflow-hidden ${isBlueprint ? "bg-slate-200" : "bg-zinc-800"}`}>
            <div
              className={`h-full rounded-full transition-all duration-300 ${getBarColor(node.disk)}`}
              style={{ width: `${Math.min(100, Math.max(0, node.disk))}%` }}
            />
          </div>
        </div>

        {/* 流量 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className={`flex items-center gap-1.5 font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
              <ArrowUpDown className="h-3.5 w-3.5 text-purple-500 shrink-0" />
              <span>流量</span>
            </span>
            <span className={`font-bold ${quotaBytes > 0 ? getTextColor(quotaPercent) : "text-blue-500"}`}>
              {quotaBytes > 0 ? <NumberTicker value={quotaPercent} decimals={1} suffix="%" /> : "0%"}
            </span>
          </div>
          <div className={`text-10 truncate ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
            {formatBytes(usedTraffic)} / {quotaBytes > 0 ? formatBytes(quotaBytes) : "无限制"}
          </div>
          <div className={`h-1.5 w-full rounded-full overflow-hidden ${isBlueprint ? "bg-slate-200" : "bg-zinc-800"}`}>
            <div
              className={`h-full rounded-full transition-all duration-300 ${quotaBytes > 0 ? getBarColor(quotaPercent) : "bg-blue-500"}`}
              style={{ width: `${quotaBytes > 0 ? Math.min(100, Math.max(0, quotaPercent)) : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* 4. 3-Column Mini Info Cards (Rates, Bandwidth, Billing) */}
      <div className="mt-3.5 grid grid-cols-3 gap-2 text-xs font-mono">
        {/* Real-time Rate */}
        <div className={`p-2 rounded-lg border ${
          isBlueprint ? "bg-slate-50/80 border-slate-200/80" : "bg-zinc-950/40 border-zinc-800/50"
        }`}>
          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold truncate">
            <ArrowUp className="h-3 w-3 shrink-0" />
            <span className="truncate">{formatRate(node.rate_up)}</span>
          </div>
          <div className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400 font-semibold truncate mt-0.5">
            <ArrowDown className="h-3 w-3 shrink-0" />
            <span className="truncate">{formatRate(node.rate_down)}</span>
          </div>
        </div>

        {/* Cumulative Tx / Rx */}
        <div className={`p-2 rounded-lg border ${
          isBlueprint ? "bg-slate-50/80 border-slate-200/80" : "bg-zinc-950/40 border-zinc-800/50"
        }`}>
          <div className="flex items-center gap-1 text-slate-700 dark:text-zinc-300 font-medium truncate">
            <ArrowUp className="h-3 w-3 text-indigo-500 shrink-0" />
            <span className="truncate">{formatBytes(node.network.bytes_sent)}</span>
          </div>
          <div className="flex items-center gap-1 text-slate-700 dark:text-zinc-300 font-medium truncate mt-0.5">
            <ArrowDown className="h-3 w-3 text-cyan-500 shrink-0" />
            <span className="truncate">{formatBytes(node.network.bytes_recv)}</span>
          </div>
        </div>

        {/* Expiry & Remaining Value */}
        <div className={`p-2 rounded-lg border ${
          isBlueprint ? "bg-slate-50/80 border-slate-200/80" : "bg-zinc-950/40 border-zinc-800/50"
        }`}>
          <div className="flex items-center gap-1 text-slate-700 dark:text-zinc-300 font-medium truncate">
            <Calendar className="h-3 w-3 text-amber-500 shrink-0" />
            <span className="truncate">
              {node.billing?.remaining_days != null ? `剩 ${node.billing.remaining_days}天` : "未设到期"}
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-700 dark:text-zinc-300 font-medium truncate mt-0.5">
            <Coins className="h-3 w-3 text-cyan-500 shrink-0" />
            <span className="truncate">
              {node.billing?.remaining_value != null ? `${node.billing.currency || "$"}${node.billing.remaining_value.toFixed(1)}` : "--"}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Latency & Packet Loss Section (Per-target segmented chart) */}
      <div className={`mt-3.5 pt-3 border-t font-mono text-xs ${
        isBlueprint ? "border-slate-100" : "border-zinc-800/60"
      }`}>
        {/* Summary Header */}
        <div className="grid grid-cols-2 gap-3 mb-2.5">
          {/* Latency Summary */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className={isBlueprint ? "text-slate-600 font-medium" : "text-zinc-400"}>延迟</span>
              {node.is_online && avgLatency !== null && (
                <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-sans font-medium border", latencyQuality.badge)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", latencyQuality.dot)} />
                  <span>{latencyQuality.label}</span>
                </span>
              )}
            </div>
            <span className={cn("font-bold font-mono", latencyQuality.color)}>
              {node.is_online && avgLatency !== null ? `${avgLatency.toFixed(0)} ms` : "--"}
            </span>
          </div>

          {/* Packet Loss Summary */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className={isBlueprint ? "text-slate-600 font-medium" : "text-zinc-400"}>丢包</span>
              {node.is_online && (avgLoss === 0 || avgLoss === null) && (
                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-sans font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  零丢包
                </span>
              )}
              {node.is_online && avgLoss !== null && avgLoss > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-sans font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse">
                  丢包中
                </span>
              )}
            </div>
            <span className={`font-bold font-mono ${
              avgLoss !== null && avgLoss > 0
                ? "text-rose-500 dark:text-rose-400"
                : isBlueprint ? "text-slate-900" : "text-zinc-100"
            }`}>
              {node.is_online && avgLoss !== null ? `${avgLoss.toFixed(1)}%` : "--"}
            </span>
          </div>
        </div>

        {/* Dedicated Target Rows with Segmented Bar Chart */}
        <div className="space-y-1.5">
          {pings.length === 0 ? (
            <div className={cn("text-[11px] py-2 text-center rounded-lg border border-dashed font-sans", isBlueprint ? "border-slate-200 text-slate-400 bg-slate-50/50" : "border-zinc-800/80 text-zinc-500 bg-zinc-950/20")}>
              暂未配置监测目标
            </div>
          ) : (
            displayedPings.map((p, idx) => {
              const isOnline = node.is_online && p.latency_ms > 0;
              const hasLoss = node.is_online && p.packet_loss > 0;
              const latVal = isOnline ? (p.latency_ms < 10 ? `${p.latency_ms.toFixed(1)} ms` : `${p.latency_ms.toFixed(0)} ms`) : "--";

              let baseColor = "bg-emerald-500 hover:bg-emerald-400";
              let latColor = "text-emerald-600 dark:text-emerald-400";
              let grade = "极速 (优)";

              if (!isOnline) {
                baseColor = isBlueprint ? "bg-slate-200" : "bg-zinc-800";
                latColor = "text-zinc-500";
                grade = !node.is_online ? "节点离线" : "无响应";
              } else if (p.latency_ms >= 260) {
                baseColor = "bg-rose-500 hover:bg-rose-400";
                latColor = "text-rose-500 dark:text-rose-400";
                grade = "拥堵 (高延迟)";
              } else if (p.latency_ms >= 180) {
                baseColor = "bg-amber-400 hover:bg-amber-300";
                latColor = "text-amber-500 dark:text-amber-400";
                grade = "稍慢 (跨洋)";
              } else if (p.latency_ms >= 100) {
                baseColor = "bg-sky-400 hover:bg-sky-300";
                latColor = "text-sky-600 dark:text-sky-400";
                grade = "良好 (可)";
              } else if (p.latency_ms >= 50) {
                baseColor = "bg-teal-400 hover:bg-teal-300";
                latColor = "text-teal-600 dark:text-teal-400";
                grade = "平稳 (良)";
              }

              const TOTAL_SEGMENTS = 10;
              const lossBlocks = hasLoss
                ? Math.min(TOTAL_SEGMENTS, Math.max(1, Math.round((p.packet_loss / 100) * TOTAL_SEGMENTS)))
                : 0;

              const segments = Array.from({ length: TOTAL_SEGMENTS }).map((_, sIdx) => {
                if (!isOnline) {
                  return {
                    color: isBlueprint ? "bg-slate-200" : "bg-zinc-800",
                    grade: !node.is_online ? "节点离线" : "无响应",
                  };
                }
                if (hasLoss && sIdx >= TOTAL_SEGMENTS - lossBlocks) {
                  return {
                    color: "bg-rose-500 hover:bg-rose-400 animate-pulse",
                    grade: `丢包 ${p.packet_loss.toFixed(1)}%`,
                  };
                }
                return {
                  color: baseColor,
                  grade,
                };
              });

              return (
                <div
                  key={p.target || idx}
                  className={cn(
                    "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-all",
                    isBlueprint
                      ? "bg-slate-50/70 hover:bg-slate-100/80 border-slate-200/80 text-slate-800 shadow-2xs"
                      : "bg-zinc-950/50 hover:bg-zinc-900/60 border-zinc-800/60 text-zinc-200"
                  )}
                >
                  {/* Target Identity */}
                  <div className="flex items-center gap-1.5 min-w-[65px] max-w-[85px] sm:max-w-[105px] shrink-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0 shadow-xs"
                      style={{
                        backgroundColor: !node.is_online
                          ? "#71717a"
                          : hasLoss
                          ? "#f43f5e"
                          : (p.color || (isOnline ? "#10b981" : "#71717a")),
                      }}
                    />
                    <span className="truncate font-sans font-medium text-xs text-slate-800 dark:text-zinc-200" title={p.label}>
                      {p.label}
                    </span>
                  </div>

                  {/* Segmented Bar Chart */}
                  <div className="flex-1 flex items-center gap-1 py-0.5 px-1 min-w-0">
                    {segments.map((seg, sIdx) => (
                      <div
                        key={sIdx}
                        className={cn(
                          "flex-1 h-2.5 rounded-[2px] cursor-pointer transition-all duration-150 ease-out origin-bottom hover:scale-y-[1.6] hover:brightness-125",
                          seg.color
                        )}
                        title={`${p.label}: ${latVal} (${seg.grade}) · ${hasLoss ? `丢包 ${p.packet_loss.toFixed(1)}%` : "0%丢包"}${p.jitter > 0 ? ` · 抖动 ${p.jitter.toFixed(1)}ms` : ""}`}
                      />
                    ))}
                  </div>

                  {/* Latency & Loss Pills */}
                  <div className="flex items-center gap-1.5 shrink-0 text-right font-mono">
                    <span className={cn("font-bold text-xs min-w-[46px] text-right", latColor)}>
                      {latVal}
                    </span>

                    <span
                      className={cn(
                        "text-[10px] font-mono px-1.5 py-0.2 rounded border min-w-[42px] text-center shrink-0 font-medium",
                        !node.is_online || p.latency_ms <= 0
                          ? "bg-zinc-500/10 border-zinc-500/20 text-zinc-500"
                          : hasLoss
                          ? "bg-rose-500/15 border-rose-500/30 text-rose-500 font-bold animate-pulse"
                          : isBlueprint
                          ? "bg-emerald-50 border-emerald-200/80 text-emerald-700"
                          : "bg-emerald-950/30 border-emerald-500/25 text-emerald-400"
                      )}
                    >
                      {node.is_online && p.latency_ms > 0
                        ? hasLoss
                          ? `失${p.packet_loss.toFixed(0)}%`
                          : "0%丢包"
                        : "--"}
                    </span>
                  </div>
                </div>
              );
            })
          )}

          {pings.length > 4 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedPings(!expandedPings);
              }}
              className={cn(
                "w-full text-center py-1 text-[11px] font-sans font-medium rounded-md border transition-all cursor-pointer active:scale-98",
                isBlueprint
                  ? "text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 border-indigo-200/60"
                  : "text-indigo-400 bg-indigo-950/20 hover:bg-indigo-950/40 border-indigo-800/40"
              )}
            >
              {expandedPings ? "收起监测目标 ▴" : `展开其余 ${pings.length - 4} 个监测目标 ▾`}
            </button>
          )}
        </div>
      </div>

      {/* 6. Bottom Tags with Vibrant Colors */}
      {displayTags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-1">
          {displayTags.map((tag) => (
            <span
              key={tag}
              className={`px-2 py-0.5 rounded text-10 font-sans font-medium border transition-all ${getTagStyle(
                tag,
                isBlueprint
              )}`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

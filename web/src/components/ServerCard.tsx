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
} from "lucide-react";
import { NodeState } from "../types";
import { formatBytes, formatRate } from "../utils/format";
import { getRegionFlag } from "../utils/flags";
import { getTagStyle } from "../utils/tagColors";
import { OsIcon } from "./OsIcon";
import { cn } from "../lib/utils";
import { NumberTicker } from "./ui/NumberTicker";
import { BorderBeam } from "./ui/BorderBeam";

interface ServerCardProps {
  node: NodeState;
  onSelect: (node: NodeState) => void;
  theme?: "blueprint" | "dark";
}

type TickTone = "good" | "fair" | "moderate" | "poor" | "warn" | "lost" | "muted";

interface Tick {
  tone: TickTone;
  label: string;
  valueStr: string;
  gradeStr: string;
}

// Tooltip value color. Both bars read from the same map so a "--" reading never
// renders in the alarm color.
const tickTextColor = (tone: TickTone) => {
  switch (tone) {
    case "muted": return "text-zinc-400";
    case "fair": return "text-teal-300";
    case "moderate":
    case "warn": return "text-amber-300";
    case "poor":
    case "lost": return "text-rose-400";
    default: return "text-emerald-400";
  }
};

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

export function ServerCard({ node, onSelect, theme = "dark" }: ServerCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);
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
    ? `${node.billing.currency || "$"}${node.billing.price != null && node.billing.price > 0 ? node.billing.price : (node.billing.price_per_month || 9.9)} / ${getCycleLabel(node.billing.billing_cycle)}`
    : "$9.9 / 月";

  // Dynamic status tags
  const displayTags = node.tags && node.tags.length > 0
    ? node.tags
    : ["电信CN2", "1Gbps", "CU4837"];

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

  const latencyTicks = useMemo<Tick[]>(() => {
    if (!node.is_online) {
      return pings.map((p) => ({
        tone: "muted",
        label: p.label,
        valueStr: "--",
        gradeStr: "节点失联",
      }));
    }
    return pings.map((p) => {
      if (p.latency_ms <= 0) {
        return {
          tone: "muted",
          label: p.label,
          valueStr: "--",
          gradeStr: "无响应",
        };
      }
      let tone: TickTone = "good";
      let grade = "极速 (优秀)";
      if (p.latency_ms >= 230) {
        tone = "poor";
        grade = "高延迟 (告警)";
      } else if (p.latency_ms >= 130) {
        tone = "moderate";
        grade = "稍慢 (跨洋)";
      } else if (p.latency_ms >= 60) {
        tone = "fair";
        grade = "平稳 (良好)";
      }
      return {
        tone,
        label: p.label,
        valueStr: `${p.latency_ms.toFixed(1)} ms`,
        gradeStr: grade,
      };
    });
  }, [node.is_online, pings]);

  const lossTicks = useMemo<Tick[]>(() => {
    if (!node.is_online) {
      return pings.map((p) => ({
        tone: "muted",
        label: p.label,
        valueStr: "--",
        gradeStr: "节点失联",
      }));
    }
    return pings.map((p) => {
      if (p.latency_ms <= 0) {
        return {
          tone: "muted",
          label: p.label,
          valueStr: "--",
          gradeStr: "无响应",
        };
      }
      let tone: TickTone = "good";
      let grade = "零丢包 · 线路通畅";
      if (p.packet_loss > 10) {
        tone = "lost";
        grade = "严重丢包";
      } else if (p.packet_loss > 0) {
        tone = "warn";
        grade = "偶发轻度丢包";
      }
      return {
        tone,
        label: p.label,
        valueStr: `${p.packet_loss.toFixed(1)}%`,
        gradeStr: grade,
      };
    });
  }, [node.is_online, pings]);

  const [hoveredTick, setHoveredTick] = useState<{
    type: "latency" | "loss";
    tick: Tick;
    xPercent: number;
  } | null>(null);

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

      {/* 2. Sub-header Badges: Uptime & Pricing */}
      <div className="mt-2.5 flex items-center gap-2">
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

      {/* 5. Latency & Packet Loss Segmented Bars (Matching User's Red Box & Image 2) */}
      <div className={`mt-3.5 pt-3 border-t grid grid-cols-2 gap-3 font-mono text-xs ${
        isBlueprint ? "border-slate-100" : "border-zinc-800/60"
      }`}>
        {/* Latency */}
        <div className="relative group/latency" onMouseLeave={() => setHoveredTick((prev) => prev?.type === "latency" ? null : prev)}>
          {/* Floating Tooltip for Latency */}
          {hoveredTick?.type === "latency" && (
            <div
              className="absolute -top-9 z-30 pointer-events-none transform -translate-x-1/2 transition-all duration-75 animate-in fade-in zoom-in-95"
              style={{ left: `${Math.min(92, Math.max(8, hoveredTick.xPercent))}%` }}
            >
              <div className={`px-2 py-0.5 rounded-md text-11 font-sans font-medium whitespace-nowrap shadow-xl border flex items-center gap-1.5 backdrop-blur-md ${
                isBlueprint
                  ? "bg-slate-900/95 text-white border-slate-700 shadow-slate-900/25"
                  : "bg-zinc-900/95 text-zinc-100 border-zinc-700 shadow-black/80"
              }`}>
                <span className="text-zinc-400 text-10">{hoveredTick.tick.label}</span>
                <span className={cn("font-mono font-bold", tickTextColor(hoveredTick.tick.tone))}>
                  {hoveredTick.tick.valueStr}
                </span>
                <span className="text-10 text-zinc-300 font-normal">({hoveredTick.tick.gradeStr})</span>
              </div>
              <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900 dark:border-t-zinc-900 mx-auto" />
            </div>
          )}

          <div className="flex items-center justify-between mb-1.5">
            <span className={isBlueprint ? "text-slate-600 font-medium" : "text-zinc-400"}>延迟</span>
            <span className={`font-bold ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
              {node.is_online && avgLatency !== null ? `${avgLatency.toFixed(0)} ms` : "--"}
            </span>
          </div>
          <div className="flex items-center gap-1 py-1">
            {latencyTicks.length === 0 && (
              <div className={cn("flex-1 h-3 rounded-[2px]", isBlueprint ? "bg-slate-200" : "bg-zinc-800")} />
            )}
            {latencyTicks.map((tick, idx) => {
              let bg = "bg-emerald-500 hover:bg-emerald-400";
              if (tick.tone === "fair") bg = "bg-teal-400 hover:bg-teal-300";
              else if (tick.tone === "moderate") bg = "bg-amber-400 hover:bg-amber-300";
              else if (tick.tone === "poor") bg = "bg-rose-500 hover:bg-rose-400";
              else if (tick.tone === "muted") bg = isBlueprint ? "bg-slate-200" : "bg-zinc-800";
              return (
                <div
                  key={idx}
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    setHoveredTick({
                      type: "latency",
                      tick,
                      xPercent: ((idx + 0.5) / latencyTicks.length) * 100,
                    });
                  }}
                  className={`flex-1 h-3 rounded-[2px] cursor-pointer transition-all duration-150 ease-out origin-bottom hover:scale-y-[1.65] hover:scale-x-125 hover:brightness-125 hover:shadow-md ${bg}`}
                  title={`${tick.label}: ${tick.valueStr} (${tick.gradeStr})`}
                />
              );
            })}
          </div>
        </div>

        {/* Packet Loss */}
        <div className="relative group/loss" onMouseLeave={() => setHoveredTick((prev) => prev?.type === "loss" ? null : prev)}>
          {/* Floating Tooltip for Loss */}
          {hoveredTick?.type === "loss" && (
            <div
              className="absolute -top-9 z-30 pointer-events-none transform -translate-x-1/2 transition-all duration-75 animate-in fade-in zoom-in-95"
              style={{ left: `${Math.min(92, Math.max(8, hoveredTick.xPercent))}%` }}
            >
              <div className={`px-2 py-0.5 rounded-md text-11 font-sans font-medium whitespace-nowrap shadow-xl border flex items-center gap-1.5 backdrop-blur-md ${
                isBlueprint
                  ? "bg-slate-900/95 text-white border-slate-700 shadow-slate-900/25"
                  : "bg-zinc-900/95 text-zinc-100 border-zinc-700 shadow-black/80"
              }`}>
                <span className="text-zinc-400 text-10">{hoveredTick.tick.label}</span>
                <span className={cn("font-mono font-bold", tickTextColor(hoveredTick.tick.tone))}>
                  {hoveredTick.tick.valueStr}
                </span>
                <span className="text-10 text-zinc-300 font-normal">({hoveredTick.tick.gradeStr})</span>
              </div>
              <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900 dark:border-t-zinc-900 mx-auto" />
            </div>
          )}

          <div className="flex items-center justify-between mb-1.5">
            <span className={isBlueprint ? "text-slate-600 font-medium" : "text-zinc-400"}>丢包</span>
            <span className={`font-bold ${
              avgLoss !== null && avgLoss > 0
                ? "text-rose-500 dark:text-rose-400"
                : isBlueprint ? "text-slate-900" : "text-zinc-100"
            }`}>
              {node.is_online && avgLoss !== null ? `${avgLoss.toFixed(1)}%` : "--"}
            </span>
          </div>
          <div className="flex items-center gap-1 py-1">
            {lossTicks.length === 0 && (
              <div className={cn("flex-1 h-3 rounded-[2px]", isBlueprint ? "bg-slate-200" : "bg-zinc-800")} />
            )}
            {lossTicks.map((tick, idx) => {
              let bg = "bg-emerald-500 hover:bg-emerald-400";
              if (tick.tone === "warn") bg = "bg-amber-400 hover:bg-amber-300";
              else if (tick.tone === "lost") bg = "bg-rose-500 hover:bg-rose-400";
              else if (tick.tone === "muted") bg = isBlueprint ? "bg-slate-200" : "bg-zinc-800";
              return (
                <div
                  key={idx}
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    setHoveredTick({
                      type: "loss",
                      tick,
                      xPercent: ((idx + 0.5) / lossTicks.length) * 100,
                    });
                  }}
                  className={`flex-1 h-3 rounded-[2px] cursor-pointer transition-all duration-150 ease-out origin-bottom hover:scale-y-[1.65] hover:scale-x-125 hover:brightness-125 hover:shadow-md ${bg}`}
                  title={`${tick.label}: ${tick.valueStr} (${tick.gradeStr})`}
                />
              );
            })}
          </div>
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

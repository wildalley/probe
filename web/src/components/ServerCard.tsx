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

interface ServerCardProps {
  node: NodeState;
  onSelect: (node: NodeState) => void;
  theme?: "blueprint" | "dark";
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

  // Average Latency and Packet Loss
  const pings = node.pings && node.pings.length > 0 ? node.pings : [];
  const avgLatency = pings.length > 0
    ? pings.reduce((sum, p) => sum + p.latency_ms, 0) / pings.length
    : (node.is_online ? 49 : 0);
  const avgLoss = pings.length > 0
    ? pings.reduce((sum, p) => sum + p.packet_loss, 0) / pings.length
    : (node.is_online ? 0 : 100);

  // 14 Latency Ticks
  const latencyTicks = useMemo(() => {
    const totalTicks = 14;
    return Array.from({ length: totalTicks }, (_, i) => {
      if (!node.is_online) return "offline";
      const pingIdx = i % (pings.length || 1);
      const pingItem = pings[pingIdx];
      const lat = pingItem ? pingItem.latency_ms : avgLatency;
      if (lat < 60) return "good";
      if (lat < 130) return "fair";
      if (lat < 230) return "moderate";
      return "poor";
    });
  }, [node.is_online, pings, avgLatency]);

  // 14 Loss Ticks
  const lossTicks = useMemo(() => {
    const totalTicks = 14;
    const lossCount = Math.min(totalTicks, Math.ceil((avgLoss / 100) * totalTicks));
    return Array.from({ length: totalTicks }, (_, i) => {
      if (!node.is_online) return "offline";
      if (avgLoss > 0 && i >= totalTicks - lossCount) {
        return avgLoss > 10 ? "lost" : "warn";
      }
      return "good";
    });
  }, [node.is_online, avgLoss]);

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
            className={`truncate font-bold font-mono text-sm sm:text-base tracking-tight ${
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
            className={`h-7 w-7 rounded-lg flex items-center justify-center border transition-all ${
              isStarred
                ? isBlueprint
                  ? "bg-amber-50 border-amber-300 text-amber-500 shadow-sm"
                  : "bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-sm"
                : isBlueprint
                ? "bg-slate-50 border-slate-200 text-slate-400 hover:text-amber-500 hover:border-slate-300"
                : "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-zinc-700"
            }`}
            title={isStarred ? "取消星标" : "加入星标"}
          >
            <Star
              className={`h-3.5 w-3.5 ${
                isStarred ? "fill-amber-400 text-amber-400" : ""
              }`}
            />
          </button>

          {/* 2. OS Icon Badge */}
          <div
            className={`h-7 w-7 rounded-lg flex items-center justify-center border ${
              isBlueprint
                ? "bg-slate-50 border-slate-200 text-slate-600"
                : "bg-zinc-900/80 border-zinc-800 text-zinc-300"
            }`}
            title={`${node.system.os || "Linux"} (${node.system.kernel || ""})`}
          >
            <OsIcon os={node.system.os} className="h-3.5 w-3.5" />
          </div>

          {/* 3. Region Flag Badge */}
          <div
            className={`h-7 px-2 rounded-lg flex items-center justify-center gap-1 border text-xs font-mono font-bold ${
              isBlueprint
                ? "bg-slate-50 border-slate-200 text-slate-700"
                : "bg-zinc-900/80 border-zinc-800 text-zinc-200"
            }`}
            title={node.region}
          >
            <span className="text-sm leading-none">{getRegionFlag(node.region)}</span>
            <span className={`text-[10px] uppercase font-bold ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
              {node.region || "DEF"}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Sub-header Badges: Uptime & Pricing */}
      <div className="mt-2.5 flex items-center gap-2">
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-mono font-medium border flex items-center gap-1 ${
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
          className={`rounded-md px-2 py-0.5 text-[11px] font-mono font-medium border ${
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
              {node.cpu.toFixed(1)}%
            </span>
          </div>
          <div className={`text-[10px] truncate ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
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
              {node.mem.toFixed(1)}%
            </span>
          </div>
          <div className={`text-[10px] truncate ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
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
              {node.disk.toFixed(1)}%
            </span>
          </div>
          <div className={`text-[10px] truncate ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
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
              {quotaBytes > 0 ? `${quotaPercent.toFixed(1)}%` : "0%"}
            </span>
          </div>
          <div className={`text-[10px] truncate ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
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
              {node.billing?.remaining_days != null ? `剩 ${node.billing.remaining_days}天` : "剩 27天"}
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-700 dark:text-zinc-300 font-medium truncate mt-0.5">
            <Coins className="h-3 w-3 text-cyan-500 shrink-0" />
            <span className="truncate">
              {node.billing?.currency || "$"}{(node.billing?.remaining_value != null ? node.billing.remaining_value : 8.91).toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Latency & Packet Loss Segmented Bars (Matching User's Red Box & Image 2) */}
      <div className={`mt-3.5 pt-3 border-t grid grid-cols-2 gap-3 font-mono text-xs ${
        isBlueprint ? "border-slate-100" : "border-zinc-800/60"
      }`}>
        {/* Latency */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className={isBlueprint ? "text-slate-600 font-medium" : "text-zinc-400"}>延迟</span>
            <span className={`font-bold ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
              {node.is_online ? `${avgLatency.toFixed(0)} ms` : "--"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {latencyTicks.map((status, idx) => {
              let bg = "bg-emerald-500";
              if (status === "fair") bg = "bg-teal-400";
              else if (status === "moderate") bg = "bg-amber-400";
              else if (status === "poor") bg = "bg-rose-500";
              else if (status === "offline") bg = isBlueprint ? "bg-slate-200" : "bg-zinc-800";
              return (
                <div
                  key={idx}
                  className={`flex-1 h-3 rounded-[2px] transition-all ${bg}`}
                  title={node.is_online ? `延迟监测: ${avgLatency.toFixed(0)}ms` : "离线"}
                />
              );
            })}
          </div>
        </div>

        {/* Packet Loss */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className={isBlueprint ? "text-slate-600 font-medium" : "text-zinc-400"}>丢包</span>
            <span className={`font-bold ${
              avgLoss > 0
                ? "text-rose-500 dark:text-rose-400"
                : isBlueprint ? "text-slate-900" : "text-zinc-100"
            }`}>
              {node.is_online ? `${avgLoss.toFixed(1)}%` : "--"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {lossTicks.map((status, idx) => {
              let bg = "bg-emerald-500";
              if (status === "warn") bg = "bg-amber-400";
              else if (status === "lost") bg = "bg-rose-500";
              else if (status === "offline") bg = isBlueprint ? "bg-slate-200" : "bg-zinc-800";
              return (
                <div
                  key={idx}
                  className={`flex-1 h-3 rounded-[2px] transition-all ${bg}`}
                  title={node.is_online ? `丢包监测: ${avgLoss.toFixed(1)}%` : "离线"}
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
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border transition-all ${getTagStyle(
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

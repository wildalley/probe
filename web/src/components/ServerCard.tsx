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
import { usedTrafficSplit } from "../utils/traffic";
import { OsIcon } from "./OsIcon";
import { AgentVersionMark } from "./AgentVersionMark";
import { PingTracker } from "./PingTracker";
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

  // 已用流量由服务端算好（校准基线 + 锚定后累计），前端不再自行拼实时值。
  const usedTraffic = node.billing?.bandwidth_used || 0;
  // 0 = 未设置额度，走「无限制」分支，不再编造 2TB 默认值。
  const quotaBytes = node.billing?.bandwidth_quota || 0;
  const quotaPercent = quotaBytes > 0 ? Math.min(100, (usedTraffic / quotaBytes) * 100) : 0;
  // 方向明细同样由服务端给出（up + down 恒等于 usedTraffic）；旧服务端不下发
  // 这两个字段，此时为 null，只显示总量。
  const usedSplit = usedTrafficSplit(node.billing);

  // Pricing label
  const priceText = node.billing
    ? `${node.billing.currency || "$"}${node.billing.price != null && node.billing.price > 0 ? node.billing.price : (node.billing.price_per_month || 0)} / ${getCycleLabel(node.billing.billing_cycle)}`
    : null;

  // Dynamic status tags (only real tags configured on the host)
  const displayTags = node.tags && node.tags.length > 0 ? node.tags : [];

  // One tick per probe target — the agent reports a single current value per
  // target, so there is no time series here to draw.
  const pings = node.pings && node.pings.length > 0 ? node.pings : [];

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
          <div className={`text-10 flex items-center gap-1.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
            <span className="truncate">
              {formatBytes(usedTraffic)} / {quotaBytes > 0 ? formatBytes(quotaBytes) : "无限制"}
            </span>
            {usedSplit && (
              <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono">
                <span className="flex items-center gap-0.5 text-indigo-500">
                  <ArrowUp className="h-2.5 w-2.5 shrink-0" />
                  {formatBytes(usedSplit.up)}
                </span>
                <span className="flex items-center gap-0.5 text-cyan-500">
                  <ArrowDown className="h-2.5 w-2.5 shrink-0" />
                  {formatBytes(usedSplit.down)}
                </span>
              </span>
            )}
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
              {node.billing?.remaining_days && node.billing.remaining_days > 0
                ? `剩 ${node.billing.remaining_days}天`
                : node.billing?.auto_renewal
                  ? "自动续费"
                  : "未设到期"}
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-700 dark:text-zinc-300 font-medium truncate mt-0.5">
            <Coins className="h-3 w-3 text-cyan-500 shrink-0" />
            <span className="truncate">
              {node.billing?.remaining_value_native && node.billing.remaining_value_native > 0
                ? `${node.billing.currency || "$"}${node.billing.remaining_value_native.toFixed(2)}`
                : "--"}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Latency & Packet Loss Section (PingTracker 40-slot uptime bar) */}
      <div className={`mt-3.5 pt-3 border-t ${
        isBlueprint ? "border-slate-100" : "border-zinc-800/60"
      }`}>
        {pings.length === 0 ? (
          <div className={cn(
            "text-[11px] py-2 text-center rounded-lg border border-dashed font-sans",
            isBlueprint ? "border-slate-200 text-slate-400 bg-slate-50/50" : "border-zinc-800/80 text-zinc-500 bg-zinc-950/20"
          )}>
            暂未配置监测目标
          </div>
        ) : (
          <div className="space-y-2">
            {displayedPings.map((p, idx) => (
              <PingTracker
                key={p.target || idx}
                ping={p}
                nodeIsOnline={node.is_online}
                isBlueprint={isBlueprint}
                nodeId={node.node_id}
              />
            ))}

            {pings.length > 4 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedPings(!expandedPings);
                }}
                className={cn(
                  "w-full py-1 text-center text-[11px] font-sans font-medium rounded-md transition-colors cursor-pointer mt-1",
                  isBlueprint
                    ? "text-indigo-600 hover:bg-indigo-50/80"
                    : "text-indigo-400 hover:text-indigo-300 hover:bg-white/[0.04]"
                )}
              >
                {expandedPings ? "收起监测目标 ▴" : `展开其余 ${pings.length - 4} 个监测目标 ▾`}
              </button>
            )}
          </div>
        )}
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

import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Activity, Clock, Server, Star } from "lucide-react";
import { NodeState } from "../types";
import { formatBytes, splitRate, getSemanticColor } from "../utils/format";
import { getRegionFlag } from "../utils/flags";
import { OsIcon } from "./OsIcon";
import { cn } from "../lib/utils";
import { NumberTicker } from "./ui/NumberTicker";

interface ServerTableProps {
  nodes: NodeState[];
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

/**
 * Throughput cell. `formatRate` rescales as traffic grows, so only the scaled
 * number is animated and the unit is rendered separately — otherwise the ticker
 * would race across a magnitude jump (1023 KB/s -> 1 MB/s).
 */
const RateCell: React.FC<{ bytesPerSec: number; className?: string }> = ({ bytesPerSec, className }) => {
  const { value, unit } = splitRate(bytesPerSec);
  return (
    <span className={cn("inline-flex items-baseline gap-1 font-medium", className)}>
      <NumberTicker value={value} decimals={1} />
      <span className="text-10 opacity-70">{unit}</span>
    </span>
  );
};

/** Percentage + bar cell, shared by the CPU / RAM / DISK columns. */
const MetricCell: React.FC<{ percent: number; isBlueprint: boolean }> = ({ percent, isBlueprint }) => {
  const colors = getSemanticColor(percent);
  return (
    <div className="flex items-center gap-2">
      <NumberTicker
        value={percent}
        decimals={1}
        suffix="%"
        className={cn("w-12 font-semibold", colors.text)}
      />
      <div className={cn("h-1.5 w-16 overflow-hidden rounded-full", isBlueprint ? "bg-slate-200" : "bg-zinc-800")}>
        <div
          className={cn("h-full rounded-full transition-all duration-500", colors.bar)}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
};

export const ServerTable: React.FC<ServerTableProps> = ({ nodes, onSelect, theme = "dark" }) => {
  const isBlueprint = theme === "blueprint";
  const [, setStarTrigger] = useState(0);

  const toggleStar = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    try {
      const current = localStorage.getItem(`starred_${nodeId}`) === "true";
      localStorage.setItem(`starred_${nodeId}`, String(!current));
      setStarTrigger((prev) => prev + 1);
    } catch {}
  };

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border transition-colors",
        isBlueprint
          ? "border-slate-200/90 bg-white shadow-sm"
          : "border-zinc-800 bg-zinc-900/60 backdrop-blur-md"
      )}
    >
      {/* DaisyUI table gives us the zebra/hover baseline; colors stay themed by hand. */}
      <table className="table table-sm w-full text-left font-mono text-xs">
        <thead
          className={cn(
            "border-b text-xs",
            isBlueprint
              ? "border-slate-200 bg-slate-50/90 font-semibold text-slate-700"
              : "border-zinc-800 bg-zinc-950/60 text-zinc-400"
          )}
        >
          <tr>
            <th className="px-4 py-3">STATUS</th>
            <th className="px-4 py-3">NODE / REGION</th>
            <th className="px-4 py-3">OS / KERNEL</th>
            <th className="px-4 py-3">PRICING</th>
            <th className="px-4 py-3">CPU</th>
            <th className="px-4 py-3">RAM</th>
            <th className="px-4 py-3">DISK</th>
            <th className="px-4 py-3">DOWN / UP RATE</th>
            <th className="px-4 py-3">TOTAL TRANSFER</th>
            <th className="px-4 py-3">TCP</th>
            <th className="px-4 py-3">UPTIME</th>
          </tr>
        </thead>
        <tbody className={cn("divide-y", isBlueprint ? "divide-slate-100" : "divide-zinc-800/60")}>
          {nodes.map((node, idx) => {
            let isStarred = false;
            try {
              isStarred = localStorage.getItem(`starred_${node.node_id}`) === "true";
            } catch {}

            return (
              <motion.tr
                key={node.node_id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                // Cap the stagger so a long rack does not crawl in for seconds.
                transition={{ delay: Math.min(idx * 0.03, 0.3), duration: 0.3, ease: "easeOut" }}
                onClick={() => onSelect(node)}
                className={cn(
                  "cursor-pointer transition-colors",
                  isBlueprint ? "hover:bg-slate-50/80" : "hover:bg-zinc-800/40"
                )}
              >
                {/* Status Beacon & Star */}
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => toggleStar(e, node.node_id)}
                      className={cn(
                        "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border transition-all active:scale-90",
                        isStarred
                          ? isBlueprint
                            ? "border-amber-300 bg-amber-50 text-amber-500 shadow-sm"
                            : "border-amber-500/30 bg-amber-500/15 text-amber-400 shadow-sm"
                          : isBlueprint
                          ? "border-slate-200 bg-slate-100/70 text-slate-300 hover:border-slate-300 hover:text-amber-500"
                          : "border-zinc-700/50 bg-zinc-800/50 text-zinc-500 hover:border-zinc-600 hover:text-amber-400"
                      )}
                      title={isStarred ? "取消星标" : "加入星标"}
                    >
                      <Star className={cn("h-3 w-3", isStarred && "fill-amber-400 text-amber-400")} />
                    </button>
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        node.is_online
                          ? "animate-pulse bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                          : "bg-rose-500"
                      )}
                    />
                    <span className={cn("font-semibold", node.is_online ? "text-emerald-500" : "text-rose-500")}>
                      {node.is_online ? "ONLINE" : "OFFLINE"}
                    </span>
                  </div>
                </td>

                {/* Node Name & Region with Flag */}
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Server className={cn("h-3.5 w-3.5", isBlueprint ? "text-slate-400" : "text-zinc-400")} />
                    <span className={cn("font-semibold", isBlueprint ? "text-slate-900" : "text-zinc-200")}>
                      {node.name}
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-1 rounded border px-1.5 py-0.5 text-10",
                        isBlueprint
                          ? "border-slate-200 bg-slate-100 text-slate-600"
                          : "border-zinc-700/40 bg-zinc-800 text-zinc-400"
                      )}
                    >
                      <span>{getRegionFlag(node.region)}</span>
                      <span>{node.region || "DEF"}</span>
                    </span>
                  </div>
                </td>

                {/* OS with Icon */}
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-1.5" title={`${node.system.os} ${node.system.kernel}`}>
                    <OsIcon os={node.system.os} className="h-4 w-4 shrink-0" />
                    <span
                      className={cn(
                        "inline-block max-w-[140px] truncate",
                        isBlueprint ? "text-slate-600" : "text-zinc-400"
                      )}
                    >
                      {node.system.os || "Linux"}
                    </span>
                  </div>
                </td>

                {/* Pricing / Cycle */}
                <td className="whitespace-nowrap px-4 py-3">
                  {node.billing ? (
                    <div className="flex flex-col">
                      <span className={cn("font-semibold", isBlueprint ? "text-indigo-600" : "text-indigo-400")}>
                        {node.billing.currency || "$"}
                        {node.billing.price != null && node.billing.price > 0
                          ? node.billing.price
                          : node.billing.price_per_month || 9.9}
                        /{getCycleLabel(node.billing.billing_cycle)}
                      </span>
                      <span className={cn("text-10", isBlueprint ? "text-slate-400" : "text-zinc-500")}>
                        {node.billing.remaining_days != null ? `剩 ${node.billing.remaining_days} 天` : ""}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400">--</span>
                  )}
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <MetricCell percent={node.cpu} isBlueprint={isBlueprint} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <MetricCell percent={node.mem} isBlueprint={isBlueprint} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <MetricCell percent={node.disk} isBlueprint={isBlueprint} />
                </td>

                {/* Ingress / Egress Rates with Icons */}
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1 text-cyan-500">
                      <ArrowDown className="h-3 w-3 shrink-0" />
                      <RateCell bytesPerSec={node.rate_down} />
                    </div>
                    <div className="flex items-center gap-1 text-indigo-500">
                      <ArrowUp className="h-3 w-3 shrink-0" />
                      <RateCell bytesPerSec={node.rate_up} />
                    </div>
                  </div>
                </td>

                {/* Cumulative Rx / Tx / Quota */}
                <td className={cn("whitespace-nowrap px-4 py-3", isBlueprint ? "text-slate-700" : "text-zinc-300")}>
                  <div className="flex items-center gap-1 text-11">
                    <ArrowDown className="h-3 w-3 shrink-0 text-cyan-500" />
                    <span>{formatBytes(node.network.bytes_recv)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-11">
                    <ArrowUp className="h-3 w-3 shrink-0 text-indigo-500" />
                    <span>{formatBytes(node.network.bytes_sent)}</span>
                  </div>
                  {node.billing?.bandwidth_quota ? (
                    <div
                      className={cn(
                        "mt-1 text-10 font-semibold",
                        isBlueprint ? "text-blue-600" : "text-blue-400"
                      )}
                    >
                      配额: {formatBytes(node.billing.bandwidth_quota)}
                    </div>
                  ) : null}
                </td>

                {/* TCP */}
                <td
                  className={cn(
                    "whitespace-nowrap px-4 py-3",
                    isBlueprint ? "font-semibold text-slate-800" : "text-zinc-200"
                  )}
                >
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3 text-emerald-500" />
                    <span>{node.network.tcp_established || 0}</span>
                  </div>
                </td>

                {/* Uptime */}
                <td className={cn("whitespace-nowrap px-4 py-3", isBlueprint ? "text-slate-600" : "text-zinc-400")}>
                  <div className="flex items-center gap-1">
                    <Clock className={cn("h-3 w-3", isBlueprint ? "text-slate-500" : "text-zinc-400")} />
                    <span>{node.uptime_str || "0m"}</span>
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

import React from "react";
import { ArrowDown, ArrowUp, Activity, Clock, Server } from "lucide-react";
import { NodeState } from "../types";
import { formatBytes, formatRate, getSemanticColor } from "../utils/format";
import { getRegionFlag } from "../utils/flags";
import { OsIcon } from "./OsIcon";

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

export const ServerTable: React.FC<ServerTableProps> = ({ nodes, onSelect, theme = "dark" }) => {
  const isBlueprint = theme === "blueprint";

  return (
    <div className={`overflow-x-auto rounded-xl border transition-colors ${
      isBlueprint ? "border-slate-200/90 bg-white shadow-sm" : "border-zinc-800 bg-zinc-900/60 backdrop-blur-md"
    }`}>
      <table className="w-full text-left text-xs font-mono">
        <thead className={`border-b ${
          isBlueprint ? "border-slate-200 bg-slate-50/90 text-slate-700 font-semibold" : "border-zinc-800 bg-zinc-950/60 text-zinc-400"
        }`}>
          <tr>
            <th className="py-3 px-4">STATUS</th>
            <th className="py-3 px-4">NODE / REGION</th>
            <th className="py-3 px-4">OS / KERNEL</th>
            <th className="py-3 px-4">PRICING</th>
            <th className="py-3 px-4">CPU</th>
            <th className="py-3 px-4">RAM</th>
            <th className="py-3 px-4">DISK</th>
            <th className="py-3 px-4">DOWN / UP RATE</th>
            <th className="py-3 px-4">TOTAL TRANSFER</th>
            <th className="py-3 px-4">TCP</th>
            <th className="py-3 px-4">UPTIME</th>
          </tr>
        </thead>
        <tbody className={`divide-y ${isBlueprint ? "divide-slate-100" : "divide-zinc-800/60"}`}>
          {nodes.map((node) => {
            const cpuColors = getSemanticColor(node.cpu);
            const memColors = getSemanticColor(node.mem);
            const diskColors = getSemanticColor(node.disk);

            return (
              <tr
                key={node.node_id}
                onClick={() => onSelect(node)}
                className={`cursor-pointer transition-colors ${
                  isBlueprint ? "hover:bg-slate-50/80" : "hover:bg-zinc-800/40"
                }`}
              >
                {/* Status Beacon */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        node.is_online
                          ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                          : "bg-rose-500"
                      }`}
                    />
                    <span className={node.is_online ? "text-emerald-500 font-semibold" : "text-rose-500 font-semibold"}>
                      {node.is_online ? "ONLINE" : "OFFLINE"}
                    </span>
                  </div>
                </td>

                {/* Node Name & Region with Flag */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Server className={`h-3.5 w-3.5 ${isBlueprint ? "text-slate-400" : "text-zinc-400"}`} />
                    <span className={`font-semibold ${isBlueprint ? "text-slate-900" : "text-zinc-200"}`}>{node.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] border flex items-center gap-1 ${
                      isBlueprint ? "bg-slate-100 border-slate-200 text-slate-600" : "bg-zinc-800 border-zinc-700/40 text-zinc-400"
                    }`}>
                      <span>{getRegionFlag(node.region)}</span>
                      <span>{node.region || "DEF"}</span>
                    </span>
                  </div>
                </td>

                {/* OS with Icon */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5" title={`${node.system.os} ${node.system.kernel}`}>
                    <OsIcon os={node.system.os} className="h-4 w-4 shrink-0" />
                    <span className={`truncate max-w-[140px] inline-block ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
                      {node.system.os || "Linux"}
                    </span>
                  </div>
                </td>

                {/* Pricing / Cycle */}
                <td className="py-3 px-4 whitespace-nowrap">
                  {node.billing ? (
                    <div className="flex flex-col">
                      <span className={`font-semibold ${isBlueprint ? "text-indigo-600" : "text-indigo-400"}`}>
                        {node.billing.currency || "$"}{node.billing.price != null && node.billing.price > 0 ? node.billing.price : (node.billing.price_per_month || 9.9)}/{getCycleLabel(node.billing.billing_cycle)}
                      </span>
                      <span className={`text-[10px] ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                        {node.billing.remaining_days != null ? `剩 ${node.billing.remaining_days} 天` : ""}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400">--</span>
                  )}
                </td>

                {/* CPU */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className={`w-12 font-semibold ${cpuColors.text}`}>
                      {node.cpu.toFixed(1)}%
                    </span>
                    <div className={`w-16 h-1.5 rounded-full overflow-hidden ${isBlueprint ? "bg-slate-200" : "bg-zinc-800"}`}>
                      <div
                        className={`h-full ${cpuColors.bar}`}
                        style={{ width: `${Math.min(100, node.cpu)}%` }}
                      />
                    </div>
                  </div>
                </td>

                {/* RAM */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className={`w-12 font-semibold ${memColors.text}`}>
                      {node.mem.toFixed(1)}%
                    </span>
                    <div className={`w-16 h-1.5 rounded-full overflow-hidden ${isBlueprint ? "bg-slate-200" : "bg-zinc-800"}`}>
                      <div
                        className={`h-full ${memColors.bar}`}
                        style={{ width: `${Math.min(100, node.mem)}%` }}
                      />
                    </div>
                  </div>
                </td>

                {/* DISK */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className={`w-12 font-semibold ${diskColors.text}`}>
                      {node.disk.toFixed(1)}%
                    </span>
                    <div className={`w-16 h-1.5 rounded-full overflow-hidden ${isBlueprint ? "bg-slate-200" : "bg-zinc-800"}`}>
                      <div
                        className={`h-full ${diskColors.bar}`}
                        style={{ width: `${Math.min(100, node.disk)}%` }}
                      />
                    </div>
                  </div>
                </td>

                {/* Ingress / Egress Rates with Icons */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1 text-cyan-500 font-medium">
                      <ArrowDown className="h-3 w-3 shrink-0" />
                      <span>{formatRate(node.rate_down)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-indigo-500 font-medium">
                      <ArrowUp className="h-3 w-3 shrink-0" />
                      <span>{formatRate(node.rate_up)}</span>
                    </div>
                  </div>
                </td>

                {/* Cumulative Rx / Tx / Quota */}
                <td className={`py-3 px-4 whitespace-nowrap ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                  <div className="flex items-center gap-1 text-[11px]">
                    <ArrowDown className="h-3 w-3 text-cyan-500 shrink-0" />
                    <span>{formatBytes(node.network.bytes_recv)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] mt-0.5">
                    <ArrowUp className="h-3 w-3 text-indigo-500 shrink-0" />
                    <span>{formatBytes(node.network.bytes_sent)}</span>
                  </div>
                  {node.billing?.bandwidth_quota ? (
                    <div className={`text-[10px] mt-1 font-semibold ${isBlueprint ? "text-blue-600" : "text-blue-400"}`}>
                      配额: {formatBytes(node.billing.bandwidth_quota)}
                    </div>
                  ) : null}
                </td>

                {/* TCP */}
                <td className={`py-3 px-4 whitespace-nowrap ${isBlueprint ? "text-slate-800 font-semibold" : "text-zinc-200"}`}>
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3 text-emerald-500" />
                    <span>{node.network.tcp_established || 0}</span>
                  </div>
                </td>

                {/* Uptime */}
                <td className={`py-3 px-4 whitespace-nowrap ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
                  <div className="flex items-center gap-1">
                    <Clock className={`h-3 w-3 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`} />
                    <span>{node.uptime_str || "0m"}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

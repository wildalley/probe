import React from "react";
import { ThemeNode } from "../types";
import { formatBytes, formatSpeed, formatUptime, getUsageColor, maskIp } from "../utils";
import { ArrowDown, ArrowUp, Activity, Cpu, HardDrive, MemoryStick, Clock, ShieldCheck, Globe, Wifi } from "lucide-react";

interface NodeCardProps {
  node: ThemeNode;
  onClick?: () => void;
  compact?: boolean;
  className?: string;
}

export const NodeCard: React.FC<NodeCardProps> = ({ node, onClick, compact = false, className = "" }) => {
  const cpuColor = getUsageColor(node.cpu);
  const memColor = getUsageColor(node.mem);
  const diskColor = getUsageColor(node.disk);

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border transition-all duration-200 cursor-pointer ${
        node.is_online
          ? "border-white/10 bg-slate-900/80 hover:border-cyan-500/40 hover:bg-slate-800/90 shadow-lg hover:shadow-cyan-500/10"
          : "border-rose-900/30 bg-slate-950/60 opacity-70 hover:opacity-100 hover:border-rose-500/40"
      } ${className}`}
    >
      {/* Top cyber accent line */}
      <div
        className={`absolute top-0 left-0 right-0 h-[2px] transition-colors ${
          node.is_online ? "bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent" : "bg-rose-500/40"
        }`}
      />

      <div className="p-4 space-y-3">
        {/* Header: Status LED, Name, OS, Latency */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {node.is_online && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  node.is_online ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
            </span>
            <span className="font-semibold text-sm text-slate-100 truncate group-hover:text-cyan-300 transition-colors">
              {node.name}
            </span>
            {node.provider && (
              <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                {node.provider}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 text-xs">
            {node.is_online && node.latency !== undefined && (
              <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40">
                <Wifi className="w-3 h-3" />
                {node.latency}ms
              </span>
            )}
            <span className="text-[11px] font-mono text-slate-400">
              {maskIp(node.public_ip)}
            </span>
          </div>
        </div>

        {/* Tags if available */}
        {node.tags && node.tags.length > 0 && !compact && (
          <div className="flex flex-wrap gap-1">
            {node.tags.slice(0, 3).map((tag, idx) => (
              <span
                key={idx}
                className="text-[10px] px-1.5 py-0.2 rounded-sm bg-slate-800/80 text-cyan-400/90 border border-cyan-900/30 font-mono"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Meters: CPU & RAM */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* CPU */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400 flex items-center gap-1">
                <Cpu className="w-3 h-3 text-slate-500" /> CPU
              </span>
              <span className={`font-mono font-medium ${cpuColor.text}`}>
                {node.is_online ? `${node.cpu.toFixed(1)}%` : "0%"}
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${cpuColor.bar}`}
                style={{ width: `${node.is_online ? Math.min(100, node.cpu) : 0}%` }}
              />
            </div>
          </div>

          {/* Memory */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400 flex items-center gap-1">
                <MemoryStick className="w-3 h-3 text-slate-500" /> RAM
              </span>
              <span className={`font-mono font-medium ${memColor.text}`}>
                {node.is_online ? `${node.mem.toFixed(1)}%` : "0%"}
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${memColor.bar}`}
                style={{ width: `${node.is_online ? Math.min(100, node.mem) : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Disk Meter (if not compact) */}
        {!compact && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400 flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-slate-500" /> DISK
              </span>
              <span className="font-mono text-slate-300 text-[11px]">
                {formatBytes(node.disk_used, 0)} / {formatBytes(node.disk_total, 0)} ({node.disk.toFixed(0)}%)
              </span>
            </div>
            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${diskColor.bar}`}
                style={{ width: `${Math.min(100, node.disk)}%` }}
              />
            </div>
          </div>
        )}

        {/* Real-time Network Throughput */}
        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-slate-800/80">
          <div className="flex items-center gap-1 text-cyan-400">
            <ArrowDown className="w-3 h-3 text-cyan-500" />
            <span>{node.is_online ? formatSpeed(node.rate_down) : "0 B/s"}</span>
          </div>
          <div className="flex items-center gap-1 text-blue-400">
            <ArrowUp className="w-3 h-3 text-blue-500" />
            <span>{node.is_online ? formatSpeed(node.rate_up) : "0 B/s"}</span>
          </div>
        </div>

        {/* Footer: Uptime */}
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {node.is_online ? formatUptime(node.uptime) : "已离线"}
          </span>
          <span className="text-slate-400 group-hover:text-cyan-400 transition-colors">
            点击查看详情 →
          </span>
        </div>
      </div>
    </div>
  );
};

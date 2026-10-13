import React from "react";
import { ThemeNode } from "../types";
import { formatBytes, formatSpeed, formatUptime, getUsageColor, maskIp } from "../utils";
import {
  X,
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
  ArrowDown,
  ArrowUp,
  Clock,
  Globe,
  Terminal,
  Copy,
  Check,
  CreditCard,
  Wifi,
  Server,
} from "lucide-react";

interface NodeDetailModalProps {
  node: ThemeNode | null;
  onClose: () => void;
  canManage?: boolean;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({ node, onClose, canManage }) => {
  const [copied, setCopied] = React.useState(false);

  if (!node) return null;

  const cpuColor = getUsageColor(node.cpu);
  const memColor = getUsageColor(node.mem);
  const diskColor = getUsageColor(node.disk);

  const handleCopyIp = () => {
    if (node.public_ip) {
      navigator.clipboard.writeText(node.public_ip);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-cyan-500/30 bg-slate-900/95 p-6 shadow-2xl text-slate-100 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              {node.is_online && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${
                  node.is_online ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-100">{node.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-cyan-400 font-mono border border-slate-700">
                  {node.region}
                </span>
                {node.provider && (
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
                    {node.provider}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Node ID: {node.id} · 运行时间: {formatUptime(node.uptime)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Gauges Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* CPU Card */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
              <span className="flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" /> CPU 使用率
              </span>
              <span className={`font-mono font-bold text-sm ${cpuColor.text}`}>
                {node.is_online ? `${node.cpu.toFixed(1)}%` : "0%"}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full ${cpuColor.bar} transition-all duration-300`}
                style={{ width: `${node.is_online ? Math.min(100, node.cpu) : 0}%` }}
              />
            </div>
            <div className="text-[11px] font-mono text-slate-400 flex justify-between">
              <span>{node.cpu_cores || 1} 核心</span>
              <span>
                负载: {node.load_1?.toFixed(2) || "0.00"}, {node.load_5?.toFixed(2) || "0.00"}
              </span>
            </div>
          </div>

          {/* RAM Card */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
              <span className="flex items-center gap-1">
                <MemoryStick className="w-3.5 h-3.5 text-blue-400" /> 内存占用
              </span>
              <span className={`font-mono font-bold text-sm ${memColor.text}`}>
                {node.is_online ? `${node.mem.toFixed(1)}%` : "0%"}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full ${memColor.bar} transition-all duration-300`}
                style={{ width: `${node.is_online ? Math.min(100, node.mem) : 0}%` }}
              />
            </div>
            <div className="text-[11px] font-mono text-slate-400 flex justify-between">
              <span>{formatBytes(node.mem_used)}</span>
              <span>/ {formatBytes(node.mem_total)}</span>
            </div>
          </div>

          {/* Disk Card */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
              <span className="flex items-center gap-1">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" /> 磁盘空间
              </span>
              <span className={`font-mono font-bold text-sm ${diskColor.text}`}>
                {node.disk.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full ${diskColor.bar} transition-all duration-300`}
                style={{ width: `${Math.min(100, node.disk)}%` }}
              />
            </div>
            <div className="text-[11px] font-mono text-slate-400 flex justify-between">
              <span>{formatBytes(node.disk_used)}</span>
              <span>/ {formatBytes(node.disk_total)}</span>
            </div>
          </div>
        </div>

        {/* Network & Traffic Section */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
            <span className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-cyan-400" /> 网络流量与实时吞吐
            </span>
            {node.tcp_conn !== undefined && (
              <span className="text-[11px] font-mono text-slate-400 font-normal">
                TCP 连接数: {node.tcp_conn}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                <ArrowDown className="w-3 h-3 text-cyan-400" /> 下行实时速率
              </div>
              <div className="text-sm font-mono font-bold text-cyan-300 mt-1">
                {formatSpeed(node.rate_down)}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                <ArrowUp className="w-3 h-3 text-blue-400" /> 上行实时速率
              </div>
              <div className="text-sm font-mono font-bold text-blue-300 mt-1">
                {formatSpeed(node.rate_up)}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-[10px] text-slate-400">总下行流量</div>
              <div className="text-sm font-mono font-bold text-slate-200 mt-1">
                {formatBytes(node.traffic_down)}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-[10px] text-slate-400">总上行流量</div>
              <div className="text-sm font-mono font-bold text-slate-200 mt-1">
                {formatBytes(node.traffic_up)}
              </div>
            </div>
          </div>
        </div>

        {/* Hardware & System Specifications */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
          <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Server className="w-4 h-4 text-cyan-400" /> 硬件与系统信息
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
            <div className="flex justify-between p-2 rounded bg-slate-900/80">
              <span className="text-slate-400">操作系统</span>
              <span className="text-slate-200 truncate ml-2">{node.os || "Linux"}</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-slate-900/80">
              <span className="text-slate-400">系统内核</span>
              <span className="text-slate-200 truncate ml-2">{node.kernel || "Unknown"}</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-slate-900/80">
              <span className="text-slate-400">CPU 型号</span>
              <span className="text-slate-200 truncate ml-2">{node.cpu_model || "Generic"}</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-slate-900/80">
              <span className="text-slate-400">公网 IP</span>
              <div className="flex items-center gap-1.5">
                <span className="text-cyan-400">{maskIp(node.public_ip)}</span>
                <button
                  onClick={handleCopyIp}
                  title="复制 IP"
                  className="text-slate-400 hover:text-slate-200"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Network Ping Targets (if available) */}
        {node.pings && node.pings.length > 0 && (
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Wifi className="w-4 h-4 text-emerald-400" /> 网络探测指标
            </h4>
            <div className="space-y-1.5">
              {node.pings.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded bg-slate-900/80 text-xs font-mono"
                >
                  <span className="text-slate-300">{p.label} ({p.target})</span>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400">{p.latency_ms.toFixed(1)} ms</span>
                    <span className={p.packet_loss > 0 ? "text-rose-400" : "text-slate-500"}>
                      丢包: {p.packet_loss}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Billing Info (if available) */}
        {node.billing && (
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-400" />
              <span className="text-slate-300">
                价格: {node.billing.price} {node.billing.currency || "USD"} / {node.billing.billing_cycle || "月"}
              </span>
            </div>
            {node.billing.remaining_days !== undefined && (
              <span className="text-amber-400 font-semibold">
                剩余 {node.billing.remaining_days} 天到期
              </span>
            )}
          </div>
        )}

        {/* Action Footers */}
        <div className="flex items-center justify-between pt-2">
          {canManage && (
            <a
              href="/admin"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 border border-cyan-500/40 text-xs font-mono transition-colors"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>进入管理后台</span>
            </a>
          )}
          <button
            onClick={onClose}
            className="ml-auto px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
          >
            关闭窗口
          </button>
        </div>
      </div>
    </div>
  );
};

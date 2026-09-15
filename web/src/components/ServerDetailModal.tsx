import React, { useEffect, useState } from "react";
import {
  X,
  Server,
  Trash2,
  Activity,
  Cpu,
  HardDrive,
  Clock,
  Layers,
  Zap,
} from "lucide-react";
import { HistoryPoint, NodeState } from "../types";
import { formatBytes, formatRate } from "../utils/format";
import { TimeSeriesChart, ChartSeries } from "./TimeSeriesChart";

interface ServerDetailModalProps {
  node: NodeState | null;
  onClose: () => void;
  onDelete: (nodeID: string) => void;
}

export const ServerDetailModal: React.FC<ServerDetailModalProps> = ({
  node,
  onClose,
  onDelete,
}) => {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [timeRange, setTimeRange] = useState<"1h" | "6h" | "24h" | "7d">("1h");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!node) return;

    setLoading(true);
    fetch(`/api/v1/nodes/${encodeURIComponent(node.node_id)}/history?range=${timeRange}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.points) {
          setHistory(data.points);
        }
      })
      .catch((err) => console.error("Failed to load history:", err))
      .finally(() => setLoading(false));
  }, [node?.node_id, timeRange]);

  if (!node) return null;

  // Prepare chart data
  const timestamps = history.map((p) => p.timestamp);
  const cpuValues = history.map((p) => p.cpu_percent);
  const memValues = history.map((p) => p.mem_percent ?? 0);
  const rateDownValues = history.map((p) => p.rate_download);
  const rateUpValues = history.map((p) => p.rate_upload);

  const resourceSeries: ChartSeries[] = [
    {
      label: "CPU",
      values: cpuValues,
      color: "#6366f1",
      fill: "rgba(99, 102, 241, 0.1)",
      unit: "%",
      format: (v) => `${v.toFixed(1)}%`,
    },
    {
      label: "RAM",
      values: memValues,
      color: "#06b6d4",
      fill: "rgba(6, 182, 212, 0.1)",
      unit: "%",
      format: (v) => `${v.toFixed(1)}%`,
    },
  ];

  const networkSeries: ChartSeries[] = [
    {
      label: "Download",
      values: rateDownValues,
      color: "#10b981",
      fill: "rgba(16, 185, 129, 0.1)",
      format: (v) => formatRate(v),
    },
    {
      label: "Upload",
      values: rateUpValues,
      color: "#8b5cf6",
      fill: "rgba(139, 92, 246, 0.1)",
      format: (v) => formatRate(v),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-2xl backdrop-blur-xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-zinc-800/80 border border-zinc-700/50">
              <Server className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-zinc-100">{node.name}</h3>
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-400 border border-zinc-700/40">
                  {node.region || "DEF"}
                </span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    node.is_online
                      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                      : "bg-rose-500"
                  }`}
                />
              </div>
              <p className="text-xs font-mono text-zinc-500">ID: {node.node_id}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (confirm(`Are you sure you want to delete node ${node.name}?`)) {
                  onDelete(node.node_id);
                  onClose();
                }
              }}
              className="p-2 rounded-lg border border-zinc-800 hover:border-rose-900/60 hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 transition-colors"
              title="Delete node"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Hardware & Telemetry Grid */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/70">
            <div className="text-zinc-500 mb-1 flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-indigo-400" />
              <span>CPU SPECS</span>
            </div>
            <div className="text-zinc-200 font-semibold truncate">
              {node.system.cpu_count || 1} Cores · {node.cpu.toFixed(1)}%
            </div>
            <div className="text-11 text-zinc-400 mt-1">
              Load: {node.system.load_1 || 0}, {node.system.load_5 || 0}, {node.system.load_15 || 0}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/70">
            <div className="text-zinc-500 mb-1 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-cyan-400" />
              <span>MEMORY</span>
            </div>
            <div className="text-zinc-200 font-semibold truncate">
              {formatBytes(node.system.mem_used)} / {formatBytes(node.system.mem_total)}
            </div>
            <div className="text-11 text-zinc-400 mt-1">
              Usage: {node.mem.toFixed(1)}%
            </div>
          </div>

          <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/70">
            <div className="text-zinc-500 mb-1 flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5 text-amber-400" />
              <span>DISK</span>
            </div>
            <div className="text-zinc-200 font-semibold truncate">
              {node.system.disk_used ? formatBytes(node.system.disk_used) : "--"} / {node.system.disk_total ? formatBytes(node.system.disk_total) : "--"}
            </div>
            <div className="text-11 text-zinc-400 mt-1">
              Usage: {node.disk.toFixed(1)}%
            </div>
          </div>

          <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/70">
            <div className="text-zinc-500 mb-1 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <span>SYSTEM</span>
            </div>
            <div className="text-zinc-200 font-semibold truncate" title={node.system.os}>
              {node.system.os || "Linux"}
            </div>
            <div className="text-11 text-zinc-400 mt-1 truncate">
              Uptime: {node.uptime_str}
            </div>
          </div>
        </div>

        {/* Time-Series Charts Header & Range Buttons */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-indigo-400" />
            <h4 className="text-sm font-semibold text-zinc-200 font-mono">
              HISTORICAL TELEMETRY (uPlot 10ms Engine)
            </h4>
          </div>

          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs font-mono">
            {(["1h", "6h", "24h", "7d"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  timeRange === r
                    ? "bg-indigo-600 text-white font-semibold"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Charts Container */}
        <div className="mt-4 space-y-4">
          {timestamps.length > 0 ? (
            <>
              <TimeSeriesChart
                title="CPU & MEMORY UTILIZATION (%)"
                timestamps={timestamps}
                seriesList={resourceSeries}
                height={160}
              />
              <TimeSeriesChart
                title="NETWORK INGRESS / EGRESS BANDWIDTH (Rate)"
                timestamps={timestamps}
                seriesList={networkSeries}
                height={160}
              />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-xs font-mono text-zinc-500">
              {loading ? "Loading historical time series..." : "Accumulating downsampled historical data points... (flushed every 15 seconds)"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

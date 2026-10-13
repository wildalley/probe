import React, { useState } from "react";
import { ThemeNode } from "../../types";
import { formatSpeed, getUsageColor, maskIp } from "../../utils";
import { ArrowDown, ArrowUp, Cpu, MemoryStick, Wifi, Server } from "lucide-react";

interface RingLayoutProps {
  nodes: ThemeNode[];
  regionFlag: string;
  regionName: string;
  onSelectNode: (node: ThemeNode) => void;
}

export const RingLayout: React.FC<RingLayoutProps> = ({
  nodes,
  regionFlag,
  regionName,
  onSelectNode,
}) => {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // If there's only 1 node, simple circular card
  if (nodes.length <= 1) {
    const node = nodes[0];
    if (!node) return null;
    return (
      <div className="flex justify-center py-4">
        <div
          onClick={() => onSelectNode(node)}
          className="cursor-pointer p-4 rounded-2xl border border-cyan-500/30 bg-slate-900/80 hover:bg-slate-800 flex items-center gap-4 transition-all"
        >
          <div className="text-2xl">{regionFlag}</div>
          <div>
            <div className="font-semibold text-sm text-slate-100">{node.name}</div>
            <div className="text-xs font-mono text-cyan-400">
              CPU {node.cpu.toFixed(0)}% · RAM {node.mem.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate orbital dimensions
  const total = nodes.length;
  // Size adaptivity: radius based on node count
  const radius = Math.min(240, Math.max(140, 110 + total * 14));
  const containerSize = radius * 2 + 160;

  // Aggregate regional stats
  const totalDown = nodes.reduce((acc, n) => acc + (n.is_online ? n.rate_down : 0), 0);
  const totalUp = nodes.reduce((acc, n) => acc + (n.is_online ? n.rate_up : 0), 0);
  const onlineCount = nodes.filter((n) => n.is_online).length;

  return (
    <div className="relative w-full flex flex-col items-center justify-center py-6 overflow-x-auto">
      <div
        className="relative shrink-0 flex items-center justify-center"
        style={{ width: `${containerSize}px`, height: `${containerSize}px` }}
      >
        {/* Orbital Background Rings & Connecting Lines (SVG) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${containerSize} ${containerSize}`}
        >
          {/* Outer dashed orbit */}
          <circle
            cx={containerSize / 2}
            cy={containerSize / 2}
            r={radius}
            fill="none"
            stroke="rgba(6, 182, 212, 0.2)"
            strokeWidth="1.5"
            strokeDasharray="4 6"
          />

          {/* Inner pulse orbit */}
          <circle
            cx={containerSize / 2}
            cy={containerSize / 2}
            r={radius * 0.55}
            fill="none"
            stroke="rgba(59, 130, 246, 0.15)"
            strokeWidth="1"
          />

          {/* Connecting Ray Lines to each node */}
          {nodes.map((node, idx) => {
            const angle = (idx / total) * 2 * Math.PI - Math.PI / 2;
            const x = containerSize / 2 + radius * Math.cos(angle);
            const y = containerSize / 2 + radius * Math.sin(angle);
            const isHovered = hoveredNodeId === node.id;

            return (
              <line
                key={`line-${node.id}`}
                x1={containerSize / 2}
                y1={containerSize / 2}
                x2={x}
                y2={y}
                stroke={
                  isHovered
                    ? "rgba(6, 182, 212, 0.8)"
                    : node.is_online
                    ? "rgba(51, 65, 85, 0.5)"
                    : "rgba(244, 63, 94, 0.3)"
                }
                strokeWidth={isHovered ? 2 : 1}
                strokeDasharray={isHovered ? "none" : "2 3"}
                className="transition-all duration-200"
              />
            );
          })}
        </svg>

        {/* Central Regional Hub Core */}
        <div
          className="relative z-10 w-28 h-28 rounded-full border border-cyan-500/40 bg-slate-900/90 shadow-[0_0_30px_rgba(6,182,212,0.15)] flex flex-col items-center justify-center p-2 text-center backdrop-blur-sm"
        >
          <div className="text-2xl filter drop-shadow select-none">{regionFlag}</div>
          <div className="font-semibold text-xs text-slate-100 truncate max-w-[90px] mt-0.5">
            {regionName.split(" ")[0]}
          </div>
          <div className="text-[10px] font-mono text-cyan-400 mt-0.5">
            {onlineCount}/{total} 在线
          </div>
          <div className="flex items-center gap-1 text-[9px] font-mono text-slate-400 mt-0.5">
            <span className="text-cyan-400">↓{formatSpeed(totalDown)}</span>
          </div>
        </div>

        {/* Nodes Satellite Pods placed along the Orbit */}
        {nodes.map((node, idx) => {
          const angle = (idx / total) * 2 * Math.PI - Math.PI / 2;
          const x = containerSize / 2 + radius * Math.cos(angle);
          const y = containerSize / 2 + radius * Math.sin(angle);
          const isHovered = hoveredNodeId === node.id;
          const cpuColor = getUsageColor(node.cpu);
          const memColor = getUsageColor(node.mem);

          return (
            <div
              key={node.id}
              onClick={() => onSelectNode(node)}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
              style={{
                left: `${x}px`,
                top: `${y}px`,
                transform: `translate(-50%, -50%) scale(${isHovered ? 1.08 : 1})`,
              }}
              className={`absolute z-20 cursor-pointer transition-all duration-200 group rounded-xl border px-3 py-2 ${
                node.is_online
                  ? isHovered
                    ? "border-cyan-400 bg-slate-800 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                    : "border-slate-700/80 bg-slate-900/90 hover:border-cyan-500/50"
                  : "border-rose-900/50 bg-slate-950/90 opacity-75"
              }`}
            >
              {/* Satellite Node Pill */}
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2 shrink-0">
                  {node.is_online && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      node.is_online ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                </span>
                <span className="font-semibold text-xs text-slate-200 truncate max-w-[100px] group-hover:text-cyan-300">
                  {node.name}
                </span>
              </div>

              {/* Quick Gauges */}
              <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono">
                <span className={cpuColor.text}>CPU {node.is_online ? `${node.cpu.toFixed(0)}%` : "-"}</span>
                <span className="text-slate-600">|</span>
                <span className={memColor.text}>RAM {node.is_online ? `${node.mem.toFixed(0)}%` : "-"}</span>
                {node.latency !== undefined && (
                  <>
                    <span className="text-slate-600">|</span>
                    <span className="text-emerald-400">{node.latency}ms</span>
                  </>
                )}
              </div>

              {/* Speed ticker */}
              <div className="flex items-center gap-2 mt-1 text-[9px] font-mono text-slate-400">
                <span className="text-cyan-400 flex items-center">
                  <ArrowDown className="w-2.5 h-2.5" />
                  {formatSpeed(node.rate_down)}
                </span>
                <span className="text-blue-400 flex items-center">
                  <ArrowUp className="w-2.5 h-2.5" />
                  {formatSpeed(node.rate_up)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

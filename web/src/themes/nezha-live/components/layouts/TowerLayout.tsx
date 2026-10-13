import React, { useState } from "react";
import { ThemeNode } from "../../types";
import { formatSpeed, formatBytes, formatUptime, getUsageColor, maskIp } from "../../utils";
import { Cpu, MemoryStick, ArrowDown, ArrowUp, Wifi, ChevronDown, ChevronUp, Server, Layers } from "lucide-react";

interface TowerLayoutProps {
  nodes: ThemeNode[];
  onSelectNode: (node: ThemeNode) => void;
}

export const TowerLayout: React.FC<TowerLayoutProps> = ({ nodes, onSelectNode }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // If there's only 1 node in the region, render directly without stacking
  if (nodes.length <= 1) {
    const node = nodes[0];
    if (!node) return null;
    return (
      <div className="py-1">
        <TowerBlade
          node={node}
          index={0}
          total={1}
          isExpanded={true}
          isHovered={false}
          onClick={() => onSelectNode(node)}
        />
      </div>
    );
  }

  return (
    <div className="relative py-2">
      {/* Rack Tower Header Controls */}
      <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
        <div className="flex items-center gap-1.5 font-mono">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>叠层塔机架 ({nodes.length} 单元)</span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 border border-slate-700/60 font-mono transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>叠层收拢</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>展开全塔</span>
            </>
          )}
        </button>
      </div>

      {/* The 3D Server Rack Tower Blade Container */}
      <div
        className={`relative transition-all duration-300 ease-out ${
          isExpanded ? "space-y-2.5" : "pb-4"
        }`}
        style={{
          minHeight: isExpanded ? "auto" : `${Math.min(380, 70 + (nodes.length - 1) * 44)}px`,
        }}
      >
        {nodes.map((node, idx) => {
          const isHovered = hoveredIdx === idx;
          // In collapsed mode, cards stack vertically with offset and z-index
          const collapsedStyle: React.CSSProperties = !isExpanded
            ? {
                position: "absolute",
                top: `${idx * 42}px`,
                left: 0,
                right: 0,
                zIndex: isHovered ? 50 : 20 - idx,
                transform: isHovered ? "translateY(-6px) scale(1.01)" : "translateY(0) scale(1)",
                boxShadow: isHovered
                  ? "0 12px 24px -4px rgba(6, 182, 212, 0.25)"
                  : "0 4px 12px -2px rgba(0, 0, 0, 0.5)",
              }
            : {};

          return (
            <div
              key={node.id}
              style={collapsedStyle}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="transition-all duration-200"
            >
              <TowerBlade
                node={node}
                index={idx}
                total={nodes.length}
                isExpanded={isExpanded}
                isHovered={isHovered}
                onClick={() => onSelectNode(node)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface TowerBladeProps {
  node: ThemeNode;
  index: number;
  total: number;
  isExpanded: boolean;
  isHovered: boolean;
  onClick: () => void;
}

const TowerBlade: React.FC<TowerBladeProps> = ({
  node,
  index,
  total,
  isExpanded,
  isHovered,
  onClick,
}) => {
  const cpuColor = getUsageColor(node.cpu);
  const memColor = getUsageColor(node.mem);

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-lg border cursor-pointer transition-all duration-200 overflow-hidden ${
        node.is_online
          ? isHovered || isExpanded
            ? "border-cyan-500/50 bg-slate-900/95 shadow-md"
            : "border-slate-700/60 bg-slate-900/90"
          : "border-rose-900/40 bg-slate-950/80 opacity-75"
      }`}
    >
      {/* Server Rack ear mounting screw on left */}
      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex flex-col gap-1 text-[8px] font-mono text-slate-600 select-none">
        <span className="w-1.5 h-1.5 rounded-full border border-slate-600 bg-slate-800" />
        <span className="w-1.5 h-1.5 rounded-full border border-slate-600 bg-slate-800" />
      </div>

      <div className="pl-6 pr-4 py-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Unit ID + LED + Hostname */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[10px] font-mono text-cyan-400/80 bg-slate-800 px-1 py-0.5 rounded border border-slate-700">
              U{total - index}
            </span>

            {/* LED Status Indicator */}
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

            <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate group-hover:text-cyan-300 transition-colors">
              {node.name}
            </span>

            {node.provider && (
              <span className="hidden md:inline-block text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                {node.provider}
              </span>
            )}
          </div>

          {/* Metrics Row: CPU, MEM, Rates, Latency */}
          <div className="flex items-center gap-3 sm:gap-4 text-xs font-mono shrink-0">
            {/* CPU Gauge */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <Cpu className="w-3 h-3 text-slate-500" /> CPU
              </span>
              <div className="w-12 sm:w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${cpuColor.bar}`}
                  style={{ width: `${node.is_online ? Math.min(100, node.cpu) : 0}%` }}
                />
              </div>
              <span className={`text-[11px] font-medium w-8 text-right ${cpuColor.text}`}>
                {node.is_online ? `${node.cpu.toFixed(0)}%` : "0%"}
              </span>
            </div>

            {/* RAM Gauge */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <MemoryStick className="w-3 h-3 text-slate-500" /> RAM
              </span>
              <div className="w-12 sm:w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${memColor.bar}`}
                  style={{ width: `${node.is_online ? Math.min(100, node.mem) : 0}%` }}
                />
              </div>
              <span className={`text-[11px] font-medium w-8 text-right ${memColor.text}`}>
                {node.is_online ? `${node.mem.toFixed(0)}%` : "0%"}
              </span>
            </div>

            {/* Network RX/TX */}
            <div className="hidden lg:flex items-center gap-2">
              <span className="text-cyan-400 flex items-center gap-0.5 text-[11px]">
                <ArrowDown className="w-3 h-3 text-cyan-500" />
                {node.is_online ? formatSpeed(node.rate_down) : "0 B/s"}
              </span>
              <span className="text-blue-400 flex items-center gap-0.5 text-[11px]">
                <ArrowUp className="w-3 h-3 text-blue-500" />
                {node.is_online ? formatSpeed(node.rate_up) : "0 B/s"}
              </span>
            </div>

            {/* Ping */}
            {node.latency !== undefined && (
              <span className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-400">
                <Wifi className="w-3 h-3" />
                {node.latency}ms
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

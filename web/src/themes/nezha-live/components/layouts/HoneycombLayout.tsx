import React, { useState } from "react";
import { ThemeNode } from "../../types";
import { formatSpeed, getUsageColor, maskIp } from "../../utils";
import { Cpu, MemoryStick, Wifi, ArrowDown } from "lucide-react";

interface HoneycombLayoutProps {
  nodes: ThemeNode[];
  onSelectNode: (node: ThemeNode) => void;
}

export const HoneycombLayout: React.FC<HoneycombLayoutProps> = ({ nodes, onSelectNode }) => {
  const [hoveredNode, setHoveredNode] = useState<ThemeNode | null>(null);

  return (
    <div className="relative py-4">
      {/* Honeycomb Grid Container */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-3 p-2">
        {nodes.map((node, idx) => {
          const cpuColor = getUsageColor(node.cpu);
          const memColor = getUsageColor(node.mem);

          return (
            <div
              key={node.id}
              onClick={() => onSelectNode(node)}
              onMouseEnter={() => setHoveredNode(node)}
              onMouseLeave={() => setHoveredNode(null)}
              className="group relative cursor-pointer transition-all duration-200 select-none"
            >
              {/* Outer Hexagon with Border Glow */}
              <div
                className={`relative w-[130px] h-[145px] transition-all duration-200 flex flex-col items-center justify-center p-2.5 text-center ${
                  node.is_online
                    ? "bg-slate-900/90 group-hover:bg-slate-800/95 group-hover:scale-105"
                    : "bg-slate-950/80 opacity-70 group-hover:opacity-100"
                }`}
                style={{
                  clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                }}
              >
                {/* Hexagon Border SVG overlay */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 130 145"
                >
                  <polygon
                    points="65,2 128,36.25 128,108.75 65,143 2,108.75 2,36.25"
                    fill="none"
                    stroke={
                      node.is_online
                        ? "rgba(6, 182, 212, 0.4)"
                        : "rgba(244, 63, 94, 0.4)"
                    }
                    strokeWidth="2"
                    className="group-hover:stroke-cyan-400 transition-colors"
                  />
                </svg>

                {/* Hex Content */}
                <div className="relative z-10 flex flex-col items-center justify-center space-y-1 w-full px-1">
                  {/* Status beacon dot */}
                  <div className="flex items-center gap-1">
                    <span className="relative flex h-2 w-2">
                      {node.is_online && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      )}
                      <span
                        className={`relative inline-flex rounded-full h-2 w-2 ${
                          node.is_online ? "bg-emerald-500" : "bg-rose-500"
                        }`}
                      />
                    </span>
                    {node.latency !== undefined && node.is_online && (
                      <span className="text-[9px] font-mono text-emerald-400">
                        {node.latency}ms
                      </span>
                    )}
                  </div>

                  {/* Name */}
                  <div className="font-semibold text-xs text-slate-100 truncate w-full px-1 group-hover:text-cyan-300">
                    {node.name}
                  </div>

                  {/* CPU / RAM Mini Indicators */}
                  <div className="flex items-center justify-center gap-1.5 text-[10px] font-mono">
                    <span className={cpuColor.text}>C:{node.is_online ? `${node.cpu.toFixed(0)}%` : "-"}</span>
                    <span className="text-slate-600">/</span>
                    <span className={memColor.text}>M:{node.is_online ? `${node.mem.toFixed(0)}%` : "-"}</span>
                  </div>

                  {/* Network Rate */}
                  <div className="text-[9px] font-mono text-cyan-400/90 flex items-center gap-0.5">
                    <ArrowDown className="w-2.5 h-2.5" />
                    <span>{node.is_online ? formatSpeed(node.rate_down) : "0 B/s"}</span>
                  </div>
                </div>
              </div>

              {/* Quick Hover Tooltip Badge */}
              {hoveredNode?.id === node.id && (
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap px-2 py-1 rounded bg-slate-950 border border-cyan-500/50 text-[10px] font-mono text-slate-200 shadow-xl pointer-events-none">
                  {maskIp(node.public_ip)} · 点击查看详情
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

import React, { useState } from "react";
import { RegionGroupData, RegionLayoutStyle, ThemeNode } from "../types";
import { formatSpeed } from "../utils";
import { TowerLayout } from "./layouts/TowerLayout";
import { RingLayout } from "./layouts/RingLayout";
import { HoneycombLayout } from "./layouts/HoneycombLayout";
import { MatrixLayout } from "./layouts/MatrixLayout";
import { Layers, CircleDot, Hexagon, Grid3X3, ArrowDown, ArrowUp, Wifi } from "lucide-react";

interface RegionGroupProps {
  group: RegionGroupData;
  globalLayoutStyle: RegionLayoutStyle;
  onSelectNode: (node: ThemeNode) => void;
}

export const RegionGroup: React.FC<RegionGroupProps> = ({
  group,
  globalLayoutStyle,
  onSelectNode,
}) => {
  // Option to override layout style per region, or follow global
  const [localLayout, setLocalLayout] = useState<RegionLayoutStyle | null>(null);
  const activeLayout = localLayout || globalLayoutStyle;

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4 sm:p-5 backdrop-blur-md shadow-xl transition-all">
      {/* Regional Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          {/* Flag */}
          <span className="text-2xl sm:text-3xl filter drop-shadow select-none">
            {group.flag}
          </span>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-base sm:text-lg text-slate-100">
                {group.regionName}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-slate-800 text-cyan-400 border border-slate-700/60">
                {group.onlineCount}/{group.totalCount} 节点在线
              </span>
            </div>

            {/* Regional Aggregate Telemetry */}
            <div className="flex items-center gap-3 mt-1 text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1 text-cyan-400">
                <ArrowDown className="w-3 h-3 text-cyan-500" />
                {formatSpeed(group.totalDownRate)}
              </span>
              <span className="flex items-center gap-1 text-blue-400">
                <ArrowUp className="w-3 h-3 text-blue-500" />
                {formatSpeed(group.totalUpRate)}
              </span>
              {group.avgLatency > 0 && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Wifi className="w-3 h-3" />
                  均延 {group.avgLatency.toFixed(0)}ms
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Region layout toggle buttons */}
        <div className="flex items-center gap-1 self-start sm:self-center bg-slate-900/90 p-1 rounded-lg border border-slate-800">
          <button
            title="叠层塔 (Stacked Tower)"
            onClick={() => setLocalLayout("tower")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors ${
              activeLayout === "tower"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden md:inline">叠层塔</span>
          </button>

          <button
            title="环形 (Ring Orbit)"
            onClick={() => setLocalLayout("ring")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors ${
              activeLayout === "ring"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <CircleDot className="w-3.5 h-3.5" />
            <span className="hidden md:inline">环形</span>
          </button>

          <button
            title="蜂窝 (Honeycomb)"
            onClick={() => setLocalLayout("honeycomb")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors ${
              activeLayout === "honeycomb"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Hexagon className="w-3.5 h-3.5" />
            <span className="hidden md:inline">蜂窝</span>
          </button>

          <button
            title="方阵 (Matrix Grid)"
            onClick={() => setLocalLayout("matrix")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors ${
              activeLayout === "matrix"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">方阵</span>
          </button>
        </div>
      </div>

      {/* Layout Content */}
      <div className="pt-2">
        {activeLayout === "tower" && (
          <TowerLayout nodes={group.nodes} onSelectNode={onSelectNode} />
        )}
        {activeLayout === "ring" && (
          <RingLayout
            nodes={group.nodes}
            regionFlag={group.flag}
            regionName={group.regionName}
            onSelectNode={onSelectNode}
          />
        )}
        {activeLayout === "honeycomb" && (
          <HoneycombLayout nodes={group.nodes} onSelectNode={onSelectNode} />
        )}
        {activeLayout === "matrix" && (
          <MatrixLayout nodes={group.nodes} onSelectNode={onSelectNode} />
        )}
      </div>
    </div>
  );
};

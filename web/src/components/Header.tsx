import React from "react";
import {
  Server,
  Activity,
  ArrowDown,
  ArrowUp,
  Search,
  LayoutGrid,
  List,
  Plus,
  Wifi,
  WifiOff,
  Cpu,
  Sun,
  Moon,
  Sliders,
} from "lucide-react";
import { SystemSummary } from "../types";
import { formatRate } from "../utils/format";
import { getRegionFlag } from "../utils/flags";

interface HeaderProps {
  summary: SystemSummary;
  wsConnected: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedRegion: string;
  onRegionChange: (r: string) => void;
  regions: string[];
  viewMode: "grid" | "table";
  onViewModeChange: (m: "grid" | "table") => void;
  onOpenAddModal: () => void;
  onOpenAdminModal?: () => void;
  theme?: "blueprint" | "dark";
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  summary,
  wsConnected,
  searchQuery,
  onSearchChange,
  selectedRegion,
  onRegionChange,
  regions,
  viewMode,
  onViewModeChange,
  onOpenAddModal,
  onOpenAdminModal,
  theme = "dark",
  onToggleTheme,
}) => {
  const isBlueprint = theme === "blueprint";

  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-colors ${
      isBlueprint ? "border-slate-200 bg-white/90 text-slate-800 shadow-sm" : "border-zinc-800/80 bg-zinc-950/80 text-zinc-100"
    }`}>
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        {/* Top brand line & actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-indigo-500/40 shadow-inner">
              <Server className="h-5 w-5 text-indigo-500" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    wsConnected ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 ${
                    wsConnected ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-lg font-bold tracking-wider font-mono uppercase ${
                  isBlueprint ? "text-slate-900" : "text-zinc-100"
                }`}>
                  CYBER<span className="text-indigo-500">PROBE</span>
                </h1>
                <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-[10px] font-mono text-indigo-500 border border-indigo-500/30">
                  v1.0
                </span>
              </div>
              <p className={`text-xs font-mono ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                高性能极简探针 · 内存事件 Hub
              </p>
            </div>
          </div>

          {/* Connection Status Pill & Actions */}
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-mono border ${
                wsConnected
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-500"
              }`}
            >
              {wsConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              <span>{wsConnected ? "LIVE STREAMING" : "RECONNECTING..."}</span>
            </div>

            {/* View Mode Toggle */}
            <div className={`flex items-center rounded-lg border p-0.5 ${
              isBlueprint ? "border-slate-200 bg-slate-100" : "border-zinc-800 bg-zinc-900/60"
            }`}>
              <button
                onClick={() => onViewModeChange("grid")}
                className={`rounded p-1.5 transition-colors ${
                  viewMode === "grid"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : isBlueprint
                    ? "text-slate-500 hover:text-slate-900"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="网格卡片视图"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => onViewModeChange("table")}
                className={`rounded p-1.5 transition-colors ${
                  viewMode === "table"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : isBlueprint
                    ? "text-slate-500 hover:text-slate-900"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="表格机架视图"
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            {/* Theme Toggle Button (Moon / Sun) */}
            {onToggleTheme && (
              <button
                onClick={onToggleTheme}
                className={`p-1.5 rounded-lg border transition-colors ${
                  isBlueprint
                    ? "bg-white border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100"
                }`}
                title={isBlueprint ? "切换到暗黑模式" : "切换到 Blueprint 模式"}
              >
                {isBlueprint ? <Moon className="h-4 w-4 text-slate-600" /> : <Sun className="h-4 w-4 text-amber-400" />}
              </button>
            )}

            {/* Admin Console Button */}
            {onOpenAdminModal && (
              <button
                onClick={onOpenAdminModal}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono font-medium transition-colors ${
                  isBlueprint
                    ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm"
                    : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 hover:text-white"
                }`}
                title="管理后台 (添加主机、延迟检测、财务与汇率)"
              >
                <Sliders className="h-3.5 w-3.5 text-indigo-500" />
                <span>管理后台</span>
              </button>
            )}

            {/* Add Node Button */}
            <button
              onClick={onOpenAddModal}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-mono font-medium text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
            >
              <Plus className="h-4 w-4" />
              <span>Add Node</span>
            </button>
          </div>
        </div>

        {/* Global Cluster Status Cards */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
          <div className={`rounded-xl border p-3 ${
            isBlueprint ? "bg-white border-slate-200/90 text-slate-800 shadow-sm" : "border-zinc-800/80 bg-zinc-900/40 text-zinc-100"
          }`}>
            <div className={`text-[11px] flex items-center justify-between ${isBlueprint ? "text-slate-400" : "text-zinc-400"}`}>
              <span>NODES OVERVIEW</span>
              <Activity className="h-3.5 w-3.5 text-indigo-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-xl font-bold ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                {summary.online_nodes}
              </span>
              <span className={`text-xs ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>/ {summary.total_nodes} Total</span>
            </div>
          </div>

          <div className={`rounded-xl border p-3 ${
            isBlueprint ? "bg-white border-slate-200/90 text-slate-800 shadow-sm" : "border-zinc-800/80 bg-zinc-900/40 text-zinc-100"
          }`}>
            <div className={`text-[11px] flex items-center justify-between ${isBlueprint ? "text-slate-400" : "text-zinc-400"}`}>
              <span>TOTAL INGRESS</span>
              <ArrowDown className="h-3.5 w-3.5 text-cyan-500" />
            </div>
            <div className="mt-1 text-xl font-bold text-cyan-500">
              {formatRate(summary.total_rate_down)}
            </div>
          </div>

          <div className={`rounded-xl border p-3 ${
            isBlueprint ? "bg-white border-slate-200/90 text-slate-800 shadow-sm" : "border-zinc-800/80 bg-zinc-900/40 text-zinc-100"
          }`}>
            <div className={`text-[11px] flex items-center justify-between ${isBlueprint ? "text-slate-400" : "text-zinc-400"}`}>
              <span>TOTAL EGRESS</span>
              <ArrowUp className="h-3.5 w-3.5 text-indigo-500" />
            </div>
            <div className="mt-1 text-xl font-bold text-indigo-500">
              {formatRate(summary.total_rate_up)}
            </div>
          </div>

          <div className={`rounded-xl border p-3 ${
            isBlueprint ? "bg-white border-slate-200/90 text-slate-800 shadow-sm" : "border-zinc-800/80 bg-zinc-900/40 text-zinc-100"
          }`}>
            <div className={`text-[11px] flex items-center justify-between ${isBlueprint ? "text-slate-400" : "text-zinc-400"}`}>
              <span>CLUSTER LOAD (AVG)</span>
              <Cpu className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-emerald-500">
                {summary.avg_cpu.toFixed(1)}%
              </span>
              <span className={`text-xs ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>RAM: {summary.avg_mem.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Search & Region Filter Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className={`absolute left-3 top-2.5 h-4 w-4 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`} />
            <input
              type="text"
              placeholder="Search by node name, ID, or IP..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`w-full rounded-lg border pl-9 pr-3 py-1.5 text-xs font-mono focus:outline-none transition-colors ${
                isBlueprint
                  ? "bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500"
                  : "bg-zinc-900/80 border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:border-indigo-500"
              }`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
            <button
              onClick={() => onRegionChange("ALL")}
              className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                selectedRegion === "ALL"
                  ? "bg-indigo-600 text-white font-semibold shadow-sm"
                  : isBlueprint
                  ? "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                  : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              ALL REGIONS
            </button>
            {regions.map((reg) => (
              <button
                key={reg}
                onClick={() => onRegionChange(reg)}
                className={`rounded-lg px-2.5 py-1 text-xs transition-colors flex items-center gap-1.5 ${
                  selectedRegion === reg
                    ? "bg-indigo-600 text-white font-semibold shadow-sm"
                    : isBlueprint
                    ? "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                    : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                <span>{getRegionFlag(reg)}</span>
                <span>{reg}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};

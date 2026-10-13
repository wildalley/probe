import React from "react";
import { RegionLayoutStyle, ThemeNode } from "../types";
import { formatBytes, formatSpeed } from "../utils";
import {
  Layers,
  CircleDot,
  Hexagon,
  Grid3X3,
  Search,
  Server,
  Activity,
  ArrowDown,
  ArrowUp,
  Cpu,
  MemoryStick,
  Sparkles,
  Radio,
  Lock,
  User,
  LogOut,
} from "lucide-react";

interface HeaderProps {
  nodes: ThemeNode[];
  layoutStyle: RegionLayoutStyle;
  onChangeLayoutStyle: (style: RegionLayoutStyle) => void;
  searchQuery: string;
  onChangeSearchQuery: (query: string) => void;
  statusFilter: "all" | "online" | "offline";
  onChangeStatusFilter: (status: "all" | "online" | "offline") => void;
  sortBy: "default" | "cpu" | "mem" | "down" | "latency";
  onChangeSortBy: (sort: "default" | "cpu" | "mem" | "down" | "latency") => void;
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
  username: string | null;
  canManage: boolean;
  onLogout?: () => void;
  siteTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  nodes,
  layoutStyle,
  onChangeLayoutStyle,
  searchQuery,
  onChangeSearchQuery,
  statusFilter,
  onChangeStatusFilter,
  sortBy,
  onChangeSortBy,
  isDemoMode,
  onToggleDemoMode,
  username,
  canManage,
  onLogout,
  siteTitle = "哪吒节点实况",
}) => {
  // Global aggregate stats
  const totalNodes = nodes.length;
  const onlineNodes = nodes.filter((n) => n.is_online).length;
  const offlineNodes = totalNodes - onlineNodes;

  const totalDown = nodes.reduce((acc, n) => acc + (n.is_online ? n.rate_down : 0), 0);
  const totalUp = nodes.reduce((acc, n) => acc + (n.is_online ? n.rate_up : 0), 0);

  const avgCpu =
    onlineNodes > 0
      ? nodes.reduce((acc, n) => acc + (n.is_online ? n.cpu : 0), 0) / onlineNodes
      : 0;

  const totalMem = nodes.reduce((acc, n) => acc + (n.is_online ? n.mem_total : 0), 0);
  const usedMem = nodes.reduce((acc, n) => acc + (n.is_online ? n.mem_used : 0), 0);
  const memPct = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;

  return (
    <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-xl border-b border-cyan-500/20 shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 space-y-3">
        {/* Top row: Brand + Cluster Telemetry + Mode Switchers */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-lg text-slate-100 tracking-tight">
                  {siteTitle}
                </h1>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-semibold">
                  v4.0
                </span>
                {isDemoMode && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60 animate-pulse">
                    演示数据
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                地区防拥挤视图 · 支持叠层塔 / 环形 / 蜂窝 / 方阵
              </p>
            </div>
          </div>

          {/* Global Cluster Stats Badges */}
          <div className="hidden lg:flex items-center gap-3 text-xs font-mono">
            {/* Servers ratio */}
            <div className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center gap-2">
              <span className="text-slate-400">服务器:</span>
              <span className="text-emerald-400 font-bold">{onlineNodes}</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-200">{totalNodes}</span>
              {offlineNodes > 0 && (
                <span className="text-rose-400 text-[10px]">({offlineNodes} 离线)</span>
              )}
            </div>

            {/* Avg CPU */}
            <div className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">平均 CPU:</span>
              <span className="text-cyan-300 font-bold">{avgCpu.toFixed(1)}%</span>
            </div>

            {/* Total RAM */}
            <div className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center gap-1.5">
              <MemoryStick className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-400">总内存:</span>
              <span className="text-blue-300 font-bold">
                {formatBytes(usedMem, 0)} ({memPct.toFixed(0)}%)
              </span>
            </div>

            {/* Total Live Bandwidth */}
            <div className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center gap-2 text-cyan-400">
              <span className="flex items-center gap-0.5">
                <ArrowDown className="w-3 h-3 text-cyan-500" />
                {formatSpeed(totalDown)}
              </span>
              <span className="text-slate-700">|</span>
              <span className="flex items-center gap-0.5 text-blue-400">
                <ArrowUp className="w-3 h-3 text-blue-500" />
                {formatSpeed(totalUp)}
              </span>
            </div>
          </div>

          {/* Right Action: Demo Toggle & Admin Login */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            {/* Demo Toggle */}
            <button
              onClick={onToggleDemoMode}
              title={isDemoMode ? "切换到实时探针数据" : "切换到演示数据"}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                isDemoMode
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                  : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-cyan-300"
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${isDemoMode ? "animate-pulse text-amber-400" : ""}`} />
              <span>{isDemoMode ? "演示模式" : "实时连接"}</span>
            </button>

            {/* Management / Admin Button */}
            {canManage ? (
              <div className="flex items-center gap-1">
                <a
                  href="/admin"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono transition-colors"
                >
                  <User className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{username || "管理"}</span>
                </a>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    title="退出登录"
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <a
                href="/admin"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-mono transition-colors"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>管理登录</span>
              </a>
            )}
          </div>
        </div>

        {/* Bottom controls row: Layout Switcher + Search + Filter + Sort */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1 border-t border-slate-900">
          {/* Four Layout Modes for Regional Multi-Server Crowding */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 shrink-0">
            <span className="text-[11px] font-mono text-slate-400 px-2 hidden sm:inline">
              地区排版:
            </span>

            <button
              onClick={() => onChangeLayoutStyle("tower")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                layoutStyle === "tower"
                  ? "bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-300 border border-cyan-500/50 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>叠层塔</span>
            </button>

            <button
              onClick={() => onChangeLayoutStyle("ring")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                layoutStyle === "ring"
                  ? "bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-300 border border-cyan-500/50 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <CircleDot className="w-3.5 h-3.5" />
              <span>环形</span>
            </button>

            <button
              onClick={() => onChangeLayoutStyle("honeycomb")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                layoutStyle === "honeycomb"
                  ? "bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-300 border border-cyan-500/50 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <Hexagon className="w-3.5 h-3.5" />
              <span>蜂窝</span>
            </button>

            <button
              onClick={() => onChangeLayoutStyle("matrix")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                layoutStyle === "matrix"
                  ? "bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-300 border border-cyan-500/50 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span>方阵</span>
            </button>
          </div>

          {/* Search & Filtering Group */}
          <div className="flex items-center gap-2 flex-1 max-w-md ml-auto">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onChangeSearchQuery(e.target.value)}
                placeholder="搜索名称 / 标签 / 地区..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 font-mono"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs font-mono">
              <button
                onClick={() => onChangeStatusFilter("all")}
                className={`px-2 py-1 rounded ${
                  statusFilter === "all" ? "bg-slate-800 text-cyan-300" : "text-slate-400"
                }`}
              >
                全部
              </button>
              <button
                onClick={() => onChangeStatusFilter("online")}
                className={`px-2 py-1 rounded ${
                  statusFilter === "online" ? "bg-slate-800 text-emerald-400" : "text-slate-400"
                }`}
              >
                在线
              </button>
              <button
                onClick={() => onChangeStatusFilter("offline")}
                className={`px-2 py-1 rounded ${
                  statusFilter === "offline" ? "bg-slate-800 text-rose-400" : "text-slate-400"
                }`}
              >
                离线
              </button>
            </div>

            {/* Sort Selection */}
            <select
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value as any)}
              className="bg-slate-900 text-slate-300 border border-slate-800 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500/60"
            >
              <option value="default">默认排序</option>
              <option value="cpu">按 CPU 占用</option>
              <option value="mem">按 内存 占用</option>
              <option value="down">按 下行 速率</option>
              <option value="latency">按 网络 延迟</option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
};

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
  Cpu,
  Sun,
  Moon,
  Sliders,
  LogOut,
  LogIn,
  KeyRound,
  UserCircle,
  X,
} from "lucide-react";
import { SystemSummary } from "../types";
import { splitRate } from "../utils/format";
import { getRegionFlag } from "../utils/flags";
import { cn } from "../lib/utils";
import { NumberTicker } from "./ui/NumberTicker";
import { AnimatedGradientText } from "./ui/AnimatedGradientText";
import { BlurFade } from "./ui/BlurFade";

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
  /** True when the viewer holds an admin session. Hides write actions when false. */
  canManage?: boolean;
  username?: string | null;
  onLogout?: () => void;
  onOpenPasswordModal?: () => void;
  /** Sends an anonymous viewer back to the login screen. */
  onRequestLogin?: () => void;
}

/**
 * Throughput readout. `formatRate` rescales as traffic grows, so the ticker is
 * driven by the scaled value and the unit is rendered as static text — letting
 * the digits animate without the suffix flickering between magnitudes.
 */
const RateStat: React.FC<{ bytesPerSec: number; className?: string }> = ({
  bytesPerSec,
  className,
}) => {
  const { value, unit } = splitRate(bytesPerSec);
  return (
    <span className={cn("flex items-baseline gap-1", className)}>
      <NumberTicker value={value} decimals={1} />
      <span className="text-xs font-medium opacity-80">{unit}</span>
    </span>
  );
};

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
  canManage = false,
  username,
  onLogout,
  onOpenPasswordModal,
  onRequestLogin,
}) => {
  const isBlueprint = theme === "blueprint";

  const statCardClass = cn(
    "group relative overflow-hidden rounded-xl border p-3 transition-all duration-300",
    isBlueprint
      ? "bg-white border-slate-200/90 text-slate-800 shadow-xs hover:border-slate-300 hover:shadow-sm"
      : "border-zinc-800/80 bg-zinc-900/40 text-zinc-100 hover:border-zinc-700/80"
  );

  const statLabelClass = cn(
    "text-11 flex items-center justify-between",
    isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"
  );

  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-colors ${
      isBlueprint ? "border-slate-200 bg-white/90 text-slate-800 shadow-sm" : "border-zinc-800/80 bg-zinc-950/80 text-zinc-100"
    }`}>
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        {/* Top brand line & actions. The brand may shrink and truncate; the action
            cluster keeps its own width and wraps as a unit so the two never overlap. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          {/* Brand */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-indigo-500/40 shadow-inner">
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
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-wider font-mono uppercase whitespace-nowrap">
                  <AnimatedGradientText
                    className={cn(
                      "bg-[linear-gradient(110deg,#6366f1,45%,#22d3ee,55%,#6366f1)]",
                      !isBlueprint && "bg-[linear-gradient(110deg,#818cf8,45%,#67e8f9,55%,#818cf8)]"
                    )}
                  >
                    CYBERPROBE
                  </AnimatedGradientText>
                </h1>
                <span className="shrink-0 rounded bg-indigo-500/10 px-2 py-0.5 text-10 font-mono text-indigo-500 border border-indigo-500/30">
                  v1.0
                </span>
              </div>
              {/* Tagline is decorative: hide it on narrow screens rather than let it
                  squeeze the action cluster. */}
              <p className={`hidden truncate text-xs font-sans sm:block ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                高性能极简探针 · 内存事件 Hub
              </p>
            </div>
          </div>

          {/* Actions. Connection state is already carried by the beacon on the
              brand mark, so no separate status pill is rendered here. */}
          <div className="flex shrink-0 items-center gap-2 lg:gap-3">
            {/* Theme Toggle Button (Moon / Sun) */}
            {onToggleTheme && (
              <button
                onClick={onToggleTheme}
                className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all cursor-pointer active:scale-95 ${
                  isBlueprint
                    ? "bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 shadow-xs"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                }`}
                title={isBlueprint ? "切换到暗黑模式" : "切换到 Blueprint 模式"}
              >
                {isBlueprint ? <Moon className="h-4 w-4 text-slate-600" /> : <Sun className="h-4 w-4 text-amber-400" />}
              </button>
            )}

            {/* Admin Console Button (session required) */}
            {canManage && onOpenAdminModal && (
              <button
                onClick={onOpenAdminModal}
                className={`h-9 flex items-center gap-1.5 rounded-xl border px-3 text-xs font-sans font-medium transition-all cursor-pointer active:scale-95 ${
                  isBlueprint
                    ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs"
                    : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 hover:text-white"
                }`}
                title="管理后台 (添加主机、延迟检测、财务与汇率)"
              >
                <Sliders className="h-3.5 w-3.5 text-indigo-500" />
                <span>管理后台</span>
              </button>
            )}

            {/* Add Node Button (session required) */}
            {canManage && (
              <button
                onClick={onOpenAddModal}
                className="h-9 flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-xs font-sans font-medium text-white hover:bg-indigo-500 active:scale-95 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>添加节点</span>
              </button>
            )}

            {/* Session controls: current operator plus password / logout entries,
                or a login entry for anonymous viewers. */}
            {canManage ? (
              <div className={`h-9 flex items-center gap-1 rounded-xl border pl-2.5 pr-0.5 ${
                isBlueprint ? "border-slate-200 bg-white shadow-xs" : "border-zinc-800 bg-zinc-900/60"
              }`}>
                <UserCircle className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className={`max-w-[10ch] truncate text-xs font-sans ${isBlueprint ? "text-slate-600" : "text-zinc-300"}`}>
                  {username || "admin"}
                </span>
                {onOpenPasswordModal && (
                  <button
                    onClick={onOpenPasswordModal}
                    className={`ml-1 rounded-lg p-1.5 transition-all cursor-pointer active:scale-95 ${
                      isBlueprint
                        ? "text-slate-400 hover:text-indigo-600 hover:bg-slate-100"
                        : "text-zinc-500 hover:text-indigo-400 hover:bg-zinc-800"
                    }`}
                    title="修改密码"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                  </button>
                )}
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className={`rounded-lg p-1.5 transition-all cursor-pointer active:scale-95 ${
                      isBlueprint
                        ? "text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        : "text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                    }`}
                    title="退出登录"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              onRequestLogin && (
                <button
                  onClick={onRequestLogin}
                  className="h-9 flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-xs font-sans font-medium text-white hover:bg-indigo-500 active:scale-95 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
                  title="登录以管理节点与配置"
                >
                  <LogIn className="h-4 w-4" />
                  <span>登录</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Global Cluster Status Cards */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
          <BlurFade delay={0.05} className={statCardClass}>
            <div className={statLabelClass}>
              <span>NODES OVERVIEW</span>
              <Activity className="h-3.5 w-3.5 text-indigo-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <NumberTicker
                value={summary.online_nodes}
                className={cn("text-xl font-bold", isBlueprint ? "text-slate-900" : "text-zinc-100")}
              />
              <span className={cn("text-xs", isBlueprint ? "text-slate-500" : "text-zinc-500")}>
                / {summary.total_nodes} Total
              </span>
            </div>
          </BlurFade>

          <BlurFade delay={0.12} className={statCardClass}>
            <div className={statLabelClass}>
              <span>TOTAL INGRESS</span>
              <ArrowDown className="h-3.5 w-3.5 text-cyan-500" />
            </div>
            <RateStat bytesPerSec={summary.total_rate_down} className="text-cyan-500" />
          </BlurFade>

          <BlurFade delay={0.19} className={statCardClass}>
            <div className={statLabelClass}>
              <span>TOTAL EGRESS</span>
              <ArrowUp className="h-3.5 w-3.5 text-indigo-500" />
            </div>
            <RateStat bytesPerSec={summary.total_rate_up} className="text-indigo-500" />
          </BlurFade>

          <BlurFade delay={0.26} className={statCardClass}>
            <div className={statLabelClass}>
              <span>CLUSTER LOAD (AVG)</span>
              <Cpu className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <NumberTicker
                value={summary.avg_cpu}
                decimals={1}
                suffix="%"
                className="text-xl font-bold text-emerald-500"
              />
              <span className={cn("text-xs", isBlueprint ? "text-slate-500" : "text-zinc-500")}>
                RAM: {summary.avg_mem.toFixed(1)}%
              </span>
            </div>
          </BlurFade>
        </div>

        {/* Search, region filter & view mode. The grid/table toggle sits here,
            directly above the list it controls. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className={`absolute left-3 top-2.5 h-4 w-4 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`} />
            <input
              type="text"
              placeholder="搜索主机名称、节点 ID 或 IP 地址..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`w-full rounded-xl border pl-9 pr-8 py-1.5 text-xs font-sans focus:outline-none transition-all ${
                isBlueprint
                  ? "bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 shadow-xs"
                  : "bg-zinc-900/80 border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className={`absolute right-2.5 top-2.5 p-0.5 rounded-md ${
                  isBlueprint ? "text-slate-400 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-300"
                } transition-colors cursor-pointer`}
                title="清除搜索"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5 font-mono text-xs">
            <button
              onClick={() => onRegionChange("ALL")}
              className={`rounded-lg px-2.5 py-1 text-xs transition-all cursor-pointer active:scale-95 ${
                selectedRegion === "ALL"
                  ? "bg-indigo-600 text-white font-semibold shadow-xs"
                  : isBlueprint
                  ? "bg-white text-slate-600 hover:text-slate-900 border border-slate-200 shadow-xs"
                  : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              ALL REGIONS
            </button>
            {regions.map((reg) => (
              <button
                key={reg}
                onClick={() => onRegionChange(reg)}
                className={`rounded-lg px-2.5 py-1 text-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                  selectedRegion === reg
                    ? "bg-indigo-600 text-white font-semibold shadow-xs"
                    : isBlueprint
                    ? "bg-white text-slate-600 hover:text-slate-900 border border-slate-200 shadow-xs"
                    : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                <span className="text-sm leading-none">{getRegionFlag(reg)}</span>
                <span className="leading-none">{reg}</span>
              </button>
            ))}
          </div>

          {/* View Mode Toggle */}
          <div className={`flex shrink-0 items-center rounded-xl border p-0.5 ${
            isBlueprint ? "border-slate-200 bg-slate-100 shadow-xs" : "border-zinc-800 bg-zinc-900/60"
          }`}>
            <button
              onClick={() => onViewModeChange("grid")}
              className={`rounded-lg p-1.5 transition-all cursor-pointer active:scale-95 ${
                viewMode === "grid"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : isBlueprint
                  ? "text-slate-500 hover:text-slate-900"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="网格卡片视图"
              aria-label="网格卡片视图"
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => onViewModeChange("table")}
              className={`rounded-lg p-1.5 transition-all cursor-pointer active:scale-95 ${
                viewMode === "table"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : isBlueprint
                  ? "text-slate-500 hover:text-slate-900"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="表格机架视图"
              aria-label="表格机架视图"
              aria-pressed={viewMode === "table"}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

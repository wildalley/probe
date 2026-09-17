import React, { useEffect, useRef, useState } from "react";
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
  Radio,
  Layers,
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
  regionCounts?: Record<string, number>;
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
const RateStat: React.FC<{ bytesPerSec: number; className?: string; unitClassName?: string }> = ({
  bytesPerSec,
  className,
  unitClassName,
}) => {
  const { value, unit } = splitRate(bytesPerSec);
  return (
    <span className={cn("flex items-baseline gap-1 font-mono", className)}>
      <NumberTicker value={value} decimals={1} />
      <span className={cn("text-xs font-semibold uppercase tracking-wider opacity-80", unitClassName)}>{unit}</span>
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
  regionCounts,
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [mobileUserMenuOpen, setMobileUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close mobile user menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setMobileUserMenuOpen(false);
      }
    };
    if (mobileUserMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [mobileUserMenuOpen]);

  // Global hotkey: Ctrl+K, Cmd+K, or "/" to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (
        (e.key === "k" && (e.metaKey || e.ctrlKey)) ||
        (e.key === "/" && activeTag !== "INPUT" && activeTag !== "TEXTAREA")
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const onlinePercent = summary.total_nodes > 0 ? (summary.online_nodes / summary.total_nodes) * 100 : 0;

  const statCardClass = cn(
    "group relative overflow-hidden rounded-2xl border p-2.5 sm:p-3.5 transition-all duration-300",
    isBlueprint
      ? "bg-white/90 border-slate-200/90 text-slate-800 shadow-xs hover:border-slate-300 hover:shadow-md backdrop-blur-md"
      : "border-white/[0.07] bg-zinc-900/55 text-zinc-100 backdrop-blur-md hover:border-white/[0.14] hover:bg-zinc-900/80 shadow-[0_4px_20px_rgba(0,0,0,0.25)]"
  );

  const statLabelClass = cn(
    "text-[10px] sm:text-11 flex items-center justify-between font-mono uppercase tracking-wider font-semibold",
    isBlueprint ? "text-slate-500" : "text-zinc-400"
  );

  return (
    <>
      {/* Sticky Compact Navigation Bar: strictly single-row and slim so it never covers mobile view */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-2xl transition-colors duration-200 ${
          isBlueprint
            ? "border-slate-200/80 bg-white/85 text-slate-800 shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
            : "border-white/[0.08] bg-zinc-950/85 text-zinc-100 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
        }`}
      >
        <div className="mx-auto max-w-[1600px] px-3 py-2 sm:px-6 sm:py-3 lg:px-8">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Brand & Connection Status */}
            <div className="flex min-w-0 items-center gap-2 sm:gap-3.5">
              {/* Logo with outer glow ring */}
              <div className="relative group shrink-0">
                <div
                  className={`relative flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ${
                    isBlueprint
                      ? "bg-gradient-to-br from-indigo-50 to-indigo-100/60 border border-indigo-200 shadow-sm"
                      : "bg-gradient-to-br from-indigo-500/20 via-indigo-600/10 to-cyan-500/15 border border-indigo-500/40 shadow-[0_0_16px_rgba(99,102,241,0.25)]"
                  }`}
                >
                  <Server className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-500 transition-transform duration-300 group-hover:scale-110" />
                  {/* Live beacon ping */}
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 sm:h-3 sm:w-3">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        wsConnected ? "bg-emerald-400" : "bg-rose-400"
                      }`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 ${
                        wsConnected ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                    />
                  </span>
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h1 className="text-sm sm:text-lg font-bold tracking-wider font-mono uppercase whitespace-nowrap">
                    <AnimatedGradientText
                      className={cn(
                        "bg-[linear-gradient(110deg,#6366f1,45%,#22d3ee,55%,#6366f1)]",
                        !isBlueprint && "bg-[linear-gradient(110deg,#818cf8,45%,#67e8f9,55%,#818cf8)]"
                      )}
                    >
                      CYBERPROBE
                    </AnimatedGradientText>
                  </h1>

                  {/* Hub connection state chip */}
                  <div
                    className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-10 font-mono font-medium border transition-colors ${
                      wsConnected
                        ? isBlueprint
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200/90"
                          : "bg-emerald-950/40 text-emerald-400 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]"
                        : isBlueprint
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : "bg-rose-950/40 text-rose-400 border-rose-500/30 shadow-[0_0_8px_rgba(244,63,94,0.15)]"
                    }`}
                    title={wsConnected ? "WebSocket 实时连接正常" : "WebSocket 断开重连中"}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        wsConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                      }`}
                    />
                    <span className="tracking-tight">{wsConnected ? "HUB LIVE" : "OFFLINE"}</span>
                  </div>

                  <span
                    className={`hidden md:inline-block shrink-0 rounded px-1.5 py-0.5 text-9 font-mono border ${
                      isBlueprint
                        ? "bg-slate-100 text-slate-500 border-slate-200"
                        : "bg-zinc-900/80 text-zinc-400 border-zinc-800"
                    }`}
                  >
                    v1.0
                  </span>
                </div>

                <p
                  className={`hidden truncate text-xs font-sans sm:block mt-0.5 ${
                    isBlueprint ? "text-slate-500" : "text-zinc-400"
                  }`}
                >
                  高性能极简探针 · 内存事件 Hub
                </p>
              </div>
            </div>

            {/* Action buttons cluster */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
              {/* Theme Toggle Button (Moon / Sun) */}
              {onToggleTheme && (
                <button
                  onClick={onToggleTheme}
                  className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border transition-all cursor-pointer active:scale-95 ${
                    isBlueprint
                      ? "bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 shadow-xs"
                      : "bg-zinc-900/80 border-white/[0.08] text-zinc-400 hover:text-zinc-100 hover:border-white/[0.18] hover:bg-zinc-800/80"
                  }`}
                  title={isBlueprint ? "切换到暗黑模式" : "切换到 Blueprint 浅色模式"}
                  aria-label="Toggle Theme"
                >
                  {isBlueprint ? (
                    <Moon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600 transition-transform hover:-rotate-12" />
                  ) : (
                    <Sun className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-400 transition-transform hover:rotate-45" />
                  )}
                </button>
              )}

              {/* Admin Console Button (session required) */}
              {canManage && onOpenAdminModal && (
                <button
                  onClick={onOpenAdminModal}
                  className={`h-8 px-2 sm:h-9 sm:px-3 flex items-center gap-1.5 rounded-xl border text-xs font-sans font-medium transition-all cursor-pointer active:scale-95 ${
                    isBlueprint
                      ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs"
                      : "bg-zinc-900/80 border-white/[0.08] text-zinc-300 hover:bg-zinc-800 hover:border-white/[0.18] hover:text-white"
                  }`}
                  title="管理后台 (主机配置、延迟检测、财务与汇率)"
                  aria-label="管理后台"
                >
                  <Sliders className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span className="hidden sm:inline">管理后台</span>
                </button>
              )}

              {/* Add Node Button (session required) */}
              {canManage && (
                <button
                  onClick={onOpenAddModal}
                  className="h-8 px-2.5 sm:h-9 sm:px-3.5 flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-xs font-sans font-medium text-white active:scale-95 transition-all shadow-md shadow-indigo-600/25 cursor-pointer"
                  title="添加节点 / 一键部署"
                  aria-label="添加节点"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">添加节点</span>
                </button>
              )}

              {/* Session Controls: User Profile */}
              {canManage ? (
                <div ref={userMenuRef} className="relative">
                  {/* Desktop Full Pill */}
                  <div
                    className={`hidden sm:flex h-9 items-center gap-1.5 rounded-xl border pl-2.5 pr-1.5 transition-colors ${
                      isBlueprint
                        ? "border-slate-200/90 bg-white shadow-xs"
                        : "border-white/[0.08] bg-zinc-900/70 shadow-inner"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                      <span
                        className={`max-w-[12ch] truncate text-xs font-sans font-medium ${
                          isBlueprint ? "text-slate-700" : "text-zinc-200"
                        }`}
                      >
                        {username || "admin"}
                      </span>
                    </div>

                    <div
                      className={`h-3.5 w-px mx-0.5 ${isBlueprint ? "bg-slate-200" : "bg-zinc-800"}`}
                    />

                    <div className="flex items-center gap-0.5">
                      {onOpenPasswordModal && (
                        <button
                          onClick={onOpenPasswordModal}
                          className={`rounded-lg p-1.5 transition-all cursor-pointer active:scale-90 ${
                            isBlueprint
                              ? "text-slate-400 hover:text-indigo-600 hover:bg-slate-100"
                              : "text-zinc-400 hover:text-indigo-400 hover:bg-zinc-800"
                          }`}
                          title="修改管理密码"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {onLogout && (
                        <button
                          onClick={onLogout}
                          className={`rounded-lg p-1.5 transition-all cursor-pointer active:scale-90 ${
                            isBlueprint
                              ? "text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              : "text-zinc-400 hover:text-rose-400 hover:bg-rose-500/15"
                          }`}
                          title="退出登录"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mobile Compact User Trigger */}
                  <button
                    onClick={() => setMobileUserMenuOpen(!mobileUserMenuOpen)}
                    className={`flex sm:hidden h-8 w-8 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                      isBlueprint
                        ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        : "bg-zinc-900/80 border-white/[0.08] text-zinc-300 hover:bg-zinc-800"
                    }`}
                    aria-label="用户账户菜单"
                    title={username || "管理账户"}
                  >
                    <UserCircle className="h-4 w-4 text-indigo-500" />
                  </button>

                  {/* Mobile User Dropdown Popover */}
                  {mobileUserMenuOpen && (
                    <div
                      className={`absolute right-0 top-10 z-50 min-w-[180px] rounded-xl border p-1.5 shadow-xl transition-all ${
                        isBlueprint
                          ? "bg-white border-slate-200 text-slate-800 shadow-slate-300/50"
                          : "bg-zinc-900 border-zinc-800 text-zinc-100 shadow-black/70"
                      }`}
                    >
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-zinc-800/80 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="text-xs font-semibold font-sans truncate">{username || "admin"}</span>
                      </div>
                      <div className="pt-1 space-y-0.5">
                        {onOpenPasswordModal && (
                          <button
                            onClick={() => {
                              setMobileUserMenuOpen(false);
                              onOpenPasswordModal();
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-left transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            <KeyRound className="h-3.5 w-3.5 text-indigo-500" />
                            <span>修改管理密码</span>
                          </button>
                        )}
                        {onLogout && (
                          <button
                            onClick={() => {
                              setMobileUserMenuOpen(false);
                              onLogout();
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-left text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            <span>退出登录</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                onRequestLogin && (
                  <button
                    onClick={onRequestLogin}
                    className="h-8 px-2.5 sm:h-9 sm:px-3.5 flex items-center gap-1.5 rounded-xl bg-indigo-600 text-xs font-sans font-medium text-white hover:bg-indigo-500 active:scale-95 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
                    title="登录以管理节点与配置"
                  >
                    <LogIn className="h-4 w-4" />
                    <span className="hidden sm:inline">登录</span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Cluster Overview Stats & Filter Toolbar — scrolls naturally with the page, never obscuring mobile view! */}
      <section
        className={`border-b transition-colors duration-200 ${
          isBlueprint
            ? "border-slate-200/70 bg-white/40"
            : "border-white/[0.05] bg-zinc-950/40"
        }`}
      >
        <div className="mx-auto max-w-[1600px] px-3.5 py-3 sm:px-6 sm:py-3.5 lg:px-8">
          {/* Row 2: Global Cluster Status Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 font-mono">
            {/* Card 1: Nodes Overview */}
            <BlurFade delay={0.03} className={statCardClass}>
              {/* Top accent glow line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent opacity-80" />
              <div className={statLabelClass}>
                <span>NODES OVERVIEW</span>
                <Activity className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-indigo-500" />
              </div>
              <div className="mt-1 sm:mt-1.5 flex items-baseline gap-1.5">
                <NumberTicker
                  value={summary.online_nodes}
                  className={cn("text-lg sm:text-xl font-bold font-mono tracking-tight", isBlueprint ? "text-slate-900" : "text-zinc-100")}
                />
                <span className={cn("text-[11px] sm:text-xs font-mono font-medium", isBlueprint ? "text-slate-400" : "text-zinc-500")}>
                  / {summary.total_nodes} Total
                </span>
              </div>
              {/* Online health micro-progress bar */}
              <div className="mt-1.5 sm:mt-2 flex items-center gap-1.5 sm:gap-2">
                <div className={`h-1 flex-1 rounded-full overflow-hidden ${isBlueprint ? "bg-slate-200/80" : "bg-zinc-800"}`}>
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${onlinePercent}%` }}
                  />
                </div>
                <span className={`text-[10px] font-mono whitespace-nowrap ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                  {onlinePercent.toFixed(0)}% 在线
                </span>
              </div>
            </BlurFade>

            {/* Card 2: Total Ingress */}
            <BlurFade delay={0.08} className={statCardClass}>
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent opacity-80" />
              <div className={statLabelClass}>
                <span>TOTAL INGRESS</span>
                <ArrowDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-cyan-500" />
              </div>
              <div className="mt-1 sm:mt-1.5">
                <RateStat bytesPerSec={summary.total_rate_down} className="text-lg sm:text-xl font-bold text-cyan-500 tracking-tight" />
              </div>
              <div className="mt-1.5 sm:mt-2 flex items-center justify-between text-[10px]">
                <span className={cn("truncate", isBlueprint ? "text-slate-400" : "text-zinc-500")}>实时下行总带宽</span>
                <span className="flex items-center gap-1 text-cyan-500 font-medium shrink-0 ml-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
                  RX LIVE
                </span>
              </div>
            </BlurFade>

            {/* Card 3: Total Egress */}
            <BlurFade delay={0.13} className={statCardClass}>
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent opacity-80" />
              <div className={statLabelClass}>
                <span>TOTAL EGRESS</span>
                <ArrowUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-indigo-500" />
              </div>
              <div className="mt-1 sm:mt-1.5">
                <RateStat bytesPerSec={summary.total_rate_up} className="text-lg sm:text-xl font-bold text-indigo-500 tracking-tight" />
              </div>
              <div className="mt-1.5 sm:mt-2 flex items-center justify-between text-[10px]">
                <span className={cn("truncate", isBlueprint ? "text-slate-400" : "text-zinc-500")}>实时上行总带宽</span>
                <span className="flex items-center gap-1 text-indigo-500 font-medium shrink-0 ml-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  TX LIVE
                </span>
              </div>
            </BlurFade>

            {/* Card 4: Cluster Load (Avg) */}
            <BlurFade delay={0.18} className={statCardClass}>
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent opacity-80" />
              <div className={statLabelClass}>
                <span>CLUSTER LOAD</span>
                <Cpu className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-500" />
              </div>
              <div className="mt-1 sm:mt-1.5 flex items-baseline justify-between">
                <div className="flex items-baseline gap-1">
                  <NumberTicker
                    value={summary.avg_cpu}
                    decimals={1}
                    suffix="%"
                    className="text-lg sm:text-xl font-bold text-emerald-500 tracking-tight"
                  />
                  <span className="text-[10px] font-sans text-emerald-500/70 font-semibold uppercase">CPU</span>
                </div>
                <div className={cn("text-[11px] sm:text-xs font-mono font-medium", isBlueprint ? "text-slate-500" : "text-zinc-400")}>
                  RAM {summary.avg_mem.toFixed(1)}%
                </div>
              </div>
              {/* Dual mini progress bar */}
              <div className="mt-1.5 sm:mt-2 grid grid-cols-2 gap-1.5 sm:gap-2">
                <div className={`h-1 rounded-full overflow-hidden ${isBlueprint ? "bg-slate-200/80" : "bg-zinc-800"}`} title={`CPU: ${summary.avg_cpu.toFixed(1)}%`}>
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, summary.avg_cpu))}%` }}
                  />
                </div>
                <div className={`h-1 rounded-full overflow-hidden ${isBlueprint ? "bg-slate-200/80" : "bg-zinc-800"}`} title={`RAM: ${summary.avg_mem.toFixed(1)}%`}>
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, summary.avg_mem))}%` }}
                  />
                </div>
              </div>
            </BlurFade>
          </div>

          {/* Row 3: Search, Region Filter Chips & View Mode */}
          {/* Mobile view (< sm): Two dedicated clean rows */}
          <div className="mt-3 flex flex-col gap-2 sm:hidden">
            {/* Mobile Top Row: Search Input + View Mode Toggle */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className={`absolute left-3 top-2.5 h-4 w-4 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`} />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="搜索主机名称、ID 或 IP..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className={`w-full rounded-xl border pl-9 pr-8 py-1.5 text-xs font-sans focus:outline-none transition-all ${
                    isBlueprint
                      ? "bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500 shadow-xs"
                      : "bg-zinc-900/80 border-white/[0.08] text-zinc-100 placeholder-zinc-500 focus:border-indigo-500"
                  }`}
                />
                {searchQuery && (
                  <button
                    onClick={() => onSearchChange("")}
                    className={`absolute right-2.5 top-2 p-0.5 rounded-md ${
                      isBlueprint ? "text-slate-400 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-300"
                    } transition-colors cursor-pointer`}
                    title="清除搜索"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* View Mode Toggle */}
              <div
                className={`flex shrink-0 items-center rounded-xl border p-0.5 ${
                  isBlueprint
                    ? "border-slate-200/90 bg-slate-100 shadow-xs"
                    : "border-white/[0.08] bg-zinc-900/80 shadow-inner"
                }`}
              >
                <button
                  onClick={() => onViewModeChange("grid")}
                  className={`rounded-lg p-1.5 transition-all cursor-pointer active:scale-95 ${
                    viewMode === "grid"
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                      : isBlueprint
                      ? "text-slate-500"
                      : "text-zinc-400"
                  }`}
                  title="网格卡片视图"
                  aria-label="网格卡片视图"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onViewModeChange("table")}
                  className={`rounded-lg p-1.5 transition-all cursor-pointer active:scale-95 ${
                    viewMode === "table"
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                      : isBlueprint
                      ? "text-slate-500"
                      : "text-zinc-400"
                  }`}
                  title="表格机架视图"
                  aria-label="表格机架视图"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Mobile Bottom Row: Full-width dedicated region filter chips with smooth horizontal swipe */}
            <div className="flex items-center gap-1.5 font-mono text-xs overflow-x-auto py-0.5 no-scrollbar -mx-3 px-3 touch-pan-x">
              <button
                onClick={() => onRegionChange("ALL")}
                className={cn(
                  "rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 whitespace-nowrap shrink-0",
                  selectedRegion === "ALL"
                    ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/25"
                    : isBlueprint
                    ? "bg-white text-slate-600 hover:text-slate-900 border border-slate-200 shadow-xs"
                    : "bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-white/[0.08]"
                )}
              >
                <span>全部</span>
                <span
                  className={cn(
                    "px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-tight",
                    selectedRegion === "ALL"
                      ? "bg-white/20 text-white font-bold"
                      : isBlueprint
                      ? "bg-slate-100 text-slate-500"
                      : "bg-zinc-800 text-zinc-400"
                  )}
                >
                  {summary.total_nodes}
                </span>
              </button>
              {regions.map((reg) => {
                const count = regionCounts?.[reg];
                return (
                  <button
                    key={reg}
                    onClick={() => onRegionChange(reg)}
                    className={cn(
                      "rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 whitespace-nowrap shrink-0",
                      selectedRegion === reg
                        ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/25"
                        : isBlueprint
                        ? "bg-white text-slate-600 hover:text-slate-900 border border-slate-200 shadow-xs"
                        : "bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-white/[0.08]"
                    )}
                  >
                    <span className="text-sm leading-none">{getRegionFlag(reg)}</span>
                    <span className="leading-none uppercase">{reg}</span>
                    {count != null && (
                      <span
                        className={cn(
                          "px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-tight",
                          selectedRegion === reg
                            ? "bg-white/20 text-white font-bold"
                            : isBlueprint
                            ? "bg-slate-100 text-slate-500"
                            : "bg-zinc-800 text-zinc-400"
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop view (>= sm): Elegant single row with Search, Region Chips & View Mode */}
          <div className="mt-3.5 hidden sm:flex items-center gap-2.5">
            {/* Search Bar with Shortcut Hint */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className={`absolute left-3 top-2.5 h-4 w-4 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="搜索主机名称、节点 ID 或 IP..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className={`w-full rounded-xl border pl-9 pr-14 py-1.5 text-xs font-sans focus:outline-none transition-all ${
                  isBlueprint
                    ? "bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 shadow-xs"
                    : "bg-zinc-900/80 border-white/[0.08] text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                }`}
              />
              <div className="absolute right-2.5 top-2 flex items-center gap-1">
                {searchQuery ? (
                  <button
                    onClick={() => onSearchChange("")}
                    className={`p-0.5 rounded-md ${
                      isBlueprint ? "text-slate-400 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-300"
                    } transition-colors cursor-pointer`}
                    title="清除搜索"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <kbd
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono leading-none border ${
                      isBlueprint
                        ? "bg-slate-100 text-slate-400 border-slate-200"
                        : "bg-zinc-800/80 text-zinc-500 border-zinc-700/60"
                    }`}
                    title="按 / 聚焦搜索"
                  >
                    /
                  </kbd>
                )}
              </div>
            </div>

            {/* Region Filter Chips */}
            <div className="flex flex-1 items-center justify-end gap-1.5 font-mono text-xs overflow-x-auto py-0.5 no-scrollbar">
              <button
                onClick={() => onRegionChange("ALL")}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-medium transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 whitespace-nowrap",
                  selectedRegion === "ALL"
                    ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/25"
                    : isBlueprint
                    ? "bg-white text-slate-600 hover:text-slate-900 border border-slate-200 shadow-xs hover:border-slate-300"
                    : "bg-zinc-900/70 text-zinc-400 hover:text-zinc-200 border border-white/[0.08] hover:border-white/[0.16]"
                )}
              >
                <span>ALL REGIONS</span>
                <span
                  className={cn(
                    "px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-tight",
                    selectedRegion === "ALL"
                      ? "bg-white/20 text-white font-bold"
                      : isBlueprint
                      ? "bg-slate-100 text-slate-500"
                      : "bg-zinc-800 text-zinc-400"
                  )}
                >
                  {summary.total_nodes}
                </span>
              </button>
              {regions.map((reg) => {
                const count = regionCounts?.[reg];
                return (
                  <button
                    key={reg}
                    onClick={() => onRegionChange(reg)}
                    className={cn(
                      "rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 whitespace-nowrap",
                      selectedRegion === reg
                        ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/25"
                        : isBlueprint
                        ? "bg-white text-slate-600 hover:text-slate-900 border border-slate-200 shadow-xs hover:border-slate-300"
                        : "bg-zinc-900/70 text-zinc-400 hover:text-zinc-200 border border-white/[0.08] hover:border-white/[0.16]"
                    )}
                  >
                    <span className="text-sm leading-none">{getRegionFlag(reg)}</span>
                    <span className="leading-none uppercase">{reg}</span>
                    {count != null && (
                      <span
                        className={cn(
                          "px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-tight",
                          selectedRegion === reg
                            ? "bg-white/20 text-white font-bold"
                            : isBlueprint
                            ? "bg-slate-100 text-slate-500"
                            : "bg-zinc-800 text-zinc-400"
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* View Mode Toggle: Grid vs Table */}
            <div
              className={`flex shrink-0 items-center rounded-xl border p-0.5 ${
                isBlueprint
                  ? "border-slate-200/90 bg-slate-100 shadow-xs"
                  : "border-white/[0.08] bg-zinc-900/80 shadow-inner"
              }`}
            >
              <button
                onClick={() => onViewModeChange("grid")}
                className={`rounded-lg p-1.5 transition-all cursor-pointer active:scale-95 ${
                  viewMode === "grid"
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                    : isBlueprint
                    ? "text-slate-500 hover:text-slate-900"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="网格卡片视图"
                aria-label="网格卡片视图"
                aria-pressed={viewMode === "grid"}
              >
                <LayoutGrid className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
              <button
                onClick={() => onViewModeChange("table")}
                className={`rounded-lg p-1.5 transition-all cursor-pointer active:scale-95 ${
                  viewMode === "table"
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                    : isBlueprint
                    ? "text-slate-500 hover:text-slate-900"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="表格机架视图"
                aria-label="表格机架视图"
                aria-pressed={viewMode === "table"}
              >
                <List className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

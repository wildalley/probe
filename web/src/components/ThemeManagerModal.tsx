import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Palette,
  Check,
  Sun,
  Moon,
  Laptop,
  Boxes,
  ArrowRight,
  ShieldCheck,
  Activity,
  ShoppingBag,
  Download,
  Trash2,
  ExternalLink,
  RefreshCw,
  Upload,
  Link as LinkIcon,
  AlertCircle,
  CheckCircle2,
  Search,
  FolderDown,
  RotateCcw,
  Globe,
  Sparkles,
} from "lucide-react";
import { ThemePreset, ColorMode, ThemeMode, KomariTheme, ThemesResponse, ThemeMarketResponse } from "../types";
import { cn } from "../lib/utils";

export interface ThemeManagerPanelProps {
  currentPreset: ThemePreset;
  onSelectPreset: (preset: ThemePreset) => void;
  colorMode: ColorMode;
  onSelectColorMode: (mode: ColorMode) => void;
  theme: ThemeMode;
  onClose?: () => void;
  isEmbedded?: boolean;
  canManage?: boolean;
}

export interface ThemeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPreset: ThemePreset;
  onSelectPreset: (preset: ThemePreset) => void;
  colorMode: ColorMode;
  onSelectColorMode: (mode: ColorMode) => void;
  theme: ThemeMode;
  canManage?: boolean;
}

export const ThemeManagerPanel: React.FC<ThemeManagerPanelProps> = ({
  currentPreset,
  onSelectPreset,
  colorMode,
  onSelectColorMode,
  theme,
  onClose,
  isEmbedded = false,
  canManage = true,
}) => {
  const [activeTab, setActiveTab] = useState<"builtin" | "installed" | "market" | "import">("builtin");
  const [installedThemes, setInstalledThemes] = useState<KomariTheme[]>([]);
  const [activeBackendTheme, setActiveBackendTheme] = useState<string>("builtin");
  const [marketThemes, setMarketThemes] = useState<KomariTheme[]>([]);
  const [isLoadingMarket, setIsLoadingMarket] = useState(false);
  const [isLoadingInstalled, setIsLoadingInstalled] = useState(false);
  const [marketSearch, setMarketSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [customZipUrl, setCustomZipUrl] = useState("");
  const [statusNotice, setStatusNotice] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch installed themes and active theme
  const fetchInstalledThemes = async () => {
    setIsLoadingInstalled(true);
    try {
      const res = await fetch("/api/v1/themes", { credentials: "include" });
      if (res.ok) {
        const data: ThemesResponse = await res.json();
        setInstalledThemes(data.installed || []);
        setActiveBackendTheme(data.active || "builtin");
      }
    } catch (err) {
      console.error("Failed to fetch installed themes:", err);
    } finally {
      setIsLoadingInstalled(false);
    }
  };

  // Fetch official Komari theme market
  const fetchMarketThemes = async () => {
    setIsLoadingMarket(true);
    try {
      const res = await fetch("/api/v1/themes/market", { credentials: "include" });
      if (res.ok) {
        const data: ThemeMarketResponse = await res.json();
        setMarketThemes(data.themes || []);
      } else {
        setStatusNotice({ message: "获取 Komari 主题市场目录失败，请检查网络连接", type: "error" });
      }
    } catch (err) {
      console.error("Failed to fetch market themes:", err);
      setStatusNotice({ message: "无法连接至主题市场服务", type: "error" });
    } finally {
      setIsLoadingMarket(false);
    }
  };

  useEffect(() => {
    fetchInstalledThemes();
  }, []);

  useEffect(() => {
    if (activeTab === "market" && marketThemes.length === 0) {
      fetchMarketThemes();
    }
  }, [activeTab]);

  // Activate theme (builtin or komari short name)
  const handleActivateTheme = async (themeIdentifier: string) => {
    if (!canManage) {
      setStatusNotice({
        message: "当前为访客模式，修改前台全站生效主题需要先登录管理后台 (/admin)",
        type: "error",
      });
      return;
    }
    const key = `activate-${themeIdentifier}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    setStatusNotice(null);
    try {
      const res = await fetch("/api/v1/themes/active", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: themeIdentifier }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setActiveBackendTheme(themeIdentifier);
        const isOnRoot = window.location.pathname === "/" || window.location.pathname === "";
        if (isOnRoot) {
          setStatusNotice({
            message: themeIdentifier === "builtin"
              ? "已恢复为 Probe 原生内置控制台！正在刷新前台主页..."
              : `主题「${themeIdentifier}」已生效！正在刷新前台主页...`,
            type: "success",
          });
          setTimeout(async () => {
            try {
              if ("serviceWorker" in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const reg of regs) await reg.unregister();
              }
              if ("caches" in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
              }
            } catch (_) {}
            window.location.href = "/?_t=" + Date.now();
          }, 500);
        } else {
          try {
            if ("serviceWorker" in navigator) {
              navigator.serviceWorker.getRegistrations().then((regs) => {
                for (const reg of regs) reg.unregister();
              });
            }
          } catch (_) {}
          setStatusNotice({
            message: themeIdentifier === "builtin"
              ? "已恢复为 Probe 原生内置控制台！已生效至前台主页"
              : `主题「${themeIdentifier}」已生效至前台主页！`,
            type: "success",
          });
          await fetchInstalledThemes();
        }
      } else {
        if (res.status === 401) {
          setStatusNotice({
            message: "操作失败：权限不足或登录已过期，请前往管理后台登录后再切换主题",
            type: "error",
          });
        } else {
          setStatusNotice({ message: data.error || "切换主题失败", type: "error" });
        }
      }
    } catch (err: any) {
      setStatusNotice({ message: err.message || "请求失败", type: "error" });
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Install theme from market or URL
  const handleInstallTheme = async (downloadUrl: string, themeName?: string) => {
    if (!canManage) {
      setStatusNotice({
        message: "当前为访客模式，安装主题需要先登录管理后台 (/admin)",
        type: "error",
      });
      return;
    }
    const key = `install-${downloadUrl}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    setStatusNotice({ message: `正在下载并解压「${themeName || "主题包"}」，请稍候...`, type: "info" });
    try {
      const res = await fetch("/api/v1/themes/install", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: downloadUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatusNotice({
          message: `主题「${data.theme?.name || themeName || "主题"}」安装成功！`,
          type: "success",
        });
        await fetchInstalledThemes();
        if (marketThemes.length > 0) {
          await fetchMarketThemes();
        }
      } else {
        if (res.status === 401) {
          setStatusNotice({ message: "操作失败：权限不足或登录已过期，请前往管理后台登录", type: "error" });
        } else {
          setStatusNotice({ message: data.error || "主题安装失败", type: "error" });
        }
      }
    } catch (err: any) {
      setStatusNotice({ message: err.message || "下载解压失败", type: "error" });
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Upload local theme zip
  const handleUploadZip = async (file: File) => {
    if (!canManage) {
      setStatusNotice({
        message: "当前为访客模式，上传主题需要先登录管理后台 (/admin)",
        type: "error",
      });
      return;
    }
    const key = "upload-zip";
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    setStatusNotice({ message: `正在上传解包「${file.name}」...`, type: "info" });
    try {
      const formData = new FormData();
      formData.append("theme", file);
      const res = await fetch("/api/v1/themes/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatusNotice({
          message: `主题「${data.theme?.name || "自定义主题"}」上传安装成功！`,
          type: "success",
        });
        await fetchInstalledThemes();
        setActiveTab("installed");
      } else {
        if (res.status === 401) {
          setStatusNotice({ message: "操作失败：权限不足或登录已过期，请前往管理后台登录", type: "error" });
        } else {
          setStatusNotice({ message: data.error || "上传安装失败", type: "error" });
        }
      }
    } catch (err: any) {
      setStatusNotice({ message: err.message || "网络传输异常", type: "error" });
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Delete installed theme
  const handleDeleteTheme = async (short: string, themeName: string) => {
    if (!canManage) {
      setStatusNotice({
        message: "当前为访客模式，卸载主题需要先登录管理后台 (/admin)",
        type: "error",
      });
      return;
    }
    if (!window.confirm(`确定要彻底卸载并删除主题「${themeName}」吗？`)) return;
    const key = `delete-${short}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`/api/v1/themes/${encodeURIComponent(short)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatusNotice({ message: `主题「${themeName}」已成功卸载`, type: "success" });
        await fetchInstalledThemes();
        if (marketThemes.length > 0) {
          await fetchMarketThemes();
        }
      } else {
        if (res.status === 401) {
          setStatusNotice({ message: "操作失败：权限不足或登录已过期，请前往管理后台登录", type: "error" });
        } else {
          setStatusNotice({ message: data.error || "卸载失败", type: "error" });
        }
      }
    } catch (err: any) {
      setStatusNotice({ message: err.message || "删除异常", type: "error" });
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const themes: Array<{
    id: ThemePreset;
    name: string;
    subname: string;
    badges: string[];
    description: string;
    preview: React.ReactNode;
  }> = [
    {
      id: "btop",
      name: "btop++ 极客终端",
      subname: "Authentic Terminal (Probe 官方默认)",
      badges: ["官方默认", "终端字符画", "离散量表", "火花线谱"],
      description: "极致还原原生 Linux btop++ 终端监控体验。全等宽排版、四象限模块布局、高密度状态树与多网卡实时吞吐字符谱。",
      preview: (
        <div className="relative h-28 w-full overflow-hidden rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] p-2.5 font-mono text-10 text-[var(--nezha-ink)]">
          <div className="flex items-center justify-between border-b border-[var(--nezha-line-soft)] pb-1 text-9">
            <div className="flex items-center gap-1.5 text-[var(--nezha-accent)] font-bold">
              <span>btop++ v1.4.0</span>
            </div>
            <div className="flex items-center gap-1 text-8 text-[var(--nezha-ink-3)]">
              <span className="text-[var(--nezha-accent)]">[1]CPU</span>
              <span className="text-cyan-500">[2]MEM</span>
              <span className="text-emerald-500">[3]NET</span>
            </div>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-9">
            <div className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] p-1">
              <div className="flex justify-between text-[var(--nezha-accent)] font-bold">
                <span>CPU: 24%</span>
                <span className="text-[var(--nezha-ink-3)] text-8">4.2GHz</span>
              </div>
              <div className="mt-1 text-8 text-[var(--nezha-accent-ink)] tracking-tighter">
                ⡇⡎⡍⣹⣽⣻⣷⣾⣿⣿
              </div>
            </div>
            <div className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] p-1">
              <div className="flex justify-between text-cyan-500 font-bold">
                <span>MEM: 3.8G</span>
                <span className="text-[var(--nezha-ink-3)] text-8">/16G</span>
              </div>
              <div className="mt-1 flex gap-0.5">
                <div className="h-2 w-3/5 bg-[var(--nezha-accent)]" />
                <div className="h-2 w-2/5 bg-[var(--nezha-track)]" />
              </div>
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-8 text-[var(--nezha-ink-3)]">
            <span>UP: 4.8 MB/s · DOWN: 18.2 MB/s</span>
            <span className="text-[var(--nezha-accent)] font-bold">0.45 0.52 0.48</span>
          </div>
        </div>
      ),
    },
  ];

  const colorModes: Array<{
    id: ColorMode;
    title: string;
    desc: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "light",
      title: "浅色模式",
      desc: "清爽高对比度，适合日光或明亮环境",
      icon: <Sun className="h-3.5 w-3.5" />,
    },
    {
      id: "dark",
      title: "深色模式",
      desc: "极客低噪点暗色，护眼且专注",
      icon: <Moon className="h-3.5 w-3.5" />,
    },
    {
      id: "system",
      title: "跟随系统",
      desc: "自动同步操作系统深色/浅色偏好",
      icon: <Laptop className="h-3.5 w-3.5" />,
    },
  ];

  const filteredMarket = marketThemes.filter((t) => {
    if (!marketSearch.trim()) return true;
    const q = marketSearch.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.short.toLowerCase().includes(q) ||
      t.author.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className={cn(
        "relative w-full flex flex-col font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] transition-colors",
        !isEmbedded && "flex-1 overflow-hidden"
      )}
    >
      {/* Top Banner (when embedded inside Admin tab) */}
      {isEmbedded && (
        <div className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-3 border-b border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-accent)] flex items-center justify-center shrink-0">
              <Palette className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold font-mono tracking-tight text-[var(--nezha-ink)]">
                  [03] 探针主题与扩展中心 THEMES & EXTENSIONS
                </h3>
                <span className="px-1.5 py-0.2 rounded-none text-10 font-mono font-bold bg-[var(--nezha-accent)] text-[#141414] shrink-0">
                  KOMARI COMPATIBLE
                </span>
              </div>
              <p className="text-xs font-mono text-[var(--nezha-ink-3)] mt-0.5">
                原生极客终端/卡片 · 支持热插拔 Komari 社区主题包 · 实时生效
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="h-7 px-2.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-xs font-mono font-bold text-[var(--nezha-ink)] flex items-center gap-1.5">
              <span className="text-[var(--nezha-ink-3)]">根路径 (/) 生效:</span>
              {activeBackendTheme === "builtin" ? (
                <span className="text-emerald-500 font-bold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-none bg-emerald-500 animate-pulse" />
                  原生控制台
                </span>
              ) : (
                <span className="text-[var(--nezha-accent)] font-bold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-none bg-[var(--nezha-accent)] animate-pulse" />
                  {activeBackendTheme}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => fetchInstalledThemes()}
              className="h-7 w-7 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] flex items-center justify-center cursor-pointer transition-colors"
              title="刷新主题列表"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoadingInstalled && "animate-spin text-[var(--nezha-accent)]")} />
            </button>
          </div>
        </div>
      )}

      {/* Global Color Mode Selector Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-2.5 border-b border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-xs font-mono shrink-0 gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[var(--nezha-ink-3)] font-bold">界面明暗偏好:</span>
          <div className="flex items-center gap-1">
            {colorModes.map((mode) => {
              const isActive = colorMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onSelectColorMode(mode.id)}
                  className={cn(
                    "h-7 px-2.5 flex items-center gap-1.5 rounded-none text-11 font-mono font-bold transition-all cursor-pointer",
                    isActive
                      ? "bg-[var(--nezha-accent)] text-[#141414] border border-[#141414]/20"
                      : "border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] hover:border-[var(--nezha-ink)]"
                  )}
                >
                  {mode.icon}
                  <span>{mode.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {activeBackendTheme !== "builtin" && (
          <button
            type="button"
            onClick={() => handleActivateTheme("builtin")}
            disabled={actionLoading["activate-builtin"]}
            className="h-7 px-2.5 rounded-none border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className={cn("h-3 w-3", actionLoading["activate-builtin"] && "animate-spin")} />
            <span>一键恢复原生前台</span>
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center px-4 sm:px-6 border-b border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] shrink-0 gap-1 overflow-x-auto no-scrollbar font-mono">
        {[
          { key: "builtin", label: "🎨 原生精选 (Built-in)", icon: Sparkles },
          { key: "installed", label: "📦 已安装主题 (Installed)", count: installedThemes.length, icon: Boxes },
          { key: "market", label: "🛒 Komari 官方主题市场 (Market)", count: marketThemes.length, icon: ShoppingBag },
          { key: "import", label: "➕ 导入与自定义 (Import)", icon: FolderDown },
        ].map(({ key, label, count, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key as any)}
            className={cn(
              "h-10 px-3.5 flex items-center gap-1.5 text-xs font-mono font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap rounded-none",
              activeTab === key
                ? "border-[var(--nezha-accent)] text-[var(--nezha-ink)] bg-[var(--nezha-panel)]"
                : "border-transparent text-[var(--nezha-ink-2)] hover:text-[var(--nezha-ink)]"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
            {count !== undefined && count > 0 && (
              <span className="px-1.5 py-0.2 rounded-none text-10 font-mono font-bold bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] border border-[var(--nezha-line)]">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Global Toast / Status Banner */}
      {statusNotice && (
        <div
          className={cn(
            "px-4 sm:px-6 py-2.5 flex items-center justify-between text-xs font-mono font-bold border-b transition-all",
            statusNotice.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
              : statusNotice.type === "error"
              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
              : "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30"
          )}
        >
          <div className="flex items-center gap-2">
            {statusNotice.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : statusNotice.type === "error" ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
            ) : (
              <Activity className="h-4 w-4 shrink-0 animate-spin text-sky-500" />
            )}
            <span>{statusNotice.message}</span>
            {statusNotice.type === "success" && (
              <a
                href={`/?_t=${Date.now()}`}
                target="_blank"
                rel="noreferrer"
                className="ml-2 underline text-[var(--nezha-accent)] hover:text-[#E54D16]"
              >
                新窗口打开前台预览 →
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="p-1 text-[var(--nezha-ink-3)] hover:text-[var(--nezha-ink)] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Body Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 font-mono">
        {/* TAB 1: BUILT-IN PRESETS */}
        {activeTab === "builtin" && (
          <div className="space-y-5">
            {activeBackendTheme !== "builtin" && (
              <div className="p-3.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2.5">
                  <Globe className="h-4 w-4 text-[var(--nezha-accent)] shrink-0" />
                  <span className="text-[var(--nezha-ink)]">
                    当前根路径 <code className="font-mono font-bold text-[var(--nezha-accent)]">/</code> 正由 Komari 社区主题{" "}
                    <strong className="text-[var(--nezha-accent)]">{activeBackendTheme}</strong> 接管。内置控制台在{" "}
                    <code>/admin</code> 与 <code>/terminal</code> 保持独立运行。
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleActivateTheme("builtin")}
                  disabled={actionLoading["activate-builtin"]}
                  className="h-7 px-3 rounded-none text-xs font-mono font-bold bg-[var(--nezha-accent)] hover:bg-[#E54D16] text-[#141414] border border-[#141414]/20 transition-all cursor-pointer shrink-0"
                >
                  设为前台主页
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {themes.map((t) => {
                const isSelected = currentPreset === t.id && activeBackendTheme === "builtin";
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      onSelectPreset(t.id);
                      if (activeBackendTheme !== "builtin") {
                        handleActivateTheme("builtin");
                      }
                    }}
                    className={cn(
                      "relative flex flex-col justify-between rounded-none border p-4 transition-all cursor-pointer font-mono",
                      isSelected
                        ? "border-[var(--nezha-accent)] bg-[var(--nezha-panel)] ring-1 ring-[var(--nezha-accent)] shadow-none"
                        : "border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)]"
                    )}
                  >
                    {isSelected && (
                      <div className="absolute top-0 right-0 px-2 py-0.5 rounded-none bg-[var(--nezha-accent)] text-[#141414] text-10 font-mono font-bold">
                        当前使用中
                      </div>
                    )}

                    <div className="space-y-3">
                      {t.preview}

                      <div>
                        <h3 className="font-bold text-sm text-[var(--nezha-ink)]">{t.name}</h3>
                        <p className="text-11 font-mono text-[var(--nezha-accent-ink)] mt-0.5">{t.subname}</p>
                        <p className="mt-2 text-xs text-[var(--nezha-ink-3)] leading-relaxed">
                          {t.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[var(--nezha-line)] flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {t.badges.map((b) => (
                          <span
                            key={b}
                            className="text-9 px-1.5 py-0.2 rounded-none font-mono border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink-2)]"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                      <span
                        className={cn(
                          "text-xs font-mono font-bold",
                          isSelected ? "text-[var(--nezha-accent)]" : "text-[var(--nezha-ink-3)]"
                        )}
                      >
                        {isSelected ? "● 已生效" : "点击应用"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Market Promo Banner */}
            <div className="p-4 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-accent)] flex items-center justify-center shrink-0">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[var(--nezha-ink)]">想要探索更多精美监控主题？</h4>
                  <p className="text-11 mt-0.5 text-[var(--nezha-ink-3)]">
                    Nezha (哪吒)、ServerStatus、Ran (岚)、Zen 等 Komari 官方社区主题均可一键安装即刻体验。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("market")}
                className="h-8 px-4 rounded-none text-xs font-mono font-bold bg-[var(--nezha-accent)] hover:bg-[#E54D16] text-[#141414] border border-[#141414]/20 flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
              >
                <span>前往主题市场</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: INSTALLED THEMES */}
        {activeTab === "installed" && (
          <div className="space-y-4 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--nezha-ink-3)]">
                本地目录{" "}
                <code className="font-mono px-1.5 py-0.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)]">
                  ./themes/
                </code>{" "}
                中已解压并验证通过的 Komari 主题
              </span>
              <button
                type="button"
                onClick={fetchInstalledThemes}
                disabled={isLoadingInstalled}
                className="h-7 px-2.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={cn("h-3 w-3", isLoadingInstalled && "animate-spin text-[var(--nezha-accent)]")} />
                <span>刷新</span>
              </button>
            </div>

            {installedThemes.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 rounded-none border border-dashed border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink-3)]">
                <Boxes className="h-10 w-10 text-[var(--nezha-ink-3)]" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-[var(--nezha-ink)]">暂无外部安装的主题</p>
                  <p className="text-xs max-w-sm text-[var(--nezha-ink-3)]">
                    当前探针正由原生内置控制台渲染。您可以前往「Komari 官方主题市场」一键安装社区精选主题。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("market")}
                  className="mt-2 h-8 px-4 rounded-none bg-[var(--nezha-accent)] hover:bg-[#E54D16] text-[#141414] text-xs font-bold transition-all cursor-pointer"
                >
                  浏览主题市场
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {installedThemes.map((th) => {
                  const isActive = activeBackendTheme === th.short;
                  const isActivating = actionLoading[`activate-${th.short}`];
                  const isDeleting = actionLoading[`delete-${th.short}`];

                  return (
                    <div
                      key={th.short}
                      className={cn(
                        "flex flex-col justify-between rounded-none border p-4 transition-all font-mono",
                        isActive
                          ? "border-[var(--nezha-accent)] bg-[var(--nezha-panel)] ring-1 ring-[var(--nezha-accent)] shadow-none"
                          : "border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)]"
                      )}
                    >
                      <div className="space-y-3">
                        {/* Preview image */}
                        <div className="relative h-32 w-full overflow-hidden rounded-none flex items-center justify-center border border-[var(--nezha-line)] bg-[var(--nezha-panel)]">
                          {th.preview ? (
                            <img
                              src={th.preview}
                              alt={th.name}
                              className="h-full w-full object-cover object-top"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <Palette className="h-8 w-8 text-[var(--nezha-ink-3)]" />
                          )}
                          {isActive && (
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-none bg-[var(--nezha-accent)] text-[#141414] text-10 font-bold font-mono">
                              根路径生效中
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-sm text-[var(--nezha-ink)]">{th.name}</h4>
                            <span className="text-10 font-mono font-bold text-[var(--nezha-accent)]">
                              v{th.version}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-11 font-mono text-[var(--nezha-ink-3)]">
                            <span>作者: {th.author || "社区贡献者"}</span>
                            <span>·</span>
                            <span>ID: {th.short}</span>
                          </div>
                          <p className="text-xs mt-2 line-clamp-2 text-[var(--nezha-ink-3)]">
                            {th.description}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-4 pt-3 border-t border-[var(--nezha-line)] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isActive ? (
                            <a
                              href={"/?_t=" + Date.now()}
                              onClick={(e) => {
                                e.currentTarget.href = "/?_t=" + Date.now();
                              }}
                              target="_blank"
                              rel="noreferrer"
                              className="h-7 px-2.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] hover:border-[var(--nezha-ink)] flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span>新窗口预览</span>
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleActivateTheme(th.short)}
                              disabled={isActivating}
                              className="h-7 px-3 rounded-none text-xs font-mono font-bold bg-[var(--nezha-accent)] hover:bg-[#E54D16] text-[#141414] border border-[#141414]/20 transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              {isActivating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              <span>设为生效</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {th.short === "btop-terminal" && (
                            <a
                              href="/themes/btop-terminal.zip"
                              download="btop-terminal.zip"
                              className="h-7 px-2 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] text-11 font-bold flex items-center gap-1 transition-colors"
                              title="导出独立插件安装包"
                            >
                              <Download className="h-3 w-3" />
                              <span>导出ZIP</span>
                            </a>
                          )}
                          {th.url && (
                            <a
                              href={th.url}
                              target="_blank"
                              rel="noreferrer"
                              className="h-7 w-7 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] flex items-center justify-center transition-colors"
                              title="查看 GitHub 仓库"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteTheme(th.short, th.name)}
                            disabled={isDeleting || isActive}
                            className={cn(
                              "h-7 w-7 rounded-none border border-rose-500/30 text-rose-500 flex items-center justify-center transition-colors",
                              isActive
                                ? "opacity-30 cursor-not-allowed"
                                : "hover:bg-rose-500/10 cursor-pointer"
                            )}
                            title={isActive ? "生效中主题不可删除" : "卸载此主题"}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: KOMARI MARKET */}
        {activeTab === "market" && (
          <div className="space-y-4 font-mono">
            {/* Market toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--nezha-ink-3)]" />
                <input
                  type="text"
                  placeholder="在 Komari 官方市场中搜索主题名称、作者、关键字..."
                  value={marketSearch}
                  onChange={(e) => setMarketSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-xs font-mono rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] placeholder-[var(--nezha-ink-3)] focus:border-[var(--nezha-accent)] focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-11 font-mono text-[var(--nezha-ink-3)]">
                  共 {marketThemes.length} 款社区主题
                </span>
                <button
                  type="button"
                  onClick={fetchMarketThemes}
                  disabled={isLoadingMarket}
                  className="h-8 px-3 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={cn("h-3 w-3", isLoadingMarket && "animate-spin text-[var(--nezha-accent)]")} />
                  <span>刷新市场</span>
                </button>
              </div>
            </div>

            {isLoadingMarket ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-2 text-[var(--nezha-ink-3)] font-mono">
                <RefreshCw className="h-8 w-8 animate-spin text-[var(--nezha-accent)]" />
                <p className="text-xs">正在从 Komari 官方仓库同步主题市场列表...</p>
              </div>
            ) : filteredMarket.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--nezha-ink-3)] font-mono">
                未找到符合搜索条件的主题
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMarket.map((th) => {
                  const isInstalled = installedThemes.some((it) => it.short.toLowerCase() === th.short.toLowerCase());
                  const isActive = activeBackendTheme.toLowerCase() === th.short.toLowerCase();
                  const isInstalling = actionLoading[`install-${th.download}`];

                  return (
                    <div
                      key={th.short}
                      className={cn(
                        "flex flex-col justify-between rounded-none border p-3.5 transition-all font-mono",
                        isActive
                          ? "border-[var(--nezha-accent)] bg-[var(--nezha-panel)] ring-1 ring-[var(--nezha-accent)] shadow-none"
                          : "border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)]"
                      )}
                    >
                      <div className="space-y-2.5">
                        {/* Preview image */}
                        <div className="relative h-28 w-full overflow-hidden rounded-none flex items-center justify-center border border-[var(--nezha-line)] bg-[var(--nezha-panel)]">
                          {th.preview ? (
                            <img
                              src={th.preview}
                              alt={th.name}
                              className="h-full w-full object-cover object-top"
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <Palette className="h-6 w-6 text-[var(--nezha-ink-3)]" />
                          )}
                          {isActive && (
                            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.2 rounded-none bg-[var(--nezha-accent)] text-[#141414] text-9 font-bold font-mono">
                              当前生效
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-xs truncate max-w-[160px] text-[var(--nezha-ink)]" title={th.name}>
                              {th.name}
                            </h4>
                            <span className="text-10 font-mono font-bold text-[var(--nezha-accent)]">
                              v{th.version}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-10 font-mono mt-0.5 text-[var(--nezha-ink-3)]">
                            <span className="truncate max-w-[120px]">@{th.author}</span>
                            {th.url && (
                              <a
                                href={th.url}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:underline text-[var(--nezha-accent)] inline-flex items-center gap-0.5"
                              >
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                          <p className="text-11 mt-1.5 line-clamp-2 leading-relaxed text-[var(--nezha-ink-3)]">
                            {th.description}
                          </p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-3 pt-2.5 border-t border-[var(--nezha-line)] flex items-center justify-between">
                        <span className="text-10 font-mono text-[var(--nezha-ink-3)]">{th.short}</span>
                        {isActive ? (
                          <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                            <Check className="h-3 w-3" /> 根路径生效中
                          </span>
                        ) : isInstalled ? (
                          <button
                            type="button"
                            onClick={() => handleActivateTheme(th.short)}
                            disabled={actionLoading[`activate-${th.short}`]}
                            className="h-7 px-2.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] text-xs font-bold hover:border-[var(--nezha-ink)] flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Check className="h-3 w-3 text-[var(--nezha-accent)]" />
                            <span>设为生效</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleInstallTheme(th.download || "", th.name)}
                            disabled={isInstalling || !th.download}
                            className="h-7 px-3 rounded-none text-xs font-mono font-bold bg-[var(--nezha-accent)] hover:bg-[#E54D16] text-[#141414] border border-[#141414]/20 flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            {isInstalling ? (
                              <>
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                <span>下载解压中...</span>
                              </>
                            ) : (
                              <>
                                <Download className="h-3 w-3" />
                                <span>一键安装</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: IMPORT / CUSTOM */}
        {activeTab === "import" && (
          <div className="space-y-5 max-w-2xl mx-auto py-2 font-mono">
            <div className="p-4 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm text-[var(--nezha-ink)]">
                <LinkIcon className="h-4 w-4 text-[var(--nezha-accent)]" />
                <span>方式一：从远程 ZIP 链接一键拉取安装</span>
              </div>
              <p className="text-xs text-[var(--nezha-ink-3)]">
                输入任何开源 Komari 主题的 GitHub Releases 或 CDN 直链 ZIP 文件包：
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  placeholder="https://github.com/username/repo/releases/download/.../theme.zip"
                  value={customZipUrl}
                  onChange={(e) => setCustomZipUrl(e.target.value)}
                  className="flex-1 h-8 px-3 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] placeholder-[var(--nezha-ink-3)] font-mono text-xs focus:border-[var(--nezha-accent)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!customZipUrl.trim()) return;
                    handleInstallTheme(customZipUrl.trim(), "自定义直链主题");
                  }}
                  disabled={!customZipUrl.trim() || actionLoading[`install-${customZipUrl.trim()}`]}
                  className="h-8 px-4 rounded-none bg-[var(--nezha-accent)] hover:bg-[#E54D16] text-[#141414] text-xs font-mono font-bold border border-[#141414]/20 cursor-pointer disabled:opacity-50 transition-colors shrink-0"
                >
                  开始安装
                </button>
              </div>
            </div>

            <div className="p-4 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm text-[var(--nezha-ink)]">
                <Upload className="h-4 w-4 text-[var(--nezha-accent)]" />
                <span>方式二：上传本地主题 ZIP 压缩包</span>
              </div>
              <p className="text-xs text-[var(--nezha-ink-3)]">
                支持上传已打包好的 Komari 规范主题包（ZIP 根目录需包含{" "}
                <code className="font-mono text-[var(--nezha-accent)] font-bold">komari-theme.json</code> 与{" "}
                <code className="font-mono text-[var(--nezha-accent)] font-bold">dist/</code> 静态目录）：
              </p>

              <input
                type="file"
                ref={fileInputRef}
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadZip(file);
                }}
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-accent)] rounded-none p-8 text-center cursor-pointer transition-colors group"
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-[var(--nezha-ink-3)] group-hover:text-[var(--nezha-accent)] transition-colors" />
                <p className="text-xs font-bold text-[var(--nezha-ink)] group-hover:text-[var(--nezha-accent)] transition-colors">
                  点击选择或拖拽本地主题 ZIP 包至此处
                </p>
                <p className="text-11 mt-1 font-mono text-[var(--nezha-ink-3)]">
                  {actionLoading["upload-zip"] ? "正在解压并校验结构..." : "最大支持 50MB"}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-xs text-[var(--nezha-ink-3)] space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-[var(--nezha-ink)]">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>关于 Komari 主题标准兼容</span>
              </div>
              <p>
                Probe 后端完全兼容 Komari REST 与 WebSocket 通信协议。安装的主题可以直接通过{" "}
                <code className="font-mono font-bold text-[var(--nezha-ink)]">/api/public</code> 与{" "}
                <code className="font-mono font-bold text-[var(--nezha-ink)]">/api/nodes</code> 获取实时服务器监控数据，且始终保障{" "}
                <code className="font-mono font-bold text-[var(--nezha-ink)]">/admin</code> 原生控制台安全可用。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] shrink-0 font-mono text-xs">
        <div className="text-xs font-mono">
          <span className="text-[var(--nezha-ink-3)]">当前方案: </span>
          <span className="font-bold text-[var(--nezha-ink)]">
            {activeBackendTheme !== "builtin"
              ? `Komari · ${activeBackendTheme}`
              : currentPreset === "btop"
              ? "📟 btop++ 极客终端 (官方默认)"
              : "🔷 经典卡片看板"}
          </span>
          <span className="text-[var(--nezha-ink-3)]"> · </span>
          <span className="text-[var(--nezha-ink-2)] font-bold">
            {colorMode === "light"
              ? "☼ 浅色模式"
              : colorMode === "dark"
              ? "☾ 深色模式"
              : "💻 跟随系统"}
          </span>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-none bg-[var(--nezha-accent)] hover:bg-[#E54D16] text-[#141414] text-xs font-mono font-bold border border-[#141414]/20 cursor-pointer transition-colors"
          >
            完成
          </button>
        )}
      </div>
    </div>
  );
};

export const ThemeManagerModal: React.FC<ThemeManagerModalProps> = ({
  isOpen,
  onClose,
  ...props
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 lg:p-6 bg-black/80 backdrop-blur-xs animate-fade-in font-mono">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-none shadow-2xl border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-accent)] flex items-center justify-center shrink-0">
              <Palette className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold font-mono tracking-tight text-[var(--nezha-ink)]">
                  [03] 探针主题与扩展中心 THEMES & EXTENSIONS
                </h2>
                <span className="px-1.5 py-0.2 rounded-none text-10 font-mono font-bold bg-[var(--nezha-accent)] text-[#141414] shrink-0">
                  KOMARI COMPATIBLE
                </span>
              </div>
              <p className="text-xs font-mono text-[var(--nezha-ink-3)] mt-0.5">
                原生极客终端/卡片 · 支持热插拔 Komari 社区主题包
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:bg-[var(--nezha-accent)] hover:text-[#141414] text-[var(--nezha-ink)] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ThemeManagerPanel {...props} onClose={onClose} isEmbedded={false} />
      </div>
    </div>
  );
};

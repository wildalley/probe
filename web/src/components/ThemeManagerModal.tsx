import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Palette,
  Check,
  Sun,
  Moon,
  Laptop,
  Terminal,
  Layers,
  Sparkles,
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
} from "lucide-react";
import { ThemePreset, ColorMode, ThemeMode, KomariTheme, ThemesResponse, ThemeMarketResponse } from "../types";

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

  const isDark = theme === "btop" || theme === "blueprint-dark" || theme === "dark";
  const isLight = !isDark;

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
          // Even if not on root, clean service workers in background
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
    accentColor: string;
    preview: React.ReactNode;
  }> = [
    {
      id: "btop",
      name: "btop++ 极客终端",
      subname: "Authentic Terminal (Probe 官方默认)",
      badges: ["官方默认", "终端字符画", "离散量表", "火花线谱"],
      description: "极致还原原生 Linux btop++ 终端监控体验。全等宽排版、四象限模块布局、高密度状态树与多网卡实时吞吐字符谱。",
      accentColor: "from-cyan-500 to-purple-500",
      preview: (
        <div className="relative h-28 w-full overflow-hidden rounded-lg border border-[#20293d] bg-[#0c0e17] p-2.5 font-mono text-[10px] text-slate-300">
          <div className="flex items-center justify-between border-b border-[#1f283d] pb-1 text-[9px]">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <span>btop++ v1.4.0</span>
            </div>
            <div className="flex items-center gap-1 text-[8px] text-slate-400">
              <span className="text-purple-400">[1]CPU</span>
              <span className="text-cyan-400">[2]MEM</span>
              <span className="text-emerald-400">[3]NET</span>
            </div>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[9px]">
            <div className="rounded border border-[#1b253b] bg-[#090d16] p-1">
              <div className="flex justify-between text-cyan-400 font-bold">
                <span>CPU: 24%</span>
                <span className="text-slate-500 text-[8px]">4.2GHz</span>
              </div>
              <div className="mt-1 text-[8px] text-cyan-300/70 tracking-tighter">
                ⡇⡎⡍⣹⣽⣻⣷⣾⣿⣿
              </div>
            </div>
            <div className="rounded border border-[#1b253b] bg-[#090d16] p-1">
              <div className="flex justify-between text-purple-400 font-bold">
                <span>MEM: 3.8G</span>
                <span className="text-slate-500 text-[8px]">/16G</span>
              </div>
              <div className="mt-1 flex gap-0.5">
                <div className="h-2 w-3/5 bg-purple-500 rounded-xs" />
                <div className="h-2 w-2/5 bg-slate-800 rounded-xs" />
              </div>
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[8px] text-slate-500">
            <span>UP: 4.8 MB/s · DOWN: 18.2 MB/s</span>
            <span className="text-cyan-400">0.45 0.52 0.48</span>
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
      icon: <Sun className="h-4 w-4 text-amber-500" />,
    },
    {
      id: "dark",
      title: "深色模式",
      desc: "极客低噪点暗色，护眼且专注",
      icon: <Moon className="h-4 w-4 text-indigo-400" />,
    },
    {
      id: "system",
      title: "跟随系统",
      desc: "自动同步操作系统深色/浅色偏好",
      icon: <Laptop className="h-4 w-4 text-cyan-400" />,
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
      className={`relative w-full flex flex-col transition-all duration-300 ${
        isEmbedded
          ? `rounded-2xl border ${
              isDark
                ? "bg-[#090d16] border-[#1b253b] text-slate-100"
                : "bg-white border-slate-200 text-slate-900 shadow-xs"
            }`
          : "flex-1 overflow-hidden"
      }`}
    >
      {isEmbedded && (
        <div
          className={`flex flex-wrap items-center justify-between px-4 sm:px-6 py-3.5 border-b gap-3 shrink-0 ${
            isDark ? "border-[#1b253b] bg-[#070a12]/95" : "border-slate-200 bg-slate-50/90"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                isDark
                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                  : "bg-indigo-50 border-indigo-200 text-indigo-600"
              }`}
            >
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">探针主题与扩展中心</h2>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isDark
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold"
                  }`}
                >
                  KOMARI COMPATIBLE
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                原生极客终端/卡片 · 支持热插拔 Komari 社区主题包
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-mono border ${
                isDark
                  ? "border-white/10 bg-black/40 text-slate-300"
                  : "border-slate-200 bg-slate-100 text-slate-700 shadow-2xs"
              }`}
            >
              <span className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>根路径 (/) 生效:</span>
              {activeBackendTheme === "builtin" ? (
                <span className={`${isDark ? "text-emerald-400" : "text-emerald-700"} font-bold flex items-center gap-1`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isDark ? "bg-emerald-400" : "bg-emerald-600"} animate-pulse`} />
                  原生控制台
                </span>
              ) : (
                <span className={`${isDark ? "text-purple-400" : "text-purple-700"} font-bold flex items-center gap-1`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isDark ? "bg-purple-400" : "bg-purple-600"} animate-pulse`} />
                  {activeBackendTheme}
                </span>
              )}
            </div>

            <button
              onClick={() => fetchInstalledThemes()}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                isDark ? "border-white/10 hover:bg-white/10 text-slate-300" : "border-slate-200 hover:bg-slate-100 text-slate-700"
              }`}
              title="刷新主题列表"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingInstalled ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {/* Global Color Mode Selector Bar */}
        <div
          className={`flex items-center justify-between px-6 py-2.5 border-b text-xs shrink-0 ${
            isDark ? "border-[#1b253b]/80 bg-[#0a0e1a]" : "border-slate-200 bg-slate-100/70"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`font-medium text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>界面明暗偏好:</span>
            <div
              className={`flex items-center gap-1 p-0.5 rounded-lg border ${
                isDark ? "bg-black/40 border-white/10" : "bg-slate-200/80 border-slate-300/60"
              }`}
            >
              {colorModes.map((mode) => {
                const isActive = colorMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => onSelectColorMode(mode.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      isActive
                        ? isDark
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs font-semibold"
                          : "bg-white text-indigo-700 border border-slate-300/80 shadow-xs font-semibold"
                        : isDark
                        ? "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                    }`}
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
              onClick={() => handleActivateTheme("builtin")}
              disabled={actionLoading["activate-builtin"]}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
                isDark
                  ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30"
                  : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 font-semibold"
              }`}
            >
              <RotateCcw className={`h-3 w-3 ${actionLoading["activate-builtin"] ? "animate-spin" : ""}`} />
              <span>一键恢复原生前台</span>
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        <div
          className={`flex items-center px-6 border-b shrink-0 gap-2 overflow-x-auto ${
            isDark ? "border-[#1b253b] bg-[#070a12]" : "border-slate-200 bg-slate-50"
          }`}
        >
          <button
            onClick={() => setActiveTab("builtin")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "builtin"
                ? isDark
                  ? "border-cyan-400 text-cyan-400"
                  : "border-indigo-600 text-indigo-700 font-bold"
                : isDark
                ? "border-transparent text-slate-400 hover:text-slate-200"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>🎨 原生精选 (Built-in)</span>
          </button>

          <button
            onClick={() => setActiveTab("installed")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "installed"
                ? isDark
                  ? "border-cyan-400 text-cyan-400"
                  : "border-indigo-600 text-indigo-700 font-bold"
                : isDark
                ? "border-transparent text-slate-400 hover:text-slate-200"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <Boxes className="h-4 w-4" />
            <span>📦 已安装主题 (Installed)</span>
            {installedThemes.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono border ${
                  isDark
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                    : "bg-indigo-100 text-indigo-700 border-indigo-200 font-semibold"
                }`}
              >
                {installedThemes.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("market")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "market"
                ? isDark
                  ? "border-cyan-400 text-cyan-400"
                  : "border-indigo-600 text-indigo-700 font-bold"
                : isDark
                ? "border-transparent text-slate-400 hover:text-slate-200"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            <span>🛒 Komari 官方主题市场 (Market)</span>
            {marketThemes.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono border ${
                  isDark
                    ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                    : "bg-purple-100 text-purple-700 border-purple-200 font-semibold"
                }`}
              >
                {marketThemes.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("import")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "import"
                ? isDark
                  ? "border-cyan-400 text-cyan-400"
                  : "border-indigo-600 text-indigo-700 font-bold"
                : isDark
                ? "border-transparent text-slate-400 hover:text-slate-200"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <FolderDown className="h-4 w-4" />
            <span>➕ 导入与自定义 (Import)</span>
          </button>
        </div>

        {/* Global Toast / Status Banner */}
        {statusNotice && (
          <div
            className={`px-6 py-2.5 flex items-center justify-between text-xs transition-all ${
              statusNotice.type === "success"
                ? isDark
                  ? "bg-emerald-500/15 text-emerald-300 border-b border-emerald-500/30"
                  : "bg-emerald-50 text-emerald-800 border-b border-emerald-200 font-medium"
                : statusNotice.type === "error"
                ? isDark
                  ? "bg-rose-500/15 text-rose-300 border-b border-rose-500/30"
                  : "bg-rose-50 text-rose-800 border-b border-rose-200 font-medium"
                : isDark
                ? "bg-cyan-500/15 text-cyan-300 border-b border-cyan-500/30"
                : "bg-sky-50 text-sky-800 border-b border-sky-200 font-medium"
            }`}
          >
            <div className="flex items-center gap-2">
              {statusNotice.type === "success" ? (
                <CheckCircle2 className={`h-4 w-4 shrink-0 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
              ) : statusNotice.type === "error" ? (
                <AlertCircle className={`h-4 w-4 shrink-0 ${isDark ? "text-rose-400" : "text-rose-600"}`} />
              ) : (
                <Activity className={`h-4 w-4 shrink-0 animate-spin ${isDark ? "text-cyan-400" : "text-sky-600"}`} />
              )}
              <span>{statusNotice.message}</span>
              {statusNotice.type === "success" && (
                <a
                  href={`/?_t=${Date.now()}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`ml-2 px-2 py-0.5 rounded text-[11px] font-bold underline transition-colors cursor-pointer ${
                    isDark ? "text-cyan-300 hover:text-white" : "text-indigo-600 hover:text-indigo-800"
                  }`}
                >
                  新窗口打开前台预览 →
                </a>
              )}
            </div>
            <button
              onClick={() => setStatusNotice(null)}
              className={`p-1 transition-colors cursor-pointer ${
                isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Body Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: BUILT-IN PRESETS */}
          {activeTab === "builtin" && (
            <div className="space-y-6">
              {activeBackendTheme !== "builtin" && (
                <div
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 ${
                    isDark
                      ? "bg-purple-950/30 border-purple-500/30 text-purple-200"
                      : "bg-purple-50 border-purple-200 text-purple-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5 text-xs">
                    <Globe className="h-4 w-4 text-purple-400 shrink-0" />
                    <span>
                      当前根路径 <code className="font-mono font-bold">/</code> 正由 Komari 社区主题{" "}
                      <strong className={isDark ? "text-purple-300" : "text-purple-800"}>{activeBackendTheme}</strong> 接管。内置控制台在{" "}
                      <code className="font-mono">/admin</code> 与 <code className="font-mono">/terminal</code> 保持独立运行。
                    </span>
                  </div>
                  <button
                    onClick={() => handleActivateTheme("builtin")}
                    disabled={actionLoading["activate-builtin"]}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all cursor-pointer shadow-xs"
                  >
                    设为前台主页
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                      className={`group relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? isDark
                            ? "border-cyan-400 bg-cyan-950/20 shadow-[0_0_20px_rgba(0,240,255,0.15)] ring-1 ring-cyan-400"
                            : "border-indigo-600 bg-indigo-50/50 shadow-md ring-1 ring-indigo-600"
                          : isDark
                          ? "border-[#1b253b] bg-[#0c101c]/80 hover:border-slate-600 hover:bg-[#0c101c]"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60 shadow-xs"
                      }`}
                    >
                      {isSelected && (
                        <div
                          className={`absolute -top-2.5 -right-2.5 z-20 flex h-6 w-6 items-center justify-center rounded-full shadow-md transition-transform duration-150 ease-out ${
                            isDark
                              ? "bg-cyan-400 text-slate-950 ring-2 ring-slate-900"
                              : "bg-indigo-600 text-white ring-2 ring-white"
                          }`}
                          title="当前使用的原生主题"
                        >
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                        </div>
                      )}

                      <div className="space-y-3">
                        {t.preview}

                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className={`font-bold text-sm tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>{t.name}</h3>
                          </div>
                          <p className={`text-[11px] font-mono ${isDark ? "text-cyan-400/80" : "text-indigo-600/90 font-medium"}`}>{t.subname}</p>
                          <p className={`mt-2 text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                            {t.description}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`mt-4 pt-3 border-t flex items-center justify-between ${
                          isDark ? "border-white/10" : "border-slate-200"
                        }`}
                      >
                        <div className="flex flex-wrap gap-1">
                          {t.badges.map((b) => (
                            <span
                              key={b}
                              className={`text-[9px] px-1.5 py-0.2 rounded font-mono border ${
                                isDark
                                  ? "border-white/10 bg-white/5 text-slate-300"
                                  : "border-slate-200 bg-slate-100 text-slate-600"
                              }`}
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            isSelected
                              ? isDark
                                ? "text-cyan-400"
                                : "text-indigo-700 font-bold"
                              : isDark
                              ? "text-slate-400 group-hover:text-slate-200"
                              : "text-slate-500 group-hover:text-slate-900"
                          }`}
                        >
                          {isSelected ? "● 当前使用中" : "点击应用"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Market Promo Banner */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  isDark
                    ? "bg-[#0b101c] border-[#1b253b]"
                    : "bg-purple-50/80 border-purple-200 text-purple-950"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      isDark
                        ? "bg-purple-500/10 border border-purple-500/30 text-purple-400"
                        : "bg-purple-100 border border-purple-200 text-purple-700"
                    }`}
                  >
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className={`text-xs font-bold ${isDark ? "text-white" : "text-purple-950"}`}>想要探索更多精美监控主题？</h4>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-slate-400" : "text-purple-700"}`}>
                      Nezha (哪吒)、ServerStatus、Ran (岚)、Zen 等 Komari 官方社区主题均可一键安装即刻体验。
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab("market")}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-xs"
                >
                  <span>前往主题市场</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: INSTALLED THEMES */}
          {activeTab === "installed" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  本地目录{" "}
                  <code
                    className={`font-mono px-1.5 py-0.5 rounded border ${
                      isDark
                        ? "text-cyan-400 bg-white/5 border-white/10"
                        : "text-indigo-700 bg-slate-100 border-slate-200 font-semibold"
                    }`}
                  >
                    ./themes/
                  </code>{" "}
                  中已解压并验证通过的 Komari 主题
                </span>
                <button
                  onClick={fetchInstalledThemes}
                  disabled={isLoadingInstalled}
                  className={`flex items-center gap-1.5 text-xs transition-colors cursor-pointer ${
                    isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingInstalled ? "animate-spin" : ""}`} />
                  <span>刷新</span>
                </button>
              </div>

              {installedThemes.length === 0 ? (
                <div
                  className={`py-12 flex flex-col items-center justify-center text-center space-y-3 rounded-2xl border border-dashed ${
                    isDark ? "border-white/15 bg-white/5 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  <Boxes className={`h-10 w-10 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
                  <div className="space-y-1">
                    <p className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>暂无外部安装的主题</p>
                    <p className={`text-xs max-w-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      当前探针正由原生内置控制台渲染。您可以前往「Komari 官方主题市场」一键安装社区精选主题。
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("market")}
                    className={`mt-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm ${
                      isDark
                        ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    }`}
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
                        className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
                          isActive
                            ? isDark
                              ? "border-emerald-500 bg-emerald-950/25 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/50"
                              : "border-emerald-500 bg-emerald-50/70 shadow-md ring-1 ring-emerald-500"
                            : isDark
                            ? "border-[#1b253b] bg-[#0c101c]/80 hover:border-slate-600"
                            : "border-slate-200 bg-white hover:border-slate-300 shadow-xs"
                        }`}
                      >
                        <div className="space-y-3">
                          {/* Preview image */}
                          <div
                            className={`relative h-32 w-full overflow-hidden rounded-lg flex items-center justify-center border ${
                              isDark ? "bg-black/40 border-white/10" : "bg-slate-100 border-slate-200"
                            }`}
                          >
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
                              <Palette className={`h-8 w-8 ${isDark ? "text-slate-600" : "text-slate-400"}`} />
                            )}
                            {isActive && (
                              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-bold font-mono shadow-sm flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-950 animate-ping" />
                                根路径生效中
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center justify-between">
                              <h4 className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-900"}`}>{th.name}</h4>
                              <span className={`text-[10px] font-mono ${isDark ? "text-cyan-400" : "text-indigo-600 font-semibold"}`}>
                                v{th.version}
                              </span>
                            </div>
                            <div
                              className={`flex items-center gap-2 mt-0.5 text-[11px] font-mono ${
                                isDark ? "text-slate-400" : "text-slate-500"
                              }`}
                            >
                              <span>作者: {th.author || "社区贡献者"}</span>
                              <span>·</span>
                              <span>ID: {th.short}</span>
                            </div>
                            <p className={`text-xs mt-2 line-clamp-2 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                              {th.description}
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div
                          className={`mt-4 pt-3 border-t flex items-center justify-between ${
                            isDark ? "border-white/10" : "border-slate-200"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isActive ? (
                              <a
                                href={"/?_t=" + Date.now()}
                                onClick={(e) => {
                                  e.currentTarget.href = "/?_t=" + Date.now();
                                }}
                                target="_blank"
                                rel="noreferrer"
                                className={`flex items-center gap-1 text-xs font-bold hover:underline ${
                                  isDark ? "text-emerald-400" : "text-emerald-700"
                                }`}
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span>新窗口打开前台</span>
                              </a>
                            ) : (
                              <button
                                onClick={() => handleActivateTheme(th.short)}
                                disabled={isActivating}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5 ${
                                  isDark
                                    ? "bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                }`}
                              >
                                {isActivating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                <span>设为生效</span>
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {th.short === "btop-terminal" && (
                              <a
                                href="/themes/btop-terminal.zip"
                                download="btop-terminal.zip"
                                className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-medium border ${
                                  isDark
                                    ? "text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10"
                                    : "text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                }`}
                                title="导出/下载独立插件安装包 (.zip)"
                              >
                                <Download className="h-3 w-3" />
                                <span>下载插件包</span>
                              </a>
                            )}
                            {th.url && (
                              <a
                                href={th.url}
                                target="_blank"
                                rel="noreferrer"
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isDark
                                    ? "text-slate-400 hover:text-white hover:bg-white/10"
                                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                                }`}
                                title="查看主题 GitHub 仓库"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <button
                              onClick={() => handleDeleteTheme(th.short, th.name)}
                              disabled={isDeleting || isActive}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isActive
                                  ? "opacity-30 cursor-not-allowed text-slate-500"
                                  : isDark
                                  ? "text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                                  : "text-rose-600 hover:bg-rose-50 cursor-pointer"
                              }`}
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
            <div className="space-y-4">
              {/* Market toolbar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className={`absolute left-3 top-2.5 h-3.5 w-3.5 ${isDark ? "text-slate-400" : "text-slate-400"}`} />
                  <input
                    type="text"
                    placeholder="在 Komari 官方市场中搜索主题名称、作者、关键字..."
                    value={marketSearch}
                    onChange={(e) => setMarketSearch(e.target.value)}
                    className={`w-full pl-9 pr-3 py-1.5 rounded-xl border text-xs focus:outline-hidden transition-colors ${
                      isDark
                        ? "border-white/15 bg-black/30 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400"
                        : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 shadow-2xs"
                    }`}
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    共 {marketThemes.length} 款社区主题
                  </span>
                  <button
                    onClick={fetchMarketThemes}
                    disabled={isLoadingMarket}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isDark
                        ? "border-white/15 text-slate-300 hover:bg-white/10"
                        : "border-slate-300 text-slate-700 hover:bg-slate-100 bg-white shadow-2xs"
                    }`}
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoadingMarket ? "animate-spin" : ""}`} />
                    <span>刷新市场</span>
                  </button>
                </div>
              </div>

              {isLoadingMarket ? (
                <div className={`py-16 flex flex-col items-center justify-center space-y-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  <RefreshCw className={`h-8 w-8 animate-spin ${isDark ? "text-cyan-400" : "text-indigo-600"}`} />
                  <p className="text-xs">正在从 Komari 官方仓库同步主题市场列表...</p>
                </div>
              ) : filteredMarket.length === 0 ? (
                <div className={`py-12 text-center text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
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
                        className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
                          isDark
                            ? "border-[#1b253b] bg-[#0c101c]/80 hover:border-slate-600"
                            : "border-slate-200 bg-white hover:border-slate-300 shadow-xs"
                        }`}
                      >
                        <div className="space-y-2.5">
                          {/* Preview image */}
                          <div
                            className={`relative h-28 w-full overflow-hidden rounded-lg flex items-center justify-center border ${
                              isDark ? "bg-black/40 border-white/10" : "bg-slate-100 border-slate-200"
                            }`}
                          >
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
                              <Palette className={`h-6 w-6 ${isDark ? "text-slate-600" : "text-slate-400"}`} />
                            )}
                            {isActive && (
                              <div className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[9px] font-bold font-mono">
                                当前生效
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center justify-between">
                              <h4 className={`font-bold text-xs truncate max-w-[160px] ${isDark ? "text-white" : "text-slate-900"}`} title={th.name}>
                                {th.name}
                              </h4>
                              <span className={`text-[10px] font-mono ${isDark ? "text-cyan-400" : "text-indigo-600 font-semibold"}`}>
                                v{th.version}
                              </span>
                            </div>
                            <div className={`flex items-center gap-1.5 text-[10px] font-mono mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              <span className="truncate max-w-[120px]">@{th.author}</span>
                              {th.url && (
                                <a
                                  href={th.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`hover:underline inline-flex items-center gap-0.5 ${
                                    isDark ? "text-cyan-400" : "text-indigo-600"
                                  }`}
                                >
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </div>
                            <p className={`text-[11px] mt-1.5 line-clamp-2 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                              {th.description}
                            </p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div
                          className={`mt-3 pt-2.5 border-t flex items-center justify-between ${
                            isDark ? "border-white/10" : "border-slate-200"
                          }`}
                        >
                          <span className={`text-[10px] font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>{th.short}</span>
                          {isActive ? (
                            <span className={`text-xs font-bold flex items-center gap-1 ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                              <Check className="h-3 w-3" /> 已在根路径生效
                            </span>
                          ) : isInstalled ? (
                            <button
                              onClick={() => handleActivateTheme(th.short)}
                              disabled={actionLoading[`activate-${th.short}`]}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                                isDark
                                  ? "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40"
                                  : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold"
                              }`}
                            >
                              <Check className="h-3 w-3" />
                              <span>已安装 · 设为生效</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleInstallTheme(th.download || "", th.name)}
                              disabled={isInstalling || !th.download}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1 ${
                                isDark ? "bg-cyan-500 hover:bg-cyan-400 text-slate-950" : "bg-indigo-600 hover:bg-indigo-700 text-white"
                              }`}
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
            <div className="space-y-6 max-w-2xl mx-auto py-2">
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isDark ? "border-[#1b253b] bg-[#0c101c]/80 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-900"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  <LinkIcon className={`h-4 w-4 ${isDark ? "text-cyan-400" : "text-indigo-600"}`} />
                  <span>方式一：从远程 ZIP 链接一键拉取安装</span>
                </div>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  输入任何开源 Komari 主题的 GitHub Releases 或 CDN 直链 ZIP 文件包：
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    placeholder="https://github.com/username/repo/releases/download/.../theme.zip"
                    value={customZipUrl}
                    onChange={(e) => setCustomZipUrl(e.target.value)}
                    className={`flex-1 px-3 py-2 rounded-xl border text-xs focus:outline-hidden font-mono ${
                      isDark
                        ? "border-white/15 bg-black/30 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400"
                        : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 shadow-2xs"
                    }`}
                  />
                  <button
                    onClick={() => {
                      if (!customZipUrl.trim()) return;
                      handleInstallTheme(customZipUrl.trim(), "自定义直链主题");
                    }}
                    disabled={!customZipUrl.trim() || actionLoading[`install-${customZipUrl.trim()}`]}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 shadow-xs ${
                      isDark ? "bg-cyan-500 hover:bg-cyan-400 text-slate-950" : "bg-indigo-600 hover:bg-indigo-700 text-white"
                    }`}
                  >
                    开始安装
                  </button>
                </div>
              </div>

              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isDark ? "border-[#1b253b] bg-[#0c101c]/80 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-900"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Upload className={`h-4 w-4 ${isDark ? "text-purple-400" : "text-purple-600"}`} />
                  <span>方式二：上传本地主题 ZIP 压缩包</span>
                </div>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  支持上传已打包好的 Komari 规范主题包（ZIP 根目录需包含{" "}
                  <code className="font-mono text-purple-500 font-semibold">komari-theme.json</code> 与{" "}
                  <code className="font-mono text-purple-500 font-semibold">dist/</code> 静态目录）：
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
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all group ${
                    isDark
                      ? "border-white/20 bg-white/5 hover:border-purple-400 hover:bg-purple-500/10"
                      : "border-slate-300 bg-white hover:border-purple-500 hover:bg-purple-50/50 shadow-2xs"
                  }`}
                >
                  <Upload
                    className={`h-8 w-8 mx-auto mb-2 transition-colors ${
                      isDark ? "text-slate-500 group-hover:text-purple-400" : "text-slate-400 group-hover:text-purple-600"
                    }`}
                  />
                  <p
                    className={`text-xs font-bold ${
                      isDark ? "text-slate-300 group-hover:text-white" : "text-slate-700 group-hover:text-purple-700"
                    }`}
                  >
                    点击选择或拖拽本地主题 ZIP 包至此处
                  </p>
                  <p className={`text-[11px] mt-1 font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                    {actionLoading["upload-zip"] ? "正在解压并校验结构..." : "最大支持 50MB"}
                  </p>
                </div>
              </div>

              <div
                className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                  isDark ? "border-white/10 bg-white/5 text-slate-400" : "border-slate-200 bg-slate-100/90 text-slate-600"
                }`}
              >
                <div className={`font-bold flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                  <ShieldCheck className={`h-3.5 w-3.5 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                  <span>关于 Komari 主题标准兼容</span>
                </div>
                <p>
                  Probe 后端完全兼容 Komari REST 与 WebSocket 通信协议。安装的主题可以直接通过{" "}
                  <code className="font-mono font-semibold">/api/public</code> 与{" "}
                  <code className="font-mono font-semibold">/api/nodes</code> 获取实时服务器监控数据，且始终保障{" "}
                  <code className="font-mono font-semibold">/admin</code> 原生控制台安全可用。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`flex items-center justify-between px-6 py-3.5 border-t shrink-0 ${
            isDark ? "border-[#1b253b] bg-[#070a12]" : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="text-xs font-mono">
            <span className={isDark ? "text-slate-400" : "text-slate-500"}>当前方案: </span>
            <span className={`font-bold ${isDark ? "text-cyan-400" : "text-indigo-700"}`}>
              {activeBackendTheme !== "builtin"
                ? `Komari · ${activeBackendTheme}`
                : currentPreset === "btop"
                ? "📟 btop++ 极客终端 (官方默认)"
                : "🔷 经典卡片看板"}
            </span>
            <span className={isDark ? "text-slate-600" : "text-slate-300"}> · </span>
            <span className={isDark ? "text-slate-300" : "text-slate-700 font-semibold"}>
              {colorMode === "light"
                ? "☼ 浅色模式"
                : colorMode === "dark"
                ? "☾ 深色模式"
                : "💻 跟随系统"}
            </span>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                isDark
                  ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
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
  const isDark = props.theme === "btop" || props.theme === "blueprint-dark" || props.theme === "dark";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md animate-fade-in font-sans">
      <div
        className={`relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden transition-all duration-300 ${
          isDark
            ? "bg-[#090d16] border-[#1b253b] text-slate-100 shadow-[0_25px_60px_rgba(0,0,0,0.85)]"
            : "bg-white border-slate-200 text-slate-900 shadow-2xl"
        }`}
      >
        {/* Header Bar */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isDark ? "border-[#1b253b] bg-[#070a12]/95" : "border-slate-200 bg-slate-50/90"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                isDark
                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                  : "bg-indigo-50 border-indigo-200 text-indigo-600"
              }`}
            >
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">探针主题与扩展中心</h2>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isDark
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold"
                  }`}
                >
                  KOMARI COMPATIBLE
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                原生多套极客风格 · 支持直装 Komari 官方社区主题包
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              isDark ? "hover:bg-white/10 text-slate-400 hover:text-white" : "hover:bg-slate-200 text-slate-500 hover:text-slate-800"
            }`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ThemeManagerPanel {...props} onClose={onClose} isEmbedded={false} />
      </div>
    </div>
  );
};

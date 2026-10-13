import React, { useState, useEffect } from "react";
import {
  X,
  Server,
  Sliders,
  DollarSign,
  Activity,
  Key,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Check,
  Copy,
  Zap,
  Calendar,
  CreditCard,
  Coins,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  Bell,
  Send,
  Clock,
  Radio,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Info,
  Palette,
  ArrowLeft,
  Sun,
  Moon,
  LogOut,
  KeyRound,
  UserCircle,
  type LucideIcon,
} from "lucide-react";
import {
  NodeState,
  PingTargetConfig,
  SystemSettings,
  TokenItem,
  NotificationSettings,
  NotificationLog,
  ThemeMode,
  ThemePreset,
  ColorMode,
} from "../types";
import { Button, Chip, Input, ListBox, Select, Switch, Tabs } from "@heroui/react";
import { cn } from "../lib/utils";
import { HostTable } from "./admin/hosts/HostTable";
import { HostEditDialog } from "./admin/hosts/HostEditDialog";
import { HostDeployDialog } from "./admin/hosts/HostDeployDialog";
import { ThemeManagerPanel } from "./ThemeManagerModal";

type TabKey = "hosts" | "network" | "billing" | "tokens" | "notifications" | "themes";

/** Rows of notification history per page. The server caps a page at 200. */
const LOG_PAGE_SIZE = 50;

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: NodeState[];
  theme?: ThemeMode;
  onRefreshNodes?: () => void;
  isStandalone?: boolean;
  currentPreset?: ThemePreset;
  onSelectPreset?: (preset: ThemePreset) => void;
  colorMode?: ColorMode;
  onSelectColorMode?: (mode: ColorMode) => void;
  onToggleTheme?: () => void;
  onLogout?: () => void;
  onOpenPasswordModal?: () => void;
  username?: string | null;
}

const WEBHOOK_FORMAT_OPTIONS = [
  { key: "generic", label: "通用 JSON (POST)" },
  { key: "feishu", label: "飞书群机器人 (Lark Robot)" },
  { key: "dingtalk", label: "钉钉自定义机器人 (DingTalk)" },
  { key: "wecom", label: "企业微信群机器人 (WeCom)" },
  { key: "bark", label: "Bark (iOS 极速通知)" },
];

// Keys are strings because HeroUI's Select works on keys, not numeric values;
// the handlers parseInt them back before they reach the settings payload.
const OFFLINE_THRESHOLD_OPTIONS = [
  { key: "30", label: "30 秒 (极速检测)" },
  { key: "60", label: "60 秒 (推荐平衡)" },
  { key: "120", label: "120 秒 (减少抖动)" },
  { key: "300", label: "300 秒 (宽限期)" },
];

const TRAFFIC_THRESHOLD_OPTIONS = [
  { key: "70", label: "70% 额度预警" },
  { key: "80", label: "80% 额度预警" },
  { key: "85", label: "85% 额度预警 (推荐)" },
  { key: "90", label: "90% 临界预警" },
  { key: "95", label: "95% 严重警告" },
];

const TARGET_PALETTE = [
  "#ef4444", // Red
  "#06b6d4", // Cyan
  "#a855f7", // Purple
  "#3b82f6", // Blue
  "#f97316", // Orange
  "#10b981", // Emerald
  "#ec4899", // Pink
  "#eab308", // Amber
  "#6366f1", // Indigo
  "#14b8a6", // Teal
];

const getAutoColor = (index: number, label?: string): string => {
  if (label) {
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
      hash = label.charCodeAt(i) + ((hash << 5) - hash);
    }
    return TARGET_PALETTE[Math.abs(hash) % TARGET_PALETTE.length];
  }
  return TARGET_PALETTE[index % TARGET_PALETTE.length];
};

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  nodes,
  theme = "dark",
  onRefreshNodes,
  isStandalone = false,
  currentPreset,
  onSelectPreset,
  colorMode,
  onSelectColorMode,
  onToggleTheme,
  onLogout,
  onOpenPasswordModal,
  username,
}) => {
  const isDark = theme === "btop" || theme === "blueprint-dark" || theme === "dark";
  const isLight = !isDark;
  const isBlueprintLight = theme === "blueprint";
  const isBlueprintDark = theme === "blueprint-dark";
  const isBlueprint = isLight;
  const isBtopLight = theme === "btop-light";
  const isBtopDark = theme === "btop";
  const isBtop = isBtopLight || isBtopDark;
  const [activeTab, setActiveTab] = useState<TabKey>("hosts");

  // --- Notifications State ---
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    telegram: { enabled: false, bot_token: "", chat_id: "" },
    webhook: { enabled: false, url: "", secret: "", format: "generic" },
    discord: { enabled: false, webhook_url: "" },
    rules: {
      offline_alert: true,
      offline_threshold_sec: 60,
      recovery_alert: true,
      traffic_alert: true,
      traffic_threshold_pct: 85,
      daily_report: false,
      daily_report_time: "09:00",
    },
  });
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  // Log pagination. `logTotal` is the row count in the database, not the size of
  // the page in hand — the old UI showed the latter and so silently capped at 50.
  const [logPage, setLogPage] = useState(0);
  const [logTotal, setLogTotal] = useState(0);
  const [isLoadingNotif, setIsLoadingNotif] = useState(false);
  const [isSavingNotif, setIsSavingNotif] = useState(false);
  const [notifSaveSuccess, setNotifSaveSuccess] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testNotice, setTestNotice] = useState<{ success: boolean; msg: string } | null>(null);

  const fetchNotificationSettings = async () => {
    try {
      setIsLoadingNotif(true);
      const res = await fetch("/api/v1/notifications/settings");
      if (res.ok) {
        const d = await res.json();
        if (d && d.rules) setNotificationSettings(d);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingNotif(false);
    }
  };

  const fetchNotificationLogs = async (page = logPage) => {
    try {
      const res = await fetch(
        `/api/v1/notifications/logs?limit=${LOG_PAGE_SIZE}&offset=${page * LOG_PAGE_SIZE}`
      );
      if (res.ok) {
        const d = await res.json();
        setNotificationLogs(Array.isArray(d.logs) ? d.logs : []);
        setLogTotal(typeof d.total === "number" ? d.total : 0);
        setLogPage(page);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveNotificationSettings = async () => {
    try {
      setIsSavingNotif(true);
      setNotifSaveSuccess(false);
      const res = await fetch("/api/v1/notifications/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationSettings),
      });
      if (res.ok) {
        setNotifSaveSuccess(true);
        setTimeout(() => setNotifSaveSuccess(false), 3000);
      } else {
        const err = await res.json();
        alert(`保存失败: ${err.error || "未知错误"}`);
      }
    } catch (e: any) {
      alert(`保存失败: ${e.message}`);
    } finally {
      setIsSavingNotif(false);
    }
  };

  const handleTestNotification = async (channel: "telegram" | "webhook" | "discord" | "all") => {
    try {
      setTestingChannel(channel);
      setTestNotice(null);
      // Auto-save latest config before test
      await fetch("/api/v1/notifications/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationSettings),
      });

      const res = await fetch("/api/v1/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestNotice({ success: true, msg: "测试通知已成功发出！请查收对应客户端消息。" });
      } else {
        setTestNotice({ success: false, msg: `测试发送失败: ${data.error || "请求异常"}` });
      }
      fetchNotificationLogs();
    } catch (e: any) {
      setTestNotice({ success: false, msg: `测试请求失败: ${e.message}` });
    } finally {
      setTestingChannel(null);
    }
  };

  const handleClearNotificationLogs = async () => {
    if (!confirm("确定清空全部告警与通知历史记录？")) return;
    try {
      const res = await fetch("/api/v1/notifications/logs", { method: "DELETE" });
      if (res.ok) {
        setNotificationLogs([]);
        setLogTotal(0);
        setLogPage(0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- Network & Ping Targets State ---
  const [pingTargets, setPingTargets] = useState<PingTargetConfig[]>([]);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [editingTargetId, setEditingTargetId] = useState<number | null>(null);

  // Network Target Form matching screenshot
  const [targetFormName, setTargetFormName] = useState("");
  const [targetFormAddress, setTargetFormAddress] = useState("");
  const [targetFormType, setTargetFormType] = useState<"icmp" | "tcp" | "http">("icmp");
  const [targetFormPort, setTargetFormPort] = useState(443);
  const [targetFormInterval, setTargetFormInterval] = useState(60);
  const [targetFormServers, setTargetFormServers] = useState<string[]>([]);
  const [targetFormAutoStart, setTargetFormAutoStart] = useState(true);
  const [isServerPickerOpen, setIsServerPickerOpen] = useState(false);

  const [testResult, setTestResult] = useState<{ target: string; success: boolean; latency_ms?: number; error?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [instantTargetInput, setInstantTargetInput] = useState("1.1.1.1");

  // --- Billing & Exchange Rates State ---
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    base_currency: "CNY",
    exchange_rates: { USD: 7.18, EUR: 7.82, HKD: 0.92, GBP: 9.35, JPY: 0.048 },
    last_rate_update: 0,
  });
  const [isRefreshingRates, setIsRefreshingRates] = useState(false);
  const [rateSaveSuccess, setRateSaveSuccess] = useState(false);

  // --- Host Dialog State ---
  // Which host row the config dialog is open for; the dialog owns the draft.
  const [editingHost, setEditingHost] = useState<NodeState | null>(null);
  const [isDeployDialogOpen, setIsDeployDialogOpen] = useState(false);
  const [hostQuery, setHostQuery] = useState("");

  const onlineHostCount = nodes.filter((n) => n.is_online).length;

  // Filter across the fields an operator would recognise a box by.
  const hostKeyword = hostQuery.trim().toLowerCase();
  const filteredHosts = hostKeyword
    ? nodes.filter((n) =>
        [n.name, n.node_id, n.region, n.system?.public_ip]
          .some((field) => (field || "").toLowerCase().includes(hostKeyword))
      )
    : nodes;

  // --- Tokens State ---
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Active agent token. Shared with the deploy dialog, which embeds it into the
  // install command, so regenerating there keeps this tab in agreement.
  const [deployToken, setDeployToken] = useState("sk_default_secret_probe_token");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Tab bar is data-driven so the five entries can't drift apart visually.
  // `badge` is omitted where there's no count to show (billing).
  const tabItems: {
    key: TabKey;
    icon: LucideIcon;
    label: string;
    shortLabel: string;
    badge?: number | string;
    badgeTone?: "count" | "new";
  }[] = [
    { key: "hosts", icon: Server, label: "[01] 主机列表 HOSTS", shortLabel: "HOSTS", badge: nodes.length },
    { key: "network", icon: Activity, label: "[02] 网络监测 NETWORK", shortLabel: "NETWORK", badge: pingTargets.length },
    { key: "themes", icon: Palette, label: "[03] 主题扩展 THEMES", shortLabel: "THEMES" },
    { key: "billing", icon: Coins, label: "[04] 财务汇率 BILLING", shortLabel: "BILLING" },
    { key: "tokens", icon: Key, label: "[05] 鉴权密钥 TOKENS", shortLabel: "TOKENS", badge: tokens.length },
    { key: "notifications", icon: Bell, label: "[06] 告警通知 ALERTS", shortLabel: "ALERTS", badge: "NEW", badgeTone: "new" },
  ];

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    // The notifications pane reads from the server rather than local state.
    if (key === "notifications") {
      fetchNotificationSettings();
      fetchNotificationLogs();
    }
  };

  // Load Data on open or in standalone mode
  useEffect(() => {
    if (!isOpen && !isStandalone) return;

    // Load Ping Targets
    fetch("/api/v1/ping-targets")
      .then((r) => r.json())
      .then((d) => {
        if (d.targets && Array.isArray(d.targets)) setPingTargets(d.targets);
      })
      .catch((e) => console.error(e));

    // Load Exchange Rates
    fetch("/api/v1/settings/rates")
      .then((r) => r.json())
      .then((d) => {
        if (d.exchange_rates) setSystemSettings(d);
      })
      .catch((e) => console.error(e));

    // Load Active Token directly
    fetch("/api/v1/tokens/active")
      .then((r) => r.json())
      .then((d) => {
        if (d.token) setDeployToken(d.token);
      })
      .catch((e) => console.error(e));

    // Load All Tokens
    fetch("/api/v1/tokens")
      .then((r) => r.json())
      .then((d) => {
        if (d.tokens && Array.isArray(d.tokens)) {
          setTokens(d.tokens);
        }
      })
      .catch((e) => console.error(e));

    // Load Notification Settings & Logs
    fetchNotificationSettings();
    fetchNotificationLogs();
  }, [isOpen]);

  if (!isOpen) return null;

  // --- Instant Ping Test ---
  const handleTestTarget = async (targetAddr: string, port = 443) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/ping-targets/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: targetAddr, port }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e: any) {
      setTestResult({ target: targetAddr, success: false, error: e.message });
    } finally {
      setIsTesting(false);
    }
  };

  // --- Ping Targets Handlers ---
  const openAddTargetModal = () => {
    setEditingTargetId(null);
    setTargetFormName("");
    setTargetFormAddress("");
    setTargetFormType("icmp");
    setTargetFormPort(443);
    setTargetFormInterval(60);
    setTargetFormServers([]);
    setTargetFormAutoStart(true);
    setIsServerPickerOpen(false);
    setIsTargetModalOpen(true);
  };

  const openEditTargetModal = (target: PingTargetConfig) => {
    setEditingTargetId(target.id || null);
    setTargetFormName(target.label);
    setTargetFormAddress(target.target);
    setTargetFormType((target.protocol as any) || "icmp");
    setTargetFormPort(target.port || 443);
    setTargetFormInterval(target.interval || 60);
    setTargetFormServers(target.servers || []);
    setTargetFormAutoStart(target.auto_start !== false);
    setIsServerPickerOpen(false);
    setIsTargetModalOpen(true);
  };

  const handleSavePingTargetModal = async () => {
    if (!targetFormName.trim()) return;
    const address = targetFormAddress.trim() || targetFormName.trim();
    const color = getAutoColor(pingTargets.length, targetFormName);

    const payload: PingTargetConfig = {
      label: targetFormName.trim(),
      target: address,
      color,
      protocol: targetFormType,
      port: targetFormType === "tcp" ? targetFormPort : targetFormType === "http" ? 80 : 0,
      interval: targetFormInterval > 0 ? targetFormInterval : 60,
      servers: targetFormServers,
      auto_start: targetFormAutoStart,
      enabled: true,
    };

    try {
      if (editingTargetId) {
        // Update
        payload.id = editingTargetId;
        const res = await fetch(`/api/v1/ping-targets/${editingTargetId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setPingTargets((prev) => prev.map((item) => (item.id === editingTargetId ? { ...item, ...payload } : item)));
          setIsTargetModalOpen(false);
        }
      } else {
        // Add
        const res = await fetch("/api/v1/ping-targets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = await res.json();
          setPingTargets((prev) => [...prev, created]);
          setIsTargetModalOpen(false);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleTarget = async (t: PingTargetConfig) => {
    const currentEnabled = t.enabled !== false;
    const updated = { ...t, enabled: !currentEnabled };
    try {
      const res = await fetch(`/api/v1/ping-targets/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        setPingTargets((prev) => prev.map((item) => (item.id === t.id ? updated : item)));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTarget = async (id?: number) => {
    if (!id) return;
    if (!confirm("确定要删除此监测目标吗？")) return;
    try {
      const res = await fetch(`/api/v1/ping-targets/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPingTargets((prev) => prev.filter((t) => t.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- Exchange Rates Handlers ---
  const handleRefreshRates = async () => {
    setIsRefreshingRates(true);
    try {
      const res = await fetch("/api/v1/settings/rates/refresh", { method: "POST" });
      if (res.ok) {
        const updated = await res.json();
        setSystemSettings(updated);
        setRateSaveSuccess(true);
        setTimeout(() => setRateSaveSuccess(false), 2500);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshingRates(false);
    }
  };

  const handleSaveRates = async () => {
    try {
      const res = await fetch("/api/v1/settings/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(systemSettings),
      });
      if (res.ok) {
        setRateSaveSuccess(true);
        setTimeout(() => setRateSaveSuccess(false), 2500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- Host Settings Handlers ---
  const handleDeleteNode = async (nodeID: string) => {
    if (!confirm(`确定要永久删除节点 "${nodeID}" 吗？其历史指标数据也将被移除。`)) return;
    try {
      const res = await fetch(`/api/v1/nodes/${encodeURIComponent(nodeID)}`, { method: "DELETE" });
      if (res.ok) {
        if (onRefreshNodes) onRefreshNodes();
      } else if (res.status === 409) {
        window.alert("请先停止该节点上的 Agent，待节点离线后再删除。");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- Tokens Handlers ---
  const handleCreateToken = async () => {
    const label = newTokenLabel.trim() || `Token ${new Date().toLocaleDateString()}`;
    const res = await fetch("/api/v1/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      const created = await res.json();
      setTokens([created, ...tokens]);
      setNewTokenLabel("");
    }
  };

  /** Mints a fresh agent token for the deploy dialog. Returns it so the caller
      can surface a failure instead of silently keeping the stale one. */
  const handleRegenerateDeployToken = async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/v1/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: `Auto Token ${new Date().toLocaleTimeString()}` }),
      });
      if (!res.ok) return null;
      const created = await res.json();
      setDeployToken(created.token);
      setTokens((prev) => [created, ...prev]);
      return created.token;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  // Compute cluster financial sums
  let totalMonthlySpendCNY = 0;
  let totalRemainingValueCNY = 0;
  nodes.forEach((n) => {
    // The currency field stores whatever the operator picked, and the backend
    // accepts both the symbol and the ISO code for each one. Match on both here
    // so a host saved as "JPY" is not silently summed at rate 1.0 (i.e. as CNY).
    const cur = (n.billing?.currency || "$").trim().toUpperCase();
    const rate = cur === "$" || cur === "USD" ? (systemSettings.exchange_rates["USD"] || 7.18) :
                 cur === "€" || cur === "EUR" ? (systemSettings.exchange_rates["EUR"] || 7.82) :
                 cur === "HK$" || cur === "HKD" ? (systemSettings.exchange_rates["HKD"] || 0.92) :
                 cur === "£" || cur === "GBP" ? (systemSettings.exchange_rates["GBP"] || 9.35) :
                 cur === "JP¥" || cur === "JPY" ? (systemSettings.exchange_rates["JPY"] || 0.048) : 1.0;

    const monthlyCost = n.billing?.price_per_month || 0;
    totalMonthlySpendCNY += monthlyCost * rate;
    totalRemainingValueCNY += n.billing?.remaining_value || 0;
  });

  if (!isOpen && !isStandalone) return null;

  return (
    <div
      className={
        isStandalone
          ? "min-h-screen w-full flex flex-col font-sans transition-colors nezha-grid text-[var(--nezha-ink)]"
          : "fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 lg:p-6 bg-black/80 backdrop-blur-md animate-fade-in font-sans"
      }
    >
      <div
        className={
          isStandalone
            ? "relative flex flex-col w-full flex-1 max-w-[1720px] mx-auto overflow-hidden sm:border-x shadow-xl transition-colors bg-[var(--nezha-panel)] border-[var(--nezha-line)] text-[var(--nezha-ink)] admin-console"
            : "relative flex flex-col w-full max-w-[1440px] h-[100dvh] sm:h-[92vh] rounded-none sm:rounded-sm border shadow-2xl overflow-hidden transition-colors bg-[var(--nezha-panel)] border-[var(--nezha-line)] text-[var(--nezha-ink)] admin-console"
        }
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3.5 py-2.5 sm:px-6 sm:py-3.5 border-b shrink-0 bg-[var(--nezha-panel)] border-[var(--nezha-line)]"
        >
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-accent)] shrink-0">
              <Sliders className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold font-mono tracking-tight truncate text-[var(--nezha-ink)]">
                  <span className="hidden sm:inline">PROBE // CONTROL CONSOLE</span>
                  <span className="sm:hidden">PROBE // CONSOLE</span>
                </h2>
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-10 font-mono font-bold bg-[var(--nezha-accent)] text-[#141414] rounded-none shrink-0">
                  ADMIN
                </span>
              </div>
              <p className="hidden sm:block text-xs font-mono text-[var(--nezha-ink-3)] mt-0.5 truncate">
                主机管理 · 网络延迟丢包监控 · 探针主题中心 · 财务与实时汇率 · 多渠道通知
              </p>
            </div>
          </div>

          {isStandalone ? (
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <a
                href={"/?_t=" + Date.now()}
                onClick={(e) => {
                  e.currentTarget.href = "/?_t=" + Date.now();
                }}
                className="h-7 px-2.5 flex items-center justify-center gap-1.5 rounded-none bg-[var(--nezha-panel)] hover:bg-[var(--nezha-accent)] text-[var(--nezha-ink)] hover:text-[#141414] border border-[var(--nezha-line)] hover:border-[var(--nezha-accent)] text-xs font-mono font-bold shrink-0 whitespace-nowrap transition-all cursor-pointer"
                title="返回监控前台"
              >
                <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">返回监控前台</span>
                <span className="sm:hidden whitespace-nowrap">前台</span>
              </a>

              {onToggleTheme && (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="h-7 w-7 flex items-center justify-center rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] shrink-0 transition-all cursor-pointer"
                  title="切换色彩明暗"
                >
                  {isDark ? <Moon className="h-3.5 w-3.5 text-[var(--nezha-accent)]" /> : <Sun className="h-3.5 w-3.5 text-[var(--nezha-accent)]" />}
                </button>
              )}

              {onOpenPasswordModal && (
                <button
                  type="button"
                  onClick={onOpenPasswordModal}
                  className="hidden sm:flex h-7 px-2.5 items-center justify-center gap-1.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] text-xs font-mono font-bold shrink-0 whitespace-nowrap transition-all cursor-pointer"
                  title="修改管理密码"
                >
                  <KeyRound className="h-3.5 w-3.5 text-[var(--nezha-accent)] shrink-0" />
                  <span>改密</span>
                </button>
              )}

              {username && (
                <div
                  className="hidden sm:flex h-7 px-2.5 items-center justify-center gap-1.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] text-xs font-mono font-bold shrink-0 whitespace-nowrap"
                >
                  <span className="h-1.5 w-1.5 rounded-none bg-[var(--nezha-accent)]" />
                  <span>{username}</span>
                </div>
              )}

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="h-7 w-7 sm:w-auto sm:px-2.5 flex items-center justify-center gap-1 rounded-none border border-rose-500/30 bg-[var(--nezha-panel)] text-rose-500 hover:bg-rose-500/10 text-xs font-mono font-bold shrink-0 whitespace-nowrap transition-all cursor-pointer"
                  title="退出登录"
                >
                  <LogOut className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">退出</span>
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="h-7 w-7 flex items-center justify-center rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:bg-[var(--nezha-accent)] hover:text-[#141414] text-[var(--nezha-ink)] shrink-0 transition-colors cursor-pointer"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div
          className="px-2.5 sm:px-6 border-b shrink-0 overflow-x-auto no-scrollbar bg-[var(--nezha-panel)] border-[var(--nezha-line)]"
        >
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={(key) => handleTabChange(key as TabKey)}
            aria-label="管理后台分区"
          >
            <Tabs.List className="flex-nowrap min-w-max -mb-px">
              {tabItems.map(({ key, icon: Icon, label, shortLabel, badge, badgeTone }) => (
                <Tabs.Tab
                  key={key}
                  id={key}
                  className={cn(
                    "h-10 sm:h-11 w-auto shrink-0 gap-1.5 sm:gap-2 whitespace-nowrap text-xs font-mono px-3 sm:px-4 font-semibold transition-colors rounded-none border-b-2 border-transparent",
                    "text-[var(--nezha-ink-2)] hover:text-[var(--nezha-ink)] data-[selected=true]:text-[var(--nezha-ink)] data-[selected=true]:border-[var(--nezha-accent)] data-[selected=true]:bg-[var(--nezha-panel-sub)]/60"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="sm:hidden">{shortLabel}</span>
                  <span className="hidden sm:inline">{label}</span>
                  {badge != null && (
                    <span
                      className={cn(
                        "rounded-none px-1.5 py-0.2 font-mono",
                        badgeTone === "new"
                          ? "text-9 font-bold bg-[var(--nezha-accent)] text-[#141414]"
                          : "text-10 bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink-2)] border border-[var(--nezha-line)]"
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
        </div>


        {/* Tab Contents. Keyed on activeTab so switching panes fades in and
            resets the scroll position instead of keeping the previous offset. */}
        <div key={activeTab} className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4 sm:space-y-6 animate-fade-in">
          {/* TAB 1: HOSTS — roster only; add and edit live in dialogs. */}
          {/* TAB 1: HOSTS — roster only; add and edit live in dialogs. */}
          {activeTab === "hosts" && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold font-mono tracking-tight text-[var(--nezha-ink)]">
                    [01] 主机集群管理 HOSTS ROSTER
                  </h3>
                  <p className="text-xs font-mono text-[var(--nezha-ink-3)] mt-0.5">
                    FLEET TELEMETRY · 共 {nodes.length} 台 · 在线 {onlineHostCount} 台 · 离线 {nodes.length - onlineHostCount} 台
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    value={hostQuery}
                    onChange={(e) => setHostQuery(e.target.value)}
                    placeholder="搜索名称 / ID / 地区 / IP"
                    aria-label="搜索主机"
                    className="h-8 px-2.5 text-xs font-mono rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] focus:border-[var(--nezha-accent)] focus:outline-none w-full sm:w-64"
                  />
                  <button
                    type="button"
                    onClick={() => setIsDeployDialogOpen(true)}
                    className="h-8 px-3.5 text-xs font-mono font-bold rounded-none bg-[var(--nezha-accent)] text-[#141414] hover:bg-[#E54D16] border border-[#141414]/20 flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span>添加主机</span>
                  </button>
                </div>
              </div>

              <HostTable
                nodes={filteredHosts}
                theme={theme}
                onEdit={setEditingHost}
                onDelete={handleDeleteNode}
              />

              {nodes.length > 0 && filteredHosts.length === 0 && (
                <p className="text-center text-xs py-3 font-mono text-[var(--nezha-ink-3)] border border-[var(--nezha-line-soft)] bg-[var(--nezha-panel)]">
                  没有匹配「{hostQuery}」的主机
                </p>
              )}
            </div>
          )}

          {/* TAB 2: NETWORK & PING TARGETS */}
          {activeTab === "network" && (
            <div className="space-y-5">
              {/* Header with Add Button */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold font-mono text-[var(--nezha-ink)]">
                    [02] 网络质量监测目标 NETWORK PROBES
                  </h3>
                  <p className="text-xs font-mono text-[var(--nezha-ink-3)] mt-0.5">
                    各探针节点定时检测目标延迟与丢包率，多节点实时汇总
                  </p>
                </div>

                <button
                  type="button"
                  onClick={openAddTargetModal}
                  className="h-8 px-3.5 text-xs font-mono font-bold rounded-none bg-[var(--nezha-accent)] text-[#141414] hover:bg-[#E54D16] border border-[#141414]/20 flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>添加监测</span>
                </button>
              </div>

              {/* Instant ping tester quick bar */}
              <div
                className="p-3 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs w-full sm:w-auto">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-none bg-[var(--nezha-accent-soft)] text-[var(--nezha-accent)] shrink-0 font-bold">
                      <Zap className="h-4 w-4" />
                    </div>
                    <span className="font-bold text-[var(--nezha-ink)]">
                      [即时测速] :
                    </span>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <input
                      type="text"
                      placeholder="输入 IP 或域名，如 1.1.1.1"
                      value={instantTargetInput}
                      onChange={(e) => setInstantTargetInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !isTesting && instantTargetInput.trim()) {
                          handleTestTarget(instantTargetInput.trim());
                        }
                      }}
                      className="h-8 px-2.5 font-mono text-xs flex-1 sm:w-64 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] focus:border-[var(--nezha-accent)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleTestTarget(instantTargetInput.trim())}
                      disabled={isTesting || !instantTargetInput.trim()}
                      className="h-8 px-3 font-mono font-bold text-xs shrink-0 rounded-none bg-[var(--nezha-accent)] text-[#141414] hover:bg-[#E54D16] border border-[#141414]/20 shadow-none cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                    >
                      {isTesting ? "测试中..." : "测试连接"}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[var(--nezha-ink-3)] font-mono">
                  <Info className="h-3.5 w-3.5 text-[var(--nezha-accent)] shrink-0" />
                  <span>由探针集群对目标执行临时 ICMP/TCP Ping 检测</span>
                </div>
              </div>

              {/* Instant test result badge */}
              {testResult && (
                <div
                  className={cn(
                    "rounded-none border px-3.5 py-2.5 text-xs font-mono flex items-center justify-between gap-3",
                    testResult.success
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold"
                      : "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {testResult.success ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                    <span>
                      {testResult.success
                        ? `测速成功: 目标 ${testResult.target} 响应延迟 ${testResult.latency_ms?.toFixed(1)} ms`
                        : `连接失败: ${testResult.error || "网络超时"}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTestResult(null)}
                    className="p-1 rounded-none border border-current text-xs font-mono"
                  >
                    关闭
                  </button>
                </div>
              )}

              {/* Ping Targets Table */}
              <div
                className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] overflow-hidden font-mono"
              >
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead
                      className="border-b border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]/80 text-[var(--nezha-ink-3)] text-11 font-bold uppercase tracking-wider"
                    >
                      <tr>
                        <th className="py-3 px-4">[监测目标]</th>
                        <th className="py-3 px-4">[目标地址]</th>
                        <th className="py-3 px-4">[协议]</th>
                        <th className="py-3 px-4">[检测间隔]</th>
                        <th className="py-3 px-4">[监测范围]</th>
                        <th className="py-3 px-4">[状态]</th>
                        <th className="py-3 px-4 text-right pr-6">[操作]</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--nezha-line-soft)] text-[var(--nezha-ink)]">
                      {pingTargets.map((t) => (
                        <tr
                          key={t.id || t.label}
                          className="transition-colors hover:bg-[var(--nezha-panel-sub)]/50"
                        >
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="h-2.5 w-2.5 rounded-none shrink-0"
                                style={{ backgroundColor: t.color || "#ff5a1f" }}
                              />
                              <span className="font-bold text-[var(--nezha-ink)]">
                                {t.label}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-none text-xs font-mono font-medium border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)]">
                              {t.target}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap uppercase">
                            <span
                              className="px-2 py-0.5 rounded-none text-10 font-mono font-bold border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)]"
                            >
                              {t.protocol || "tcp"}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-mono text-xs text-[var(--nezha-ink)]">
                              <strong>{t.interval || 60}</strong> 秒
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {t.servers && t.servers.length > 0 ? (
                              <span className="text-[var(--nezha-ink)]">{t.servers.length} 台服务器</span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded-none text-10 font-mono bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink-2)] border border-[var(--nezha-line)]">
                                {t.auto_start === false ? "已接入服务器" : "全部服务器"}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap" title="点击切换启用/停用状态">
                            <Switch
                              isSelected={t.enabled !== false}
                              onChange={() => handleToggleTarget(t)}
                              size="sm"
                            >
                              <Switch.Content className="gap-2">
                                <Switch.Control>
                                  <Switch.Thumb />
                                </Switch.Control>
                                <span className={cn(
                                  "text-xs font-bold font-mono",
                                  t.enabled !== false ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--nezha-ink-3)]"
                                )}>
                                  {t.enabled !== false ? "● 启用" : "○ 停用"}
                                </span>
                              </Switch.Content>
                            </Switch>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-right pr-6">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditTargetModal(t)}
                                className="h-7 px-2.5 text-11 font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] transition-colors cursor-pointer flex items-center gap-1.5"
                                aria-label="编辑监测目标"
                              >
                                <Edit2 className="h-3 w-3 text-[var(--nezha-accent)]" />
                                <span>编辑</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTarget(t.id)}
                                className="h-7 px-2.5 text-11 font-mono font-bold rounded-none border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer flex items-center gap-1.5"
                                aria-label="删除监测目标"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>删除</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {pingTargets.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-[var(--nezha-ink-3)] font-mono text-xs">
                            暂无监测目标，请点击右上角「添加监测」
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Target Cards View */}
                <div className="block md:hidden divide-y divide-[var(--nezha-line-soft)]">
                  {pingTargets.map((t) => (
                    <div
                      key={t.id || t.label}
                      className="p-3.5 space-y-2.5 bg-[var(--nezha-panel)] font-mono transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2.5 w-2.5 rounded-none shrink-0"
                            style={{ backgroundColor: t.color || "#ff5a1f" }}
                          />
                          <span className="font-bold text-xs truncate text-[var(--nezha-ink)]">
                            {t.label}
                          </span>
                          <span className="px-1.5 py-0.2 rounded-none text-10 font-mono font-bold uppercase border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] shrink-0">
                            {t.protocol || "tcp"}
                          </span>
                        </div>
                        <Switch
                          isSelected={t.enabled !== false}
                          onChange={() => handleToggleTarget(t)}
                          size="sm"
                        >
                          <Switch.Content>
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                          </Switch.Content>
                        </Switch>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-11">
                        <span className="px-2 py-0.5 rounded-none font-mono font-medium border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] text-xs">
                          {t.target}
                        </span>
                        <span className="text-[var(--nezha-ink-3)]">
                          每 <strong>{t.interval || 60}</strong> 秒检测
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-[var(--nezha-line-soft)] text-xs">
                        <span className="text-11 text-[var(--nezha-ink-3)]">
                          {t.servers && t.servers.length > 0
                            ? `${t.servers.length} 台服务器`
                            : t.auto_start === false ? "已接入服务器" : "全部服务器"}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditTargetModal(t)}
                            className="h-7 px-2.5 text-11 font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] flex items-center gap-1.5 cursor-pointer"
                          >
                            <Edit2 className="h-3 w-3 text-[var(--nezha-accent)]" />
                            <span>编辑</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTarget(t.id)}
                            className="h-7 px-2.5 text-11 font-mono font-bold rounded-none border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>删除</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {pingTargets.length === 0 && (
                    <div className="py-8 text-center text-xs text-[var(--nezha-ink-3)] font-mono">
                      暂无监测目标，请点击右上角「添加监测」
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: THEMES & EXTENSIONS */}
          {activeTab === "themes" && (
            <div className="space-y-5 animate-fade-in">
              <ThemeManagerPanel
                currentPreset={currentPreset || "btop"}
                onSelectPreset={onSelectPreset || (() => {})}
                colorMode={colorMode || "dark"}
                onSelectColorMode={onSelectColorMode || (() => {})}
                theme={theme}
                isEmbedded={true}
                canManage={true}
              />
            </div>
          )}

          {/* TAB 4: BILLING & EXCHANGE RATES */}
          {activeTab === "billing" && (
            <div className="space-y-6 font-mono">
              <div>
                <h3 className="text-base font-bold font-mono tracking-tight text-[var(--nezha-ink)]">
                  [04] 财务计费与实时汇率 BILLING & FX
                </h3>
                <p className="text-xs font-mono text-[var(--nezha-ink-3)] mt-0.5">
                  全集群主机持有成本折算 · 各币种汇率实时换算设定
                </p>
              </div>

              {/* Financial Cluster Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  className="p-5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]"
                >
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-[var(--nezha-ink-3)] mb-1">
                    <span>[04.A] 集群月度总支出 (折合人民币)</span>
                    <DollarSign className="h-4 w-4 text-[var(--nezha-accent)]" />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[var(--nezha-accent-ink)] dark:text-[var(--nezha-accent)]">
                    ¥{totalMonthlySpendCNY.toFixed(2)}
                    <span className="text-xs font-normal text-[var(--nezha-ink-3)] ml-2">/ 月</span>
                  </div>
                  <div className="text-xs font-mono text-[var(--nezha-ink-3)] mt-2">
                    根据当前各币种实时汇率折算合计月付支出
                  </div>
                </div>

                <div
                  className="p-5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]"
                >
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-[var(--nezha-ink-3)] mb-1">
                    <span>[04.B] 集群剩余总价值 (折合人民币)</span>
                    <Coins className="h-4 w-4 text-[var(--nezha-accent)]" />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[var(--nezha-ink)]">
                    ¥{totalRemainingValueCNY.toFixed(2)}
                  </div>
                  <div className="text-xs font-mono text-[var(--nezha-ink-3)] mt-2">
                    根据各主机到期时间和剩余天数实时动态计算剩余价值
                  </div>
                </div>
              </div>

              {/* Exchange Rates Config */}
              <div
                className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--nezha-line-soft)] pb-3">
                  <div>
                    <h3 className="text-sm font-bold font-mono text-[var(--nezha-ink)]">
                      外汇汇率换算表 (EXCHANGE RATES TO {systemSettings.base_currency})
                    </h3>
                    <p className="text-xs font-mono text-[var(--nezha-ink-3)] mt-0.5">
                      用于将外币主机（USD、EUR、HKD、GBP、JPY）自动换算为本币成本
                    </p>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-xs">
                    <button
                      type="button"
                      onClick={handleRefreshRates}
                      disabled={isRefreshingRates}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingRates ? "animate-spin" : ""}`} />
                      <span>获取最新实时汇率</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
                  {Object.entries(systemSettings.exchange_rates).map(([cur, rate]) => (
                    <div
                      key={cur}
                      className="p-3 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]"
                    >
                      <div className="text-11 font-bold text-[var(--nezha-ink-3)] mb-1">
                        1 {cur} =
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.001"
                          value={rate}
                          onChange={(e) =>
                            setSystemSettings({
                              ...systemSettings,
                              exchange_rates: {
                                ...systemSettings.exchange_rates,
                                [cur]: parseFloat(e.target.value) || 0,
                              },
                            })
                          }
                          className="w-full font-bold font-mono tabular-nums focus:outline-none bg-transparent text-[var(--nezha-ink)]"
                        />
                        <span className="text-[var(--nezha-ink-3)] font-mono text-11">{systemSettings.base_currency}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-mono text-[var(--nezha-ink-3)]">
                    上次汇率更新: {systemSettings.last_rate_update ? new Date(systemSettings.last_rate_update * 1000).toLocaleString() : "默认初始值"}
                  </span>

                  <div className="flex items-center gap-3 font-mono">
                    {rateSaveSuccess && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> [OK] 汇率保存成功
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveRates}
                      className="h-8 px-4 text-xs font-mono font-bold rounded-none bg-[var(--nezha-accent)] hover:bg-[#E54D16] text-[#141414] border border-[#141414]/20 shadow-none transition-colors cursor-pointer"
                    >
                      保存汇率设定
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: TOKENS */}
          {activeTab === "tokens" && (
            <div className="space-y-6 font-mono">
              <div>
                <h3 className="text-base font-bold font-mono tracking-tight text-[var(--nezha-ink)]">
                  [05] 通信鉴权密钥 AGENT TOKENS
                </h3>
                <p className="text-xs font-mono text-[var(--nezha-ink-3)] mt-0.5">
                  用于探针 Agent 接入验证通信的安全凭证
                </p>
              </div>

              {/* Create token bar */}
              <div
                className="p-3.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 w-full min-w-0">
                  <input
                    type="text"
                    placeholder="输入新 Token 标签备注 (如: 美国VPS专用)..."
                    value={newTokenLabel}
                    onChange={(e) => setNewTokenLabel(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] focus:outline-none focus:border-[var(--nezha-accent)]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateToken}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-bold rounded-none bg-[var(--nezha-accent)] hover:bg-[#E54D16] text-[#141414] border border-[#141414]/20 shadow-none transition-colors cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>生成新 Token</span>
                </button>
              </div>

              {/* Tokens list */}
              <div
                className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] overflow-hidden font-mono"
              >
                {/* Desktop Table View */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead
                      className="border-b border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]/80 text-[var(--nezha-ink-3)] text-11 font-bold uppercase tracking-wider"
                    >
                      <tr>
                        <th className="py-3 px-4">[Token 令牌]</th>
                        <th className="py-3 px-4">[备注标签]</th>
                        <th className="py-3 px-4">[创建时间]</th>
                        <th className="py-3 px-4 text-right pr-6">[操作]</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--nezha-line-soft)] text-[var(--nezha-ink)]">
                      {tokens.map((t) => (
                        <tr
                          key={t.token}
                          className="transition-colors hover:bg-[var(--nezha-panel-sub)]/50"
                        >
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-none font-mono text-xs font-bold border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)]">
                              {t.token}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-bold text-[var(--nezha-ink)]">
                            {t.label}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-xs text-[var(--nezha-ink-3)] font-mono">
                            {t.created_at ? new Date(t.created_at * 1000).toLocaleString() : "--"}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-right pr-6">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(t.token, t.token)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] transition-colors cursor-pointer ml-auto"
                            >
                              {copiedCmd === t.token ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-[var(--nezha-accent)]" />}
                              <span>{copiedCmd === t.token ? "已复制" : "复制"}</span>
                            </button>
                          </td>
                        </tr>
                      ))}

                      {tokens.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-12 text-center text-[var(--nezha-ink-3)] font-mono text-xs">
                            暂无通信 Token，请在上方输入备注标签并生成
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Tokens Cards View */}
                <div className="block sm:hidden divide-y divide-[var(--nezha-line-soft)]">
                  {tokens.map((t) => (
                    <div
                      key={t.token}
                      className="p-3.5 space-y-2 bg-[var(--nezha-panel)] font-mono transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs truncate text-[var(--nezha-ink)]">
                          {t.label || "默认令牌"}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(t.token, t.token)}
                          className="h-7 px-2 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedCmd === t.token ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-[var(--nezha-accent)]" />}
                          <span>{copiedCmd === t.token ? "已复制" : "复制"}</span>
                        </button>
                      </div>
                      <div className="p-2 rounded-none font-mono text-11 break-all border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)]">
                        {t.token}
                      </div>
                      <div className="text-10 font-mono text-[var(--nezha-ink-3)]">
                        创建时间: {t.created_at ? new Date(t.created_at * 1000).toLocaleString() : "--"}
                      </div>
                    </div>
                  ))}

                  {tokens.length === 0 && (
                    <div className="py-8 text-center text-xs text-[var(--nezha-ink-3)] font-mono">
                      暂无通信 Token，请在上方输入备注标签并生成
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: NOTIFICATIONS & ALERTS */}
          {activeTab === "notifications" && (
            <div className="space-y-6 font-mono">
              {/* Header Action Card */}
              <div className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-none shrink-0 bg-[var(--nezha-panel-sub)] border border-[var(--nezha-line)] text-[var(--nezha-accent)]">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold font-mono tracking-tight text-[var(--nezha-ink)]">
                          [06] 自定义告警与通知设置 ALERTS & CHANNELS
                        </h3>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-none text-10 font-mono font-bold bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] border border-[var(--nezha-line)]">
                          多通道冗余
                        </span>
                      </div>
                      <p className="text-xs font-mono text-[var(--nezha-ink-3)] mt-1">
                        配置 Telegram 机器人、企业级 Webhook（飞书/钉钉/企微/Bark）及 Discord 频道，实时接收节点离线、上线恢复、流量预警与定时全网日报。
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end md:self-auto font-mono text-xs">
                    <button
                      type="button"
                      disabled={testingChannel !== null}
                      onClick={() => handleTestNotification("all")}
                      className="h-8 flex items-center gap-1.5 px-3 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {testingChannel === "all" ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5 text-[var(--nezha-accent)]" />
                      )}
                      <span>{testingChannel === "all" ? "测试中..." : "全通道测试"}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSavingNotif}
                      onClick={handleSaveNotificationSettings}
                      className="h-8 flex items-center gap-1.5 px-4 text-xs font-mono font-bold rounded-none bg-[var(--nezha-accent)] text-[#141414] hover:bg-[#E54D16] border border-[#141414]/20 transition-colors cursor-pointer shadow-none disabled:opacity-50"
                    >
                      {isSavingNotif ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5 text-[#141414]" />
                      )}
                      <span>{notifSaveSuccess ? "已保存配置" : "保存通知配置"}</span>
                    </button>
                  </div>
                </div>

                {/* Banner notice for test result */}
                {testNotice && (
                  <div
                    className={cn(
                      "mt-4 rounded-none border px-3.5 py-2.5 text-xs font-mono flex items-center justify-between",
                      testNotice.success
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold"
                        : "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {testNotice.success ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0" />
                      )}
                      <span>{testNotice.msg}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTestNotice(null)}
                      className="p-1 rounded-none border border-current text-xs font-mono cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* 1. NOTIFICATION CHANNELS (3 CARDS) */}
              <div>
                <div className="flex items-center justify-between mb-3 font-mono">
                  <h4 className="text-sm font-bold flex items-center gap-2 text-[var(--nezha-ink)]">
                    <span>[06.A] 告警推送通道配置 (CHANNELS)</span>
                  </h4>
                  <span className="text-xs text-[var(--nezha-ink-3)] font-mono">
                    可同时启用多个通道进行冗余推送
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Telegram Bot */}
                  <div className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-[var(--nezha-line-soft)] mb-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-none bg-[var(--nezha-panel-sub)] border border-[var(--nezha-line)] flex items-center justify-center text-[var(--nezha-accent)]">
                            <Send className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <span className="font-bold font-mono text-xs text-[var(--nezha-ink)]">Telegram 机器人</span>
                          </div>
                        </div>
                        <Switch
                          isSelected={notificationSettings.telegram.enabled}
                          onChange={(v) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              telegram: { ...notificationSettings.telegram, enabled: v },
                            })
                          }
                          size="sm"
                          aria-label="启用 Telegram 通知"
                        >
                          <Switch.Content>
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                          </Switch.Content>
                        </Switch>
                      </div>

                      <div className="space-y-3 text-xs font-mono">
                        <div>
                          <label className="block text-11 font-bold text-[var(--nezha-ink-3)] mb-1">
                            Bot Token
                          </label>
                          <input
                            type="text"
                            value={notificationSettings.telegram.bot_token}
                            onChange={(e) =>
                              setNotificationSettings({
                                ...notificationSettings,
                                telegram: { ...notificationSettings.telegram, bot_token: e.target.value },
                              })
                            }
                            placeholder="如: 123456789:ABCdef-ghI..."
                            className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-2.5 py-1.5 focus:border-[var(--nezha-ink)] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-11 font-bold text-[var(--nezha-ink-3)] mb-1">
                            Chat ID (用户或群组ID)
                          </label>
                          <input
                            type="text"
                            value={notificationSettings.telegram.chat_id}
                            onChange={(e) =>
                              setNotificationSettings({
                                ...notificationSettings,
                                telegram: { ...notificationSettings.telegram, chat_id: e.target.value },
                              })
                            }
                            placeholder="如: -100123456789 或 98765432"
                            className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-2.5 py-1.5 focus:border-[var(--nezha-ink)] focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[var(--nezha-line-soft)] flex items-center justify-between text-xs font-mono">
                      <span className="text-11 text-[var(--nezha-ink-3)]">
                        Markdown 格式排版
                      </span>
                      <button
                        type="button"
                        disabled={testingChannel !== null}
                        onClick={() => handleTestNotification("telegram")}
                        className="px-2.5 py-1 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {testingChannel === "telegram" ? "测试中..." : "测试 Telegram"}
                      </button>
                    </div>
                  </div>

                  {/* Webhook (Feishu, DingTalk, WeCom, Bark, Custom) */}
                  <div className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-[var(--nezha-line-soft)] mb-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-none bg-[var(--nezha-panel-sub)] border border-[var(--nezha-line)] flex items-center justify-center text-[var(--nezha-accent)]">
                            <Zap className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <span className="font-bold font-mono text-xs text-[var(--nezha-ink)]">通用 / 企业 Webhook</span>
                          </div>
                        </div>
                        <Switch
                          isSelected={notificationSettings.webhook.enabled}
                          onChange={(v) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              webhook: { ...notificationSettings.webhook, enabled: v },
                            })
                          }
                          size="sm"
                          aria-label="启用 Webhook 通知"
                        >
                          <Switch.Content>
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                          </Switch.Content>
                        </Switch>
                      </div>

                      <div className="space-y-3 text-xs font-mono">
                        <div>
                          <label className="block text-11 font-bold text-[var(--nezha-ink-3)] mb-1">
                            平台协议类型
                          </label>
                          <select
                            value={notificationSettings.webhook.format}
                            onChange={(e) =>
                              setNotificationSettings({
                                ...notificationSettings,
                                webhook: { ...notificationSettings.webhook, format: e.target.value as any },
                              })
                            }
                            aria-label="平台协议类型"
                            className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-2.5 py-1.5 focus:border-[var(--nezha-ink)] focus:outline-none"
                          >
                            {WEBHOOK_FORMAT_OPTIONS.map((o) => (
                              <option key={o.key} value={o.key} className="bg-[var(--nezha-panel)] text-[var(--nezha-ink)]">
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-11 font-bold text-[var(--nezha-ink-3)] mb-1">
                            Webhook URL
                          </label>
                          <input
                            type="text"
                            value={notificationSettings.webhook.url}
                            onChange={(e) =>
                              setNotificationSettings({
                                ...notificationSettings,
                                webhook: { ...notificationSettings.webhook, url: e.target.value },
                              })
                            }
                            placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                            className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-2.5 py-1.5 focus:border-[var(--nezha-ink)] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-11 font-bold text-[var(--nezha-ink-3)] mb-1">
                            Secret 密钥 / 签名 (可选)
                          </label>
                          <input
                            type="text"
                            value={notificationSettings.webhook.secret || ""}
                            onChange={(e) =>
                              setNotificationSettings({
                                ...notificationSettings,
                                webhook: { ...notificationSettings.webhook, secret: e.target.value },
                              })
                            }
                            placeholder="可选签名密钥或 Token"
                            className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-2.5 py-1.5 focus:border-[var(--nezha-ink)] focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[var(--nezha-line-soft)] flex items-center justify-between text-xs font-mono">
                      <span className="text-11 text-[var(--nezha-ink-3)]">
                        原生适配 Markdown
                      </span>
                      <button
                        type="button"
                        disabled={testingChannel !== null}
                        onClick={() => handleTestNotification("webhook")}
                        className="px-2.5 py-1 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {testingChannel === "webhook" ? "测试中..." : "测试 Webhook"}
                      </button>
                    </div>
                  </div>

                  {/* Discord Webhook */}
                  <div className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-[var(--nezha-line-soft)] mb-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-none bg-[var(--nezha-panel-sub)] border border-[var(--nezha-line)] flex items-center justify-center text-[var(--nezha-accent)]">
                            <MessageSquare className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <span className="font-bold font-mono text-xs text-[var(--nezha-ink)]">Discord 频道</span>
                          </div>
                        </div>
                        <Switch
                          isSelected={notificationSettings.discord.enabled}
                          onChange={(v) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              discord: { ...notificationSettings.discord, enabled: v },
                            })
                          }
                          size="sm"
                          aria-label="启用 Discord 通知"
                        >
                          <Switch.Content>
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                          </Switch.Content>
                        </Switch>
                      </div>

                      <div className="space-y-3 text-xs font-mono">
                        <div>
                          <label className="block text-11 font-bold text-[var(--nezha-ink-3)] mb-1">
                            Discord Webhook URL
                          </label>
                          <input
                            type="text"
                            value={notificationSettings.discord.webhook_url}
                            onChange={(e) =>
                              setNotificationSettings({
                                ...notificationSettings,
                                discord: { ...notificationSettings.discord, webhook_url: e.target.value },
                              })
                            }
                            placeholder="https://discord.com/api/webhooks/..."
                            className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-2.5 py-1.5 focus:border-[var(--nezha-ink)] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-11 font-bold text-[var(--nezha-ink-3)] mb-1">
                            机器人自定义名称 (可选)
                          </label>
                          <input
                            type="text"
                            value={notificationSettings.discord.username || ""}
                            onChange={(e) =>
                              setNotificationSettings({
                                ...notificationSettings,
                                discord: { ...notificationSettings.discord, username: e.target.value },
                              })
                            }
                            placeholder="CyberProbe Monitor"
                            className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-2.5 py-1.5 focus:border-[var(--nezha-ink)] focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[var(--nezha-line-soft)] flex items-center justify-between text-xs font-mono">
                      <span className="text-11 text-[var(--nezha-ink-3)]">
                        Discord Embed 富文本卡片
                      </span>
                      <button
                        type="button"
                        disabled={testingChannel !== null}
                        onClick={() => handleTestNotification("discord")}
                        className="px-2.5 py-1 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {testingChannel === "discord" ? "测试中..." : "测试 Discord"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. ALERT RULES & SCHEDULED REPORTS */}
              <div>
                <div className="flex items-center justify-between mb-3 font-mono">
                  <h4 className="text-sm font-bold flex items-center gap-2 text-[var(--nezha-ink)]">
                    <span>[06.B] 智能告警规则与定时报告 (RULES & SCHEDULES)</span>
                  </h4>
                  <span className="text-xs text-[var(--nezha-ink-3)] font-mono">
                    自动检测异常并在关键指标越限时分发通知
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                  {/* Rule 1: Node Offline & Recovery */}
                  <div className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] p-4">
                    <div className="flex items-center gap-2 font-bold mb-3 text-[var(--nezha-ink)]">
                      <Radio className="h-4 w-4 text-[var(--nezha-accent)]" />
                      <span>节点失联与恢复告警</span>
                    </div>

                    <div className="space-y-3.5">
                      <Switch
                        isSelected={notificationSettings.rules.offline_alert}
                        onChange={(v) =>
                          setNotificationSettings({
                            ...notificationSettings,
                            rules: { ...notificationSettings.rules, offline_alert: v },
                          })
                        }
                        size="sm"
                      >
                        <Switch.Content className="w-full justify-between">
                          <span className="text-[var(--nezha-ink)] font-bold">
                            开启节点离线告警
                          </span>
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                        </Switch.Content>
                      </Switch>

                      <div>
                        <span className="block text-11 mb-1 font-bold text-[var(--nezha-ink-3)]">
                          离线判定超时秒数
                        </span>
                        <select
                          value={String(notificationSettings.rules.offline_threshold_sec)}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              rules: {
                                ...notificationSettings.rules,
                                offline_threshold_sec: parseInt(e.target.value) || 60,
                              },
                            })
                          }
                          aria-label="离线判定超时秒数"
                          className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-2.5 py-1.5 focus:border-[var(--nezha-ink)] focus:outline-none"
                        >
                          {OFFLINE_THRESHOLD_OPTIONS.map((o) => (
                            <option key={o.key} value={o.key} className="bg-[var(--nezha-panel)] text-[var(--nezha-ink)]">
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <Switch
                        isSelected={notificationSettings.rules.recovery_alert}
                        onChange={(v) =>
                          setNotificationSettings({
                            ...notificationSettings,
                            rules: { ...notificationSettings.rules, recovery_alert: v },
                          })
                        }
                        size="sm"
                        className="pt-2 border-t border-[var(--nezha-line-soft)]"
                      >
                        <Switch.Content className="w-full justify-between">
                          <span className="text-[var(--nezha-ink)] font-bold">
                            恢复上线通知 (含离线时长)
                          </span>
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                        </Switch.Content>
                      </Switch>
                    </div>
                  </div>

                  {/* Rule 2: Bandwidth Quota Warning */}
                  <div className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] p-4">
                    <div className="flex items-center gap-2 font-bold mb-3 text-[var(--nezha-ink)]">
                      <AlertTriangle className="h-4 w-4 text-[var(--nezha-accent)]" />
                      <span>流量配额消耗预警</span>
                    </div>

                    <div className="space-y-3.5">
                      <Switch
                        isSelected={notificationSettings.rules.traffic_alert}
                        onChange={(v) =>
                          setNotificationSettings({
                            ...notificationSettings,
                            rules: { ...notificationSettings.rules, traffic_alert: v },
                          })
                        }
                        size="sm"
                      >
                        <Switch.Content className="w-full justify-between">
                          <span className="text-[var(--nezha-ink)] font-bold">
                            开启超额预警通知
                          </span>
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                        </Switch.Content>
                      </Switch>

                      <div>
                        <span className="block text-11 mb-1 font-bold text-[var(--nezha-ink-3)]">
                          预警触发比例阈值
                        </span>
                        <select
                          value={String(notificationSettings.rules.traffic_threshold_pct)}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              rules: {
                                ...notificationSettings.rules,
                                traffic_threshold_pct: parseInt(e.target.value) || 85,
                              },
                            })
                          }
                          aria-label="预警触发比例阈值"
                          className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-2.5 py-1.5 focus:border-[var(--nezha-ink)] focus:outline-none"
                        >
                          {TRAFFIC_THRESHOLD_OPTIONS.map((o) => (
                            <option key={o.key} value={o.key} className="bg-[var(--nezha-panel)] text-[var(--nezha-ink)]">
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <p className="text-11 pt-2 border-t border-[var(--nezha-line-soft)] text-[var(--nezha-ink-3)]">
                        当节点出入网总流量达标时推送预警，内置 12 小时静默窗口避免频繁通知。
                      </p>
                    </div>
                  </div>

                  {/* Rule 3: Daily Summary Report */}
                  <div className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] p-4">
                    <div className="flex items-center gap-2 font-bold mb-3 text-[var(--nezha-ink)]">
                      <Clock className="h-4 w-4 text-[var(--nezha-accent)]" />
                      <span>定时全网流量与监控简报</span>
                    </div>

                    <div className="space-y-3.5">
                      <Switch
                        isSelected={notificationSettings.rules.daily_report}
                        onChange={(v) =>
                          setNotificationSettings({
                            ...notificationSettings,
                            rules: { ...notificationSettings.rules, daily_report: v },
                          })
                        }
                        size="sm"
                      >
                        <Switch.Content className="w-full justify-between">
                          <span className="text-[var(--nezha-ink)] font-bold">
                            开启每日定时播报
                          </span>
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                        </Switch.Content>
                      </Switch>

                      <div>
                        <span className="block text-11 mb-1 font-bold text-[var(--nezha-ink-3)]">
                          每日推送时间 (24小时制)
                        </span>
                        <input
                          type="time"
                          value={notificationSettings.rules.daily_report_time || "09:00"}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              rules: { ...notificationSettings.rules, daily_report_time: e.target.value },
                            })
                          }
                          className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-2.5 py-1.5 focus:border-[var(--nezha-ink)] focus:outline-none"
                        />
                      </div>

                      <p className="text-11 pt-2 border-t border-[var(--nezha-line-soft)] text-[var(--nezha-ink-3)]">
                        定时汇总集群在线率、全网吞吐量 (Tx/Rx) 及高负荷节点清单推送至已启用通道。
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. RECENT NOTIFICATION AUDIT LOGS */}
              <div className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] p-5 font-mono">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-[var(--nezha-ink)]">
                      [06.C] 告警推送记录与审计日志 (AUDIT LOGS)
                    </h4>
                    <span className="px-2 py-0.5 rounded-none text-10 font-mono font-bold bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] border border-[var(--nezha-line)]">
                      共 {logTotal} 条记录
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => fetchNotificationLogs(logPage)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] transition-colors cursor-pointer"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>刷新</span>
                    </button>
                    {notificationLogs.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearNotificationLogs}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-bold rounded-none border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>清空历史</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="border-b border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]/80 text-[var(--nezha-ink-3)] text-11 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">[时间]</th>
                        <th className="py-2.5 px-3">[推送通道]</th>
                        <th className="py-2.5 px-3">[事件类型]</th>
                        <th className="py-2.5 px-3">[消息标题与详情]</th>
                        <th className="py-2.5 px-3 text-right pr-4">[投递状态]</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--nezha-line-soft)] text-[var(--nezha-ink)]">
                      {notificationLogs.map((logItem) => {
                        let typeText = "通知";
                        let typeClass = "border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)]";
                        if (logItem.type === "offline") {
                          typeClass = "border-rose-500/40 bg-rose-500/10 text-rose-500";
                          typeText = "节点离线";
                        } else if (logItem.type === "recovery") {
                          typeClass = "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
                          typeText = "上线恢复";
                        } else if (logItem.type === "traffic") {
                          typeClass = "border-amber-500/40 bg-amber-500/10 text-amber-500";
                          typeText = "流量预警";
                        } else if (logItem.type === "daily_report") {
                          typeClass = "border-sky-500/40 bg-sky-500/10 text-sky-500";
                          typeText = "每日简报";
                        } else if (logItem.type === "test") {
                          typeClass = "border-[var(--nezha-accent)]/40 bg-[var(--nezha-accent)]/10 text-[var(--nezha-accent)]";
                          typeText = "测试消息";
                        }

                        return (
                          <tr
                            key={logItem.id}
                            className="transition-colors hover:bg-[var(--nezha-panel-sub)]/50"
                          >
                            <td className="py-2.5 px-3 whitespace-nowrap text-[var(--nezha-ink-3)] font-mono text-11">
                              {new Date(logItem.timestamp * 1000).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-none text-10 font-mono font-bold uppercase bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] border border-[var(--nezha-line)]">
                                {logItem.channel}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-none text-10 font-mono font-bold border ${typeClass}`}>
                                {typeText}
                              </span>
                            </td>

                            <td className="py-2.5 px-3 max-w-md">
                              <div className="font-bold truncate text-[var(--nezha-ink)]">
                                {logItem.title}
                              </div>
                              <div className="text-11 text-[var(--nezha-ink-3)] truncate mt-0.5 font-mono">
                                {logItem.content.replace(/\n/g, " · ")}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap text-right pr-4">
                              {logItem.status === "success" ? (
                                <span className="inline-flex items-center gap-1 text-emerald-500 font-bold text-xs">
                                  <Check className="h-3.5 w-3.5" />
                                  <span>已送达</span>
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-rose-500 font-bold text-xs"
                                  title={logItem.error_msg || "投递失败"}
                                >
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  <span>失败</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {notificationLogs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-[var(--nezha-ink-3)] font-mono text-xs">
                            {logPage > 0
                              ? "这一页没有记录了，可能刚被清空或已翻过末页。"
                              : "暂无告警推送记录。当节点状态发生变化或点击测试通知时，将在此记录审计日志。"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Notification Logs View */}
                <div className="block md:hidden divide-y divide-[var(--nezha-line-soft)]">
                  {notificationLogs.map((logItem) => {
                    let typeText = "通知";
                    let typeClass = "border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)]";
                    if (logItem.type === "offline") {
                      typeClass = "border-rose-500/40 bg-rose-500/10 text-rose-500";
                      typeText = "节点离线";
                    } else if (logItem.type === "recovery") {
                      typeClass = "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
                      typeText = "上线恢复";
                    } else if (logItem.type === "traffic") {
                      typeClass = "border-amber-500/40 bg-amber-500/10 text-amber-500";
                      typeText = "流量预警";
                    } else if (logItem.type === "daily_report") {
                      typeClass = "border-sky-500/40 bg-sky-500/10 text-sky-500";
                      typeText = "每日简报";
                    } else if (logItem.type === "test") {
                      typeClass = "border-[var(--nezha-accent)]/40 bg-[var(--nezha-accent)]/10 text-[var(--nezha-accent)]";
                      typeText = "测试消息";
                    }

                    return (
                      <div
                        key={logItem.id}
                        className="p-3.5 space-y-1.5 bg-[var(--nezha-panel)] font-mono transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded-none text-10 font-mono font-bold uppercase bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] border border-[var(--nezha-line)]">
                              {logItem.channel}
                            </span>
                            <span className={`px-2 py-0.5 rounded-none text-10 font-mono font-bold border ${typeClass}`}>
                              {typeText}
                            </span>
                          </div>
                          {logItem.status === "success" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-500 font-bold text-xs shrink-0">
                              <Check className="h-3.5 w-3.5" />
                              <span>已送达</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-rose-500 font-bold text-xs shrink-0"
                              title={logItem.error_msg || "投递失败"}
                            >
                              <AlertCircle className="h-3.5 w-3.5" />
                              <span>失败</span>
                            </span>
                          )}
                        </div>

                        <div className="font-bold text-xs text-[var(--nezha-ink)]">
                          {logItem.title}
                        </div>
                        <div className="text-11 text-[var(--nezha-ink-3)] break-words font-mono">
                          {logItem.content}
                        </div>
                        <div className="text-10 font-mono text-[var(--nezha-ink-3)] pt-0.5">
                          {new Date(logItem.timestamp * 1000).toLocaleString()}
                        </div>
                      </div>
                    );
                  })}

                  {notificationLogs.length === 0 && (
                    <div className="py-8 text-center text-xs text-[var(--nezha-ink-3)] font-mono">
                      {logPage > 0
                        ? "这一页没有记录了，可能刚被清空或已翻过末页。"
                        : "暂无告警推送记录。当节点状态发生变化或点击测试通知时，将在此记录审计日志。"}
                    </div>
                  )}
                </div>

                {/* Pager */}
                {logTotal > LOG_PAGE_SIZE && (
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--nezha-line-soft)] pt-3 font-mono text-11 text-[var(--nezha-ink-3)]">
                    <span>
                      第 {logPage * LOG_PAGE_SIZE + 1}–
                      {Math.min((logPage + 1) * LOG_PAGE_SIZE, logTotal)} 条 · 共{" "}
                      {Math.ceil(logTotal / LOG_PAGE_SIZE)} 页
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={logPage === 0}
                        onClick={() => fetchNotificationLogs(logPage - 1)}
                        className="px-2.5 py-1 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3 w-3" />
                        <span>上一页</span>
                      </button>
                      <button
                        type="button"
                        disabled={(logPage + 1) * LOG_PAGE_SIZE >= logTotal}
                        onClick={() => fetchNotificationLogs(logPage + 1)}
                        className="px-2.5 py-1 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      >
                        <span>下一页</span>
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Add / Edit Ping Target */}
      {isTargetModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in font-mono">
          <div className="relative w-full max-w-lg rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] shadow-2xl p-6 font-mono">
            <div className="flex items-center justify-between border-b border-[var(--nezha-line-soft)] pb-4 mb-5">
              <div>
                <h2 className="text-base font-bold font-mono tracking-tight text-[var(--nezha-ink)]">
                  [ CONFIG · PING TARGET ]
                </h2>
                <div className="text-11 font-mono text-[var(--nezha-ink-3)] mt-0.5">
                  // {editingTargetId ? "编辑网络监测目标" : "添加网络监测目标"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTargetModalOpen(false)}
                className="h-7 w-7 flex items-center justify-center rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] cursor-pointer"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 font-mono text-xs">
              {/* 1. 名称 */}
              <div>
                <label className="block font-bold text-11 mb-1.5 text-[var(--nezha-ink-3)] uppercase">
                  目标名称 (Label)
                </label>
                <input
                  type="text"
                  value={targetFormName}
                  onChange={(e) => setTargetFormName(e.target.value)}
                  placeholder="如: Google, 电信, YouTube"
                  className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-3 py-2 focus:border-[var(--nezha-ink)] focus:outline-none"
                />
              </div>

              {/* 2. 目标地址 */}
              <div>
                <label className="block font-bold text-11 mb-1.5 text-[var(--nezha-ink-3)] uppercase">
                  目标地址 (Target IP 或域名)
                </label>
                <input
                  type="text"
                  value={targetFormAddress}
                  onChange={(e) => setTargetFormAddress(e.target.value)}
                  placeholder="如: 8.8.8.8, 223.5.5.5, www.google.com"
                  className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-3 py-2 focus:border-[var(--nezha-ink)] focus:outline-none"
                />
              </div>

              {/* 3. 类型 */}
              <div>
                <label className="block font-bold text-11 mb-1.5 text-[var(--nezha-ink-3)] uppercase">
                  监测协议类型 (Protocol)
                </label>
                <div className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] p-1.5 space-y-1">
                  {(["icmp", "tcp", "http"] as const).map((typeKey) => {
                    const isSelected = targetFormType === typeKey;
                    const labelText = typeKey.toUpperCase();
                    return (
                      <button
                        key={typeKey}
                        type="button"
                        onClick={() => setTargetFormType(typeKey)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 rounded-none cursor-pointer transition-colors text-left text-xs font-mono",
                          isSelected
                            ? "bg-[var(--nezha-accent)] text-[#141414] font-bold"
                            : "hover:bg-[var(--nezha-panel)] text-[var(--nezha-ink)]"
                        )}
                      >
                        <span className="w-4 text-center font-bold">
                          {isSelected ? "✓" : ""}
                        </span>
                        <span className="font-bold">{labelText}</span>
                        {typeKey === "icmp" && (
                          <span className={cn("text-11 ml-auto font-normal", isSelected ? "text-[#141414]/80" : "text-[var(--nezha-ink-3)]")}>
                            网络层 Ping (ICMP Echo)
                          </span>
                        )}
                        {typeKey === "tcp" && (
                          <span className={cn("text-11 ml-auto font-normal", isSelected ? "text-[#141414]/80" : "text-[var(--nezha-ink-3)]")}>
                            TCP 端口连接测试
                          </span>
                        )}
                        {typeKey === "http" && (
                          <span className={cn("text-11 ml-auto font-normal", isSelected ? "text-[#141414]/80" : "text-[var(--nezha-ink-3)]")}>
                            Web HTTP(S) 响应探测
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* TCP Port field if TCP */}
              {targetFormType === "tcp" && (
                <div>
                  <label className="block font-bold text-11 mb-1.5 text-[var(--nezha-ink-3)] uppercase">
                    TCP 端口 (Port)
                  </label>
                  <input
                    type="number"
                    value={targetFormPort}
                    onChange={(e) => setTargetFormPort(parseInt(e.target.value) || 443)}
                    placeholder="443"
                    className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-3 py-2 focus:border-[var(--nezha-ink)] focus:outline-none"
                  />
                </div>
              )}

              {/* 4. 服务器选择 */}
              <div>
                <label className="block font-bold text-11 mb-1.5 text-[var(--nezha-ink-3)] uppercase">
                  执行监测的探针服务器
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsServerPickerOpen(!isServerPickerOpen)}
                    className="px-3 py-1.5 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>{isServerPickerOpen ? "收起选择" : "选择服务器"}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isServerPickerOpen ? "rotate-180" : ""}`} />
                  </button>
                  <span className="text-xs font-mono text-[var(--nezha-ink)] font-bold">
                    {targetFormServers.length === 0
                      ? (targetFormAutoStart ? "所有服务器 (含新接入)" : "当前已接入服务器")
                      : `已选 ${targetFormServers.length} 台服务器`}
                  </span>
                </div>

                {/* Server Picker dropdown */}
                {isServerPickerOpen && (
                  <div className="mt-2 p-2 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] space-y-1 max-h-44 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => setTargetFormServers([])}
                      className={cn(
                        "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none cursor-pointer text-xs font-mono transition-colors text-left",
                        targetFormServers.length === 0
                          ? "bg-[var(--nezha-panel-sub)] text-[var(--nezha-accent)] font-bold border border-[var(--nezha-line)]"
                          : "hover:bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)]"
                      )}
                    >
                      {targetFormServers.length === 0 ? (
                        <CheckSquare className="h-4 w-4 text-[var(--nezha-accent)] shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-[var(--nezha-ink-3)] shrink-0" />
                      )}
                      <span>{targetFormAutoStart ? "全部服务器 (含新接入节点)" : "当前已接入服务器"}</span>
                    </button>
                    {nodes.map((node) => {
                      const isChecked = targetFormServers.includes(node.node_id);
                      return (
                        <button
                          key={node.node_id}
                          type="button"
                          onClick={() => {
                            if (isChecked) {
                              setTargetFormServers(targetFormServers.filter((id) => id !== node.node_id));
                            } else {
                              setTargetFormServers([...targetFormServers, node.node_id]);
                            }
                          }}
                          className={cn(
                            "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none cursor-pointer text-xs font-mono transition-colors text-left",
                            isChecked
                              ? "bg-[var(--nezha-panel-sub)] text-[var(--nezha-accent)] font-bold border border-[var(--nezha-line)]"
                              : "hover:bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)]"
                          )}
                        >
                          {isChecked ? (
                            <CheckSquare className="h-4 w-4 text-[var(--nezha-accent)] shrink-0" />
                          ) : (
                            <Square className="h-4 w-4 text-[var(--nezha-ink-3)] shrink-0" />
                          )}
                          <span className="truncate">{node.name} <span className="font-mono text-11 text-[var(--nezha-ink-3)]">({node.node_id})</span></span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Checkbox: 默认开启 */}
                <div className="mt-3">
                  <Switch
                    isSelected={targetFormAutoStart}
                    onChange={setTargetFormAutoStart}
                    size="sm"
                  >
                    <Switch.Content className="gap-2">
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <span className="text-xs font-bold font-mono text-[var(--nezha-ink)]">
                        默认自动开启监测
                      </span>
                    </Switch.Content>
                  </Switch>
                  <p className="text-11 mt-0.5 ml-11 text-[var(--nezha-ink-3)] font-mono">
                    开启后，新接入的服务器将自动启动对该目标的监控，已存在的服务器不受影响。
                  </p>
                </div>
              </div>

              {/* 5. 间隔 (秒) */}
              <div>
                <label className="block font-bold text-11 mb-1.5 text-[var(--nezha-ink-3)] uppercase">
                  检测采样间隔 (秒)
                </label>
                <input
                  type="number"
                  min="5"
                  value={targetFormInterval}
                  onChange={(e) => setTargetFormInterval(parseInt(e.target.value) || 60)}
                  placeholder="60"
                  className="w-full font-mono text-xs rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-3 py-2 focus:border-[var(--nezha-ink)] focus:outline-none"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 font-mono text-xs pt-4 border-t border-[var(--nezha-line-soft)]">
              <button
                type="button"
                onClick={() => setIsTargetModalOpen(false)}
                className="h-8 px-4 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] hover:border-[var(--nezha-ink)] transition-colors cursor-pointer"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={handleSavePingTargetModal}
                className="h-8 px-4 text-xs font-mono font-bold rounded-none bg-[var(--nezha-accent)] text-[#141414] hover:bg-[#E54D16] border border-[#141414]/20 transition-colors cursor-pointer shadow-none"
              >
                {editingTargetId ? "保存修改" : "确认添加"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG: Add host (one-click deploy command) */}
      {isDeployDialogOpen && (
        <HostDeployDialog
          deployToken={deployToken}
          theme={theme}
          onClose={() => setIsDeployDialogOpen(false)}
          onRegenerateToken={handleRegenerateDeployToken}
        />
      )}

      {/* DIALOG: Configure an existing host. Keyed on the node so switching rows
          rebuilds the draft instead of carrying the previous host's values. */}
      {editingHost && (
        <HostEditDialog
          key={editingHost.node_id}
          node={editingHost}
          theme={theme}
          onClose={() => setEditingHost(null)}
          onSaved={onRefreshNodes}
        />
      )}

    </div>
  );
};

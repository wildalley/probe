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
  Globe,
  Terminal,
  Calendar,
  CreditCard,
  Coins,
  Shield,
  AlertCircle,
  ExternalLink,
  ChevronDown,
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
  type LucideIcon,
} from "lucide-react";
import {
  NodeState,
  PingTargetConfig,
  NodeSettings,
  SystemSettings,
  TokenItem,
  NotificationSettings,
  NotificationLog,
} from "../types";
import { getRegionFlag } from "../utils/flags";
import { cn } from "../lib/utils";
import { TagInput } from "./TagInput";
import { DatePicker } from "./DatePicker";
import { BandwidthConfig } from "./BandwidthConfig";

type TabKey = "hosts" | "network" | "billing" | "tokens" | "notifications";

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: NodeState[];
  theme?: "blueprint" | "dark";
  onRefreshNodes?: () => void;
}

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
}) => {
  const isBlueprint = theme === "blueprint";
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

  const fetchNotificationLogs = async () => {
    try {
      const res = await fetch("/api/v1/notifications/logs?limit=50");
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d)) setNotificationLogs(d);
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

  // --- Host Edit State ---
  const [editingNode, setEditingNode] = useState<NodeSettings | null>(null);
  const [hostSaveSuccess, setHostSaveSuccess] = useState(false);
  const [isResolvingGeo, setIsResolvingGeo] = useState(false);
  const [autoGeoNotice, setAutoGeoNotice] = useState<string | null>(null);

  const handleAutoResolveNodeGeo = async () => {
    if (!editingNode) return;
    const targetNode = nodes.find((n) => n.node_id === editingNode.node_id);
    const ip = editingNode.public_ip || targetNode?.system?.public_ip || "";
    if (!ip || ip === "127.0.0.1" || ip === "::1") {
      alert("该节点未上报真实公网 IP（当前为局域网/回环地址），无法在线查询全球运营商");
      return;
    }

    try {
      setIsResolvingGeo(true);
      setAutoGeoNotice(null);
      const res = await fetch(`/api/v1/geoip/lookup?ip=${encodeURIComponent(ip)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.country_code) {
          const currentTags = editingNode.tags || [];
          const newTags = data.line_tag && !currentTags.includes(data.line_tag)
            ? [...currentTags, data.line_tag]
            : currentTags;

          setEditingNode({
            ...editingNode,
            region: data.country_code !== "GLOBAL" ? data.country_code : editingNode.region,
            provider: data.provider || editingNode.provider,
            tags: newTags,
          });
          setAutoGeoNotice(`已根据公网 IP 自动识别：${data.country || data.country_code} · ${data.provider} (${data.line_tag})`);
          setTimeout(() => setAutoGeoNotice(null), 6000);
        }
      }
    } catch (e: any) {
      alert(`识别失败: ${e.message}`);
    } finally {
      setIsResolvingGeo(false);
    }
  };

  // --- Tokens State ---
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Quick deploy script state
  const [deployToken, setDeployToken] = useState("sk_default_secret_probe_token");
  const [deployName, setDeployName] = useState("node-01");
  const [showManualOverride, setShowManualOverride] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Tab bar is data-driven so the five entries can't drift apart visually.
  // `badge` is omitted where there's no count to show (billing).
  const tabItems: {
    key: TabKey;
    icon: LucideIcon;
    label: string;
    badge?: number | string;
    badgeTone?: "count" | "new";
  }[] = [
    { key: "hosts", icon: Server, label: "主机管理", badge: nodes.length },
    { key: "network", icon: Activity, label: "网络延迟与丢包检测", badge: pingTargets.length },
    { key: "billing", icon: Coins, label: "财务计费与实时汇率" },
    { key: "tokens", icon: Key, label: "通信鉴权 Token", badge: tokens.length },
    { key: "notifications", icon: Bell, label: "自定义通知与告警", badge: "NEW", badgeTone: "new" },
  ];

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    // The notifications pane reads from the server rather than local state.
    if (key === "notifications") {
      fetchNotificationSettings();
      fetchNotificationLogs();
    }
  };

  // Load Data on open
  useEffect(() => {
    if (!isOpen) return;

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
  const handleEditNodeClick = (node: NodeState) => {
    const liveTraffic = (node.network.bytes_sent || 0) + (node.network.bytes_recv || 0);
    setEditingNode({
      node_id: node.node_id,
      name: node.name,
      region: node.region,
      tags: node.tags || [],
      provider: node.billing?.provider || "",
      public_ip: node.system.public_ip || "",
      price: node.billing?.price || node.billing?.price_per_month || 9.9,
      currency: node.billing?.currency || "$",
      billing_cycle: node.billing?.billing_cycle || "month",
      expiry_date: node.billing?.expiry_date || "",
      bandwidth_quota: node.billing?.bandwidth_quota || 2 * 1024 * 1024 * 1024 * 1024,
      bandwidth_used: node.billing?.bandwidth_used || liveTraffic,
      auto_renewal: node.billing?.auto_renewal || false,
    });
  };

  const handleSaveNodeSettings = async () => {
    if (!editingNode) return;
    try {
      const res = await fetch(`/api/v1/nodes/${encodeURIComponent(editingNode.node_id)}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingNode),
      });
      if (res.ok) {
        setHostSaveSuccess(true);
        setTimeout(() => {
          setHostSaveSuccess(false);
          setEditingNode(null);
        }, 1500);
        if (onRefreshNodes) onRefreshNodes();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteNode = async (nodeID: string) => {
    if (!confirm(`确定要永久删除节点 "${nodeID}" 吗？其历史指标数据也将被移除。`)) return;
    try {
      const res = await fetch(`/api/v1/nodes/${encodeURIComponent(nodeID)}`, { method: "DELETE" });
      if (res.ok) {
        if (onRefreshNodes) onRefreshNodes();
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

  const handleRegenerateDeployToken = async () => {
    try {
      const res = await fetch("/api/v1/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: `Auto Token ${new Date().toLocaleTimeString()}` }),
      });
      if (res.ok) {
        const created = await res.json();
        setDeployToken(created.token);
        setTokens((prev) => [created, ...prev]);
      }
    } catch (e) {
      console.error(e);
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
    const cur = n.billing?.currency || "$";
    const rate = cur === "$" ? (systemSettings.exchange_rates["USD"] || 7.18) :
                 cur === "€" ? (systemSettings.exchange_rates["EUR"] || 7.82) :
                 cur === "HK$" ? (systemSettings.exchange_rates["HKD"] || 0.92) :
                 cur === "£" ? (systemSettings.exchange_rates["GBP"] || 9.35) :
                 cur === "JP¥" ? (systemSettings.exchange_rates["JPY"] || 0.048) : 1.0;

    const monthlyCost = n.billing?.price_per_month || 0;
    totalMonthlySpendCNY += monthlyCost * rate;
    totalRemainingValueCNY += n.billing?.remaining_value || 0;
  });

  const serverHost = window.location.host || "127.0.0.1:8080";
  const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProto}//${serverHost}`;
  const httpUrl = `${window.location.protocol}//${serverHost}`;
  const oneClickCmd = `curl -sSL ${httpUrl}/install.sh | sudo bash -s -- --server "${wsUrl}" --token "${deployToken}" --name "${deployName}"`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in font-sans">
      <div
        className={`relative flex flex-col w-full max-w-[1440px] h-[92vh] rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
          isBlueprint
            ? "bg-slate-50 border-slate-200/90 text-slate-900"
            : "bg-zinc-950 border-zinc-800 text-zinc-100"
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-6 py-3.5 border-b shrink-0 ${
            isBlueprint ? "bg-white border-slate-200/80" : "bg-zinc-900/90 border-zinc-800"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200/80 text-indigo-600 dark:bg-indigo-950/50 dark:border-indigo-800/60 dark:text-indigo-400">
              <Sliders className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-sans tracking-tight text-slate-900 dark:text-zinc-100">
                  PROBE ADMIN CONSOLE
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-11 font-sans font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-400 dark:border-indigo-800">
                  管理后台
                </span>
              </div>
              <p className={`text-xs font-sans mt-0.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                主机管理 · 网络延迟丢包监控 · 财务定价与实时汇率 · 自定义多渠道通知
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          className={cn(
            "px-6 border-b shrink-0 overflow-x-auto",
            isBlueprint ? "bg-white border-slate-200/80" : "bg-zinc-900/60 border-zinc-800"
          )}
        >
          <div role="tablist" className="tabs tabs-bordered flex-nowrap min-w-max -mb-px">
            {tabItems.map(({ key, icon: Icon, label, badge, badgeTone }) => (
              <button
                key={key}
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => handleTabChange(key)}
                className={cn(
                  "tab h-11 flex items-center gap-2 text-xs font-sans transition-all cursor-pointer",
                  activeTab === key
                    ? "tab-active !border-indigo-600 !text-indigo-600 dark:!border-indigo-500 dark:!text-indigo-400 font-semibold"
                    : "!border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                {badge != null && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5",
                      badgeTone === "new"
                        ? "text-9 font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-400 dark:border-indigo-800"
                        : "text-10 font-mono bg-slate-100 text-slate-600 border border-slate-200/60 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700/60"
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>


        {/* Tab Contents. Keyed on activeTab so switching panes fades in and
            resets the scroll position instead of keeping the previous offset. */}
        <div key={activeTab} className="flex-1 overflow-y-auto p-6 space-y-6 animate-fade-in">
          {/* TAB 1: HOSTS */}
          {activeTab === "hosts" && (
            <div className="space-y-6">
              {/* Quick Deploy Card */}
              <div
                className={`rounded-xl border p-5 transition-all shadow-xs ${
                  isBlueprint
                    ? "bg-white border-slate-200/90"
                    : "bg-zinc-900/80 border-zinc-800"
                }`}
              >
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 border-b pb-3 mb-4 font-sans ${
                    isBlueprint ? "border-slate-200/80" : "border-zinc-800"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      isBlueprint
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200/70"
                        : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                    } shrink-0`}>
                      <Terminal className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className={`text-sm font-bold tracking-tight ${isBlueprint ? "text-slate-800" : "text-zinc-100"}`}>
                          快速添加主机 / 一键部署命令
                        </h3>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-10 font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60">
                          极速上线
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                    自动识别地区 · 内嵌通信令牌 · 自动注册 Systemd 守护进程
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans mb-4">
                  <div>
                    <label className={`block mb-1.5 font-medium ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                      节点名称 (Name)
                    </label>
                    <input
                      type="text"
                      value={deployName}
                      onChange={(e) => setDeployName(e.target.value)}
                      placeholder="node-01"
                      className={`input input-bordered input-sm w-full font-mono text-xs focus:outline-none ${
                        isBlueprint
                          ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                          : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                      }`}
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <div className={`p-2 rounded-lg border flex items-center gap-2 text-xs font-sans min-h-[38px] ${
                      isBlueprint ? "bg-slate-50/70 border-slate-200/80 text-slate-700" : "bg-zinc-950/80 border-zinc-800 text-zinc-300"
                    }`}>
                      <Globe className="h-4 w-4 text-sky-500 shrink-0" />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">地区与线路:</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-11 font-medium bg-sky-50 text-sky-700 border border-sky-200/70 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60">
                          ● 全自动识别
                        </span>
                        <span className="text-11 text-slate-500 dark:text-zinc-500">公网 IP 智能匹配</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Token Auto Badge */}
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-sans mb-3.5 transition-colors ${
                    isBlueprint ? "bg-slate-50/60 border-slate-200/80 shadow-xs" : "bg-zinc-950/80 border-zinc-800/80"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className={isBlueprint ? "text-slate-700 font-medium" : "text-zinc-300"}>通信 Token:</span>
                    <code className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-xs font-mono">
                      {deployToken.slice(0, 14)}...{deployToken.slice(-6)}
                    </code>
                    <span className={`text-11 hidden sm:inline ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                      (已自动嵌入下方安装命令)
                    </span>
                  </div>
                  <button
                    onClick={handleRegenerateDeployToken}
                    className="btn btn-xs btn-ghost text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium gap-1"
                    title="重新生成并更换一个新 Token"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>更换 Token</span>
                  </button>
                </div>

                {/* Command Shell Block */}
                <div className="relative group">
                  <pre
                    className="p-4 rounded-xl border border-slate-800 bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap select-all leading-relaxed shadow-inner"
                  >
                    {oneClickCmd}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(oneClickCmd, "deployCmd")}
                    className="absolute right-3 top-3 btn btn-sm btn-primary font-sans font-medium shadow-md gap-1.5"
                  >
                    {copiedCmd === "deployCmd" ? <Check className="h-3.5 w-3.5 text-white" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedCmd === "deployCmd" ? "已复制" : "复制命令"}</span>
                  </button>
                </div>
              </div>

              {/* Node Editing Form (If active) */}
              {editingNode && (
                <div
                  className={`rounded-2xl border p-5 space-y-4 animate-fade-in shadow-xl ${
                    isBlueprint ? "bg-white border-indigo-300 shadow-lg shadow-indigo-500/5" : "bg-zinc-900 border-indigo-500/60 shadow-black"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 font-sans">
                    <div className="flex items-center gap-2 font-bold text-base text-indigo-600 dark:text-indigo-400">
                      <Edit2 className="h-4 w-4" />
                      <span>编辑主机配置: {editingNode.name || editingNode.node_id}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingNode(null);
                          setAutoGeoNotice(null);
                        }}
                        className="btn btn-sm btn-ghost font-sans text-xs"
                      >
                        取消
                      </button>
                    </div>
                  </div>

                  {autoGeoNotice && (
                    <div className="alert alert-success py-2.5 px-3.5 text-xs font-sans flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>{autoGeoNotice}</span>
                    </div>
                  )}

                  {/* Auto-identified Region & Provider Badge Card */}
                  <div
                    className={`rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3 ${
                      isBlueprint
                        ? "bg-indigo-50/50 border-indigo-200 text-slate-800"
                        : "bg-indigo-950/20 border-indigo-900/60 text-zinc-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-3 font-sans text-xs">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Globe className="h-4 w-4 text-sky-500 shrink-0" />
                        <span className={isBlueprint ? "text-slate-700" : "text-zinc-300"}>归属地区:</span>
                        <span className="badge badge-info badge-outline font-bold gap-1 py-2 px-2.5">
                          <span className="text-sm">{getRegionFlag(editingNode.region || "")}</span>
                          <span>{editingNode.region || "自动识别中"}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 font-bold">
                        <span className={isBlueprint ? "text-slate-700" : "text-zinc-300"}>服务商/线路:</span>
                        <span className="badge badge-success badge-outline font-bold py-2 px-2.5">
                          {editingNode.provider || "智能测定中..."}
                        </span>
                      </div>

                      {editingNode.public_ip && (
                        <span className={`text-11 font-mono ${isBlueprint ? "text-slate-500" : "text-zinc-500"}`}>
                          (出口 IP: {editingNode.public_ip})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAutoResolveNodeGeo}
                        disabled={isResolvingGeo}
                        className="btn btn-xs btn-outline btn-primary gap-1 font-sans font-medium"
                        title="根据该节点公网 IP 自动重新解析国家地区与网络线路"
                      >
                        <Zap className={`h-3 w-3 ${isResolvingGeo ? "animate-spin" : ""}`} />
                        <span>{isResolvingGeo ? "识别中..." : "重新识别"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowManualOverride(!showManualOverride)}
                        className="btn btn-xs btn-ghost text-10 text-slate-500 dark:text-zinc-400 font-sans"
                      >
                        {showManualOverride ? "收起手动覆盖" : "手动微调 ▾"}
                      </button>
                    </div>
                  </div>

                  {/* Optional Manual Override Inputs (Collapsed by default) */}
                  {showManualOverride && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 text-xs font-sans animate-fade-in">
                      <div>
                        <label className={`block mb-1 font-medium ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                          强制指定地区 (覆盖自动识别)
                        </label>
                        <input
                          type="text"
                          value={editingNode.region || ""}
                          onChange={(e) => setEditingNode({ ...editingNode, region: e.target.value })}
                          placeholder="如 HK, US, JP, SG 等"
                          className={`input input-bordered input-sm w-full font-sans text-xs focus:outline-none ${
                            isBlueprint
                              ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                              : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                          }`}
                        />
                      </div>
                      <div>
                        <label className={`block mb-1 font-medium ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                          强制指定服务商/线路 (覆盖自动识别)
                        </label>
                        <input
                          type="text"
                          value={editingNode.provider || ""}
                          onChange={(e) => setEditingNode({ ...editingNode, provider: e.target.value })}
                          placeholder="如 BandwagonHost CN2 GIA, Oracle"
                          className={`input input-bordered input-sm w-full font-sans text-xs focus:outline-none ${
                            isBlueprint
                              ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                              : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                          }`}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 text-xs font-sans">
                    <div className="sm:col-span-2 md:col-span-1">
                      <label className={`block mb-1 font-medium ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                        主机展示名称 (Name)
                      </label>
                      <input
                        type="text"
                        value={editingNode.name || ""}
                        onChange={(e) => setEditingNode({ ...editingNode, name: e.target.value })}
                        className={`input input-bordered input-sm w-full font-sans text-xs focus:outline-none ${
                          isBlueprint
                            ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                            : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block mb-1 font-medium ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                        计费单价 (Price)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={editingNode.price}
                        onChange={(e) => setEditingNode({ ...editingNode, price: parseFloat(e.target.value) || 0 })}
                        className={`input input-bordered input-sm w-full font-mono text-xs font-bold focus:outline-none ${
                          isBlueprint
                            ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                            : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block mb-1 font-medium ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                        货币单位 (Currency)
                      </label>
                      <select
                        value={editingNode.currency}
                        onChange={(e) => setEditingNode({ ...editingNode, currency: e.target.value })}
                        className={`select select-bordered select-sm w-full font-mono text-xs font-bold focus:outline-none cursor-pointer ${
                          isBlueprint
                            ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                            : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                        }`}
                      >
                        <option value="$">$ (USD - 美元)</option>
                        <option value="¥">¥ (CNY - 人民币)</option>
                        <option value="€">€ (EUR - 欧元)</option>
                        <option value="HK$">HK$ (HKD - 港币)</option>
                        <option value="£">£ (GBP - 英镑)</option>
                        <option value="JP¥">JP¥ (JPY - 日元)</option>
                      </select>
                    </div>
                    <div>
                      <label className={`block mb-1 font-medium ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                        计费周期 (Billing Cycle)
                      </label>
                      <select
                        value={editingNode.billing_cycle}
                        onChange={(e) => setEditingNode({ ...editingNode, billing_cycle: e.target.value })}
                        className={`select select-bordered select-sm w-full font-sans text-xs font-semibold focus:outline-none cursor-pointer ${
                          isBlueprint
                            ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                            : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                        }`}
                      >
                        <option value="month">按月 (Month)</option>
                        <option value="quarter">按季 (Quarter)</option>
                        <option value="half_year">半年 (Half Year)</option>
                        <option value="year">按年 (Year)</option>
                        <option value="two_year">两年 (2 Years)</option>
                        <option value="three_year">三年 (3 Years)</option>
                        <option value="one_time">一次性 (One-time)</option>
                      </select>
                    </div>
                  </div>

                  {/* DatePicker Component */}
                  <div>
                    <label className={`block mb-1 text-xs font-sans font-medium ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                      服务到期时间 (Expiry Date)
                    </label>
                    <DatePicker
                      value={editingNode.expiry_date || ""}
                      onChange={(dateVal) => setEditingNode({ ...editingNode, expiry_date: dateVal })}
                      theme={theme}
                    />
                  </div>

                  {/* BandwidthConfig Component (Unit selection & Auto-conversion) */}
                  <div>
                    <label className={`block mb-1 text-xs font-sans font-medium ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                      流量配额与使用量设置 (Bandwidth Settings)
                    </label>
                    <BandwidthConfig
                      quotaBytes={editingNode.bandwidth_quota}
                      usedBytes={editingNode.bandwidth_used || 0}
                      liveTotalBytes={
                        (() => {
                          const nd = nodes.find((n) => n.node_id === editingNode.node_id);
                          return nd ? (nd.network.bytes_sent || 0) + (nd.network.bytes_recv || 0) : 0;
                        })()
                      }
                      onChange={(newQuota, newUsed) =>
                        setEditingNode({ ...editingNode, bandwidth_quota: newQuota, bandwidth_used: newUsed })
                      }
                      theme={theme}
                    />
                  </div>

                  {/* TagInput Component */}
                  <div>
                    <label className={`block mb-1 text-xs font-sans font-medium ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                      线路与特性标签 (Tags)
                    </label>
                    <TagInput
                      tags={editingNode.tags || []}
                      onChange={(newTags) => setEditingNode({ ...editingNode, tags: newTags })}
                      theme={theme}
                    />
                  </div>

                  {/* Actions & Auto Renewal */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-dashed border-slate-200 dark:border-zinc-800">
                    <label className="flex items-center gap-2 text-xs font-sans font-medium cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editingNode.auto_renewal}
                        onChange={(e) => setEditingNode({ ...editingNode, auto_renewal: e.target.checked })}
                        className="toggle toggle-primary toggle-sm cursor-pointer"
                      />
                      <span className={isBlueprint ? "text-slate-800" : "text-zinc-200"}>
                        开启到期自动续费 (Auto Renewal)
                      </span>
                    </label>

                    <div className="flex items-center gap-3">
                      {hostSaveSuccess && (
                        <span className="badge badge-success badge-outline text-xs font-sans font-medium flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" /> 配置保存成功！
                        </span>
                      )}
                      <button
                        onClick={handleSaveNodeSettings}
                        className="btn btn-sm btn-primary font-sans font-medium"
                      >
                        保存主机设置
                      </button>
                    </div>
                  </div>
                </div>
              )}


              {/* Registered Hosts List */}
              <div
                className={`rounded-xl border overflow-hidden ${
                  isBlueprint ? "bg-white border-slate-200/90 shadow-xs" : "bg-zinc-900/60 border-zinc-800"
                }`}
              >
                <div
                  className={`px-5 py-3 border-b text-xs font-sans font-semibold flex items-center justify-between ${
                    isBlueprint ? "bg-slate-50/80 border-slate-200/80 text-slate-700" : "bg-zinc-900 border-zinc-800 text-zinc-300"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-indigo-500" />
                    已注册主机列表 ({nodes.length})
                  </span>
                  <span className={`text-xs font-normal ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                    点击操作栏「配置」即可修改计费、标签及流量配额
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead
                      className={`border-b text-xs font-semibold ${
                        isBlueprint ? "bg-slate-50/50 text-slate-600 border-slate-200/80" : "bg-zinc-950/80 text-zinc-400 border-zinc-800"
                      }`}
                    >
                      <tr>
                        <th className="py-3 px-4">状态</th>
                        <th className="py-3 px-4">主机名 / ID</th>
                        <th className="py-3 px-4">地区</th>
                        <th className="py-3 px-4">系统 / IP</th>
                        <th className="py-3 px-4">定价 / 周期</th>
                        <th className="py-3 px-4">已用 / 配额</th>
                        <th className="py-3 px-4">到期时间</th>
                        <th className="py-3 px-4 text-right pr-6">操作</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isBlueprint ? "divide-slate-100" : "divide-zinc-800/60"}`}>
                      {nodes.map((n) => {
                        const totalQuota = n.billing?.bandwidth_quota || 0;
                        const totalUsed = n.billing?.bandwidth_used || ((n.network.bytes_sent || 0) + (n.network.bytes_recv || 0));
                        const percent = totalQuota > 0 ? Math.min(100, Math.round((totalUsed / totalQuota) * 100)) : 0;

                        return (
                          <tr
                            key={n.node_id}
                            className={`transition-colors ${
                              isBlueprint ? "hover:bg-slate-50/70" : "hover:bg-zinc-800/30"
                            }`}
                          >
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-11 font-medium border ${
                                  n.is_online
                                    ? isBlueprint
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                                      : "bg-emerald-950/40 text-emerald-400 border-emerald-800/60"
                                    : isBlueprint
                                    ? "bg-rose-50 text-rose-700 border-rose-200/80"
                                    : "bg-rose-950/40 text-rose-400 border-rose-800/60"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    n.is_online ? "bg-emerald-500" : "bg-rose-500"
                                  }`}
                                />
                                {n.is_online ? "在线" : "离线"}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className={`font-semibold ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                                {n.name}
                              </div>
                              <div className={`text-11 font-mono ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                                {n.node_id}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="flex items-center gap-1.5 font-medium">
                                <span className="text-base">{getRegionFlag(n.region)}</span>
                                <span className={isBlueprint ? "text-slate-800" : "text-zinc-200"}>{n.region}</span>
                              </span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className={isBlueprint ? "text-slate-800 font-medium" : "text-zinc-200"}>
                                {n.system.os || "Linux"}
                              </div>
                              <div className={`text-11 font-mono ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                                {n.system.public_ip || "127.0.0.1"}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap font-mono">
                              <div className="font-semibold text-indigo-600 dark:text-indigo-400">
                                {n.billing?.currency || "$"}{n.billing?.price || n.billing?.price_per_month || 9.9}
                                <span className={`text-11 font-normal font-sans ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                                  {" "}/ {n.billing?.billing_cycle || "month"}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap font-mono">
                              <div className={`text-xs font-semibold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                                {totalQuota > 0 ? `${percent}%` : "无限制"}
                              </div>
                              <div className={`text-10 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                                {n.billing?.bandwidth_quota ? `${(totalQuota / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB` : "无限"}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className={`font-medium ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                                {n.billing?.remaining_days != null ? `${n.billing.remaining_days} 天` : "--"}
                              </div>
                              <div className={`text-10 font-mono ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                                {n.billing?.expiry_date || "未设到期"}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap text-right pr-6">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleEditNodeClick(n)}
                                  className="btn btn-xs btn-ghost text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-zinc-400 dark:hover:text-indigo-400 dark:hover:bg-indigo-950/40 font-sans gap-1"
                                  title="配置主机"
                                >
                                  <Sliders className="h-3 w-3" />
                                  <span>配置</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteNode(n.node_id)}
                                  className="btn btn-xs btn-ghost text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 font-sans gap-1"
                                  title="删除主机"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>删除</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {nodes.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-slate-400 font-sans">
                            暂无主机，请使用上方命令快速部署 Agent 探针
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: NETWORK & PING TARGETS */}
          {activeTab === "network" && (
            <div className="space-y-5">
              {/* Header with Add Button */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`text-base font-bold font-sans ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                    网络质量监测目标 (Network Probes)
                  </h3>
                  <p className={`text-xs font-sans mt-0.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                    各探针节点定时检测目标延迟与丢包率，多节点实时汇总
                  </p>
                </div>

                <button
                  onClick={openAddTargetModal}
                  className="btn btn-sm btn-primary font-sans font-medium gap-1.5 shadow-xs"
                >
                  <Plus className="h-4 w-4" />
                  <span>添加监测</span>
                </button>
              </div>

              {/* Instant ping tester quick bar */}
              <div
                className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                  isBlueprint ? "bg-white border-slate-200/90 shadow-xs" : "bg-zinc-900/60 border-zinc-800"
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-sans">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                    <Zap className="h-4 w-4" />
                  </div>
                  <span className={`font-semibold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                    即时测速:
                  </span>
                  <div className="join">
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
                      className={`input input-bordered input-sm join-item font-mono text-xs w-64 focus:outline-none ${
                        isBlueprint
                          ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                          : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                      }`}
                    />
                    <button
                      onClick={() => handleTestTarget(instantTargetInput.trim())}
                      disabled={isTesting || !instantTargetInput.trim()}
                      className="btn btn-sm btn-primary join-item font-sans font-medium"
                    >
                      {isTesting ? "测试中..." : "测试连接"}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-sans text-slate-500 dark:text-zinc-400">
                  <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>由探针集群对目标执行临时 ICMP/TCP Ping 检测</span>
                </div>
              </div>

              {/* Instant test result badge */}
              {testResult && (
                <div
                  className={`alert py-2.5 px-3.5 text-xs font-sans flex items-center justify-between gap-3 ${
                    testResult.success ? "alert-success" : "alert-error"
                  }`}
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
                    className="btn btn-xs btn-ghost"
                  >
                    关闭
                  </button>
                </div>
              )}

              {/* Ping Targets Table */}
              <div
                className={`rounded-xl border overflow-hidden ${
                  isBlueprint ? "bg-white border-slate-200/90 shadow-xs" : "bg-zinc-900/60 border-zinc-800"
                }`}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead
                      className={`border-b text-xs font-semibold ${
                        isBlueprint ? "bg-slate-50/90 text-slate-600 border-slate-200/80" : "bg-zinc-950/80 text-zinc-400 border-zinc-800"
                      }`}
                    >
                      <tr>
                        <th className="py-3 px-4">监测目标</th>
                        <th className="py-3 px-4">目标地址</th>
                        <th className="py-3 px-4">协议</th>
                        <th className="py-3 px-4">检测间隔</th>
                        <th className="py-3 px-4">监测范围</th>
                        <th className="py-3 px-4">状态</th>
                        <th className="py-3 px-4 text-right pr-6">操作</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isBlueprint ? "divide-slate-100" : "divide-zinc-800/60"}`}>
                      {pingTargets.map((t) => (
                        <tr
                          key={t.id || t.label}
                          className={`transition-colors ${
                            isBlueprint ? "hover:bg-slate-50/70" : "hover:bg-zinc-800/30"
                          }`}
                        >
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white dark:ring-zinc-900"
                                style={{ backgroundColor: t.color || "#6366f1" }}
                              />
                              <span className={`font-semibold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                                {t.label}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium border ${
                              isBlueprint ? "bg-slate-50 text-slate-700 border-slate-200/80" : "bg-zinc-950 text-zinc-300 border-zinc-800"
                            }`}>
                              {t.target}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap uppercase">
                            <span
                              className={`px-2 py-0.5 rounded text-11 font-mono font-semibold border ${
                                t.protocol === "http"
                                  ? isBlueprint ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-purple-950/40 text-purple-400 border-purple-800/60"
                                  : t.protocol === "tcp"
                                  ? isBlueprint ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-sky-950/40 text-sky-400 border-sky-800/60"
                                  : isBlueprint ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-emerald-950/40 text-emerald-400 border-emerald-800/60"
                              }`}
                            >
                              {t.protocol || "tcp"}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`font-sans text-xs ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
                              <strong className={`font-mono ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>{t.interval || 60}</strong> 秒
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {t.servers && t.servers.length > 0 ? (
                              <span className={isBlueprint ? "text-slate-600" : "text-zinc-400"}>{t.servers.length} 台服务器</span>
                            ) : (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-11 font-medium border ${
                                isBlueprint ? "bg-slate-100 text-slate-600 border-slate-200/80" : "bg-zinc-800/80 text-zinc-400 border-zinc-700/60"
                              }`}>
                                全部服务器
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <label className="inline-flex items-center gap-2 cursor-pointer select-none" title="点击切换启用/停用状态">
                              <input
                                type="checkbox"
                                checked={t.enabled !== false}
                                onChange={() => handleToggleTarget(t)}
                                className="toggle toggle-success toggle-xs cursor-pointer"
                              />
                              <span className={`text-xs font-medium ${
                                t.enabled !== false
                                  ? isBlueprint ? "text-emerald-700" : "text-emerald-400"
                                  : isBlueprint ? "text-slate-400" : "text-zinc-500"
                              }`}>
                                {t.enabled !== false ? "已启用" : "已停用"}
                              </span>
                            </label>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-right pr-6">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditTargetModal(t)}
                                className="btn btn-xs btn-ghost text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-zinc-400 dark:hover:text-indigo-400 dark:hover:bg-indigo-950/40 font-sans gap-1"
                                title="编辑监测目标"
                              >
                                <Edit2 className="h-3 w-3" />
                                <span>编辑</span>
                              </button>
                              <button
                                onClick={() => handleDeleteTarget(t.id)}
                                className="btn btn-xs btn-ghost text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 font-sans gap-1"
                                title="删除监测目标"
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
                          <td colSpan={7} className="py-10 text-center text-slate-400 font-sans">
                            暂无监测目标，请点击右上角「添加监测」
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}


          {/* TAB 3: BILLING & EXCHANGE RATES */}
          {activeTab === "billing" && (
            <div className="space-y-6">
              {/* Financial Cluster Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  className={`p-5 rounded-xl border ${
                    isBlueprint ? "bg-white border-slate-200/90 shadow-xs" : "bg-zinc-900/70 border-zinc-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-sans font-medium text-slate-500 dark:text-zinc-400 mb-1">
                    <span>集群月度总支出 (折合人民币)</span>
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    ¥{totalMonthlySpendCNY.toFixed(2)}
                    <span className="text-xs font-normal font-sans text-slate-500 dark:text-zinc-500 ml-2">/ 月</span>
                  </div>
                  <div className={`text-xs font-sans mt-2 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                    根据当前各币种实时汇率折算合计支出
                  </div>
                </div>

                <div
                  className={`p-5 rounded-xl border ${
                    isBlueprint ? "bg-white border-slate-200/90 shadow-xs" : "bg-zinc-900/70 border-zinc-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-sans font-medium text-slate-500 dark:text-zinc-400 mb-1">
                    <span>集群剩余总价值 (折合人民币)</span>
                    <Coins className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                    ¥{totalRemainingValueCNY.toFixed(2)}
                  </div>
                  <div className={`text-xs font-sans mt-2 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                    根据各主机到期时间和剩余天数实时动态计算
                  </div>
                </div>
              </div>

              {/* Exchange Rates Config */}
              <div
                className={`rounded-xl border p-5 space-y-4 ${
                  isBlueprint ? "bg-white border-slate-200/90 shadow-xs" : "bg-zinc-900/70 border-zinc-800"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 border-slate-200/80 dark:border-zinc-800">
                  <div>
                    <h3 className={`text-sm font-bold font-sans ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                      外汇汇率换算表 (Exchange Rates to {systemSettings.base_currency})
                    </h3>
                    <p className={`text-xs font-sans mt-0.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                      用于将外币主机（USD、EUR、HKD、GBP、JPY）自动换算为本币成本
                    </p>
                  </div>

                  <div className="flex items-center gap-2 font-sans text-xs">
                    <button
                      onClick={handleRefreshRates}
                      disabled={isRefreshingRates}
                      className="btn btn-xs btn-ghost text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-sans gap-1"
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
                      className={`p-3 rounded-xl border ${
                        isBlueprint ? "bg-slate-50/70 border-slate-200/80" : "bg-zinc-950 border-zinc-800"
                      }`}
                    >
                      <div className={`text-11 font-bold mb-1 ${isBlueprint ? "text-slate-700" : "text-zinc-400"}`}>
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
                          className={`w-full font-bold focus:outline-none bg-transparent ${
                            isBlueprint ? "text-slate-900" : "text-zinc-100"
                          }`}
                        />
                        <span className="text-slate-400 font-medium font-sans">{systemSettings.base_currency}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className={`text-xs font-sans ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                    上次汇率更新: {systemSettings.last_rate_update ? new Date(systemSettings.last_rate_update * 1000).toLocaleString() : "默认初始值"}
                  </span>

                  <div className="flex items-center gap-3">
                    {rateSaveSuccess && (
                      <span className="inline-flex items-center gap-1 text-xs font-sans font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> 汇率保存成功
                      </span>
                    )}
                    <button
                      onClick={handleSaveRates}
                      className="btn btn-sm btn-primary font-sans font-medium"
                    >
                      保存汇率设定
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TOKENS */}
          {activeTab === "tokens" && (
            <div className="space-y-6">
              {/* Create token bar */}
              <div
                className={`p-3.5 rounded-xl border flex flex-wrap items-center gap-3 ${
                  isBlueprint ? "bg-white border-slate-200/90 shadow-xs" : "bg-zinc-900/70 border-zinc-800"
                }`}
              >
                <div className="flex-1 min-w-[240px]">
                  <input
                    type="text"
                    placeholder="输入新 Token 标签备注 (如: 美国VPS专用)..."
                    value={newTokenLabel}
                    onChange={(e) => setNewTokenLabel(e.target.value)}
                    className={`input input-bordered input-sm w-full font-sans text-xs focus:outline-none ${
                      isBlueprint
                        ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                        : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                    }`}
                  />
                </div>
                <button
                  onClick={handleCreateToken}
                  className="btn btn-sm btn-primary font-sans font-medium gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>生成新 Token</span>
                </button>
              </div>

              {/* Tokens list */}
              <div
                className={`rounded-xl border overflow-hidden ${
                  isBlueprint ? "bg-white border-slate-200/90 shadow-xs" : "bg-zinc-900/60 border-zinc-800"
                }`}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead
                      className={`border-b text-xs font-semibold ${
                        isBlueprint ? "bg-slate-50/50 text-slate-600 border-slate-200/80" : "bg-zinc-950 text-zinc-400 border-zinc-800"
                      }`}
                    >
                      <tr>
                        <th className="py-3 px-4">Token 令牌</th>
                        <th className="py-3 px-4">备注标签</th>
                        <th className="py-3 px-4">创建时间</th>
                        <th className="py-3 px-4 text-right pr-6">操作</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isBlueprint ? "divide-slate-100" : "divide-zinc-800/60"}`}>
                      {tokens.map((t) => (
                        <tr
                          key={t.token}
                          className={`transition-colors ${
                            isBlueprint ? "hover:bg-slate-50/70" : "hover:bg-zinc-800/30"
                          }`}
                        >
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded font-mono text-xs font-medium border ${
                              isBlueprint ? "bg-slate-50 text-slate-800 border-slate-200" : "bg-zinc-950 text-emerald-400 border-zinc-800"
                            }`}>
                              {t.token}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-800 dark:text-zinc-200">
                            {t.label}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-xs text-slate-400 dark:text-zinc-500 font-mono">
                            {t.created_at ? new Date(t.created_at * 1000).toLocaleString() : "--"}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-right pr-6">
                            <button
                              onClick={() => copyToClipboard(t.token, t.token)}
                              className="btn btn-xs btn-ghost text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-zinc-400 dark:hover:text-indigo-400 dark:hover:bg-indigo-950/40 font-sans gap-1"
                            >
                              {copiedCmd === t.token ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                              <span>{copiedCmd === t.token ? "已复制" : "复制"}</span>
                            </button>
                          </td>
                        </tr>
                      ))}

                      {tokens.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-10 text-center text-slate-400 font-sans">
                            暂无通信 Token，请在上方输入备注标签并生成
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: NOTIFICATIONS & ALERTS */}
          {activeTab === "notifications" && (
            <div className="space-y-6">
              {/* Header Action Card */}
              <div
                className={`rounded-xl border p-5 shadow-xs transition-all ${
                  isBlueprint ? "bg-white border-slate-200/90" : "bg-zinc-900/80 border-zinc-800"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl shrink-0 bg-indigo-50 border border-indigo-200/70 text-indigo-600 dark:bg-indigo-950/40 dark:border-indigo-800/60 dark:text-indigo-400">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className={`text-base font-bold font-sans tracking-tight ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                          自定义告警与通知设置
                        </h3>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-10 font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200/70 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800/60">
                          多通道支持
                        </span>
                      </div>
                      <p className={`text-xs font-sans mt-1 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                        配置 Telegram 机器人、企业级 Webhook（飞书/钉钉/企微/Bark）及 Discord 频道，实时接收节点离线、上线恢复、流量预警与定时全网日报。
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end md:self-auto font-sans text-xs">
                    <button
                      type="button"
                      disabled={testingChannel !== null}
                      onClick={() => handleTestNotification("all")}
                      className="btn btn-sm btn-ghost text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800 font-sans font-medium gap-1.5"
                    >
                      {testingChannel === "all" ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      <span>{testingChannel === "all" ? "测试中..." : "全通道测试"}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSavingNotif}
                      onClick={handleSaveNotificationSettings}
                      className="btn btn-sm btn-primary font-sans font-medium gap-1.5"
                    >
                      {isSavingNotif ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : notifSaveSuccess ? (
                        <Check className="h-3.5 w-3.5 text-white" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      <span>{notifSaveSuccess ? "已保存配置" : "保存通知配置"}</span>
                    </button>
                  </div>
                </div>

                {/* Banner notice for test result */}
                {testNotice && (
                  <div
                    className={`mt-4 alert py-2.5 px-3.5 text-xs font-sans flex items-center justify-between ${
                      testNotice.success ? "alert-success" : "alert-error"
                    }`}
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
                      className="btn btn-xs btn-ghost"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* 1. NOTIFICATION CHANNELS (3 CARDS) */}
              <div>
                <div className="flex items-center justify-between mb-3 font-sans">
                  <h4 className={`text-sm font-bold flex items-center gap-2 ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                    <span>1. 告警推送通道配置 (Channels)</span>
                  </h4>
                  <span className={`text-xs ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                    可同时启用多个通道进行冗余推送
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Telegram Bot */}
                  <div
                    className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                      notificationSettings.telegram.enabled
                        ? isBlueprint
                          ? "bg-blue-50/30 border-blue-200/80 shadow-xs"
                          : "bg-blue-950/20 border-blue-900/60 shadow-xs"
                        : isBlueprint
                        ? "bg-white border-slate-200/90 shadow-xs"
                        : "bg-zinc-900/60 border-zinc-800"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b mb-3.5 border-slate-100 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-[#229ED9]/15 flex items-center justify-center text-[#229ED9]">
                            <Send className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <span className="font-semibold font-sans text-xs">Telegram 机器人</span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={notificationSettings.telegram.enabled}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              telegram: { ...notificationSettings.telegram, enabled: e.target.checked },
                            })
                          }
                          className="toggle toggle-info toggle-sm cursor-pointer"
                        />
                      </div>

                      <div className="space-y-3 text-xs font-sans">
                        <div>
                          <label className={`block text-11 font-medium mb-1 ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
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
                            className={`input input-bordered input-sm w-full font-mono text-xs focus:outline-none ${
                              isBlueprint
                                ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                                : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                            }`}
                          />
                        </div>

                        <div>
                          <label className={`block text-11 font-medium mb-1 ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
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
                            className={`input input-bordered input-sm w-full font-mono text-xs focus:outline-none ${
                              isBlueprint
                                ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                                : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                            }`}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs font-sans">
                      <span className={`text-11 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                        Markdown 格式排版
                      </span>
                      <button
                        type="button"
                        disabled={testingChannel !== null}
                        onClick={() => handleTestNotification("telegram")}
                        className="btn btn-xs btn-ghost text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/40 font-sans font-medium"
                      >
                        {testingChannel === "telegram" ? "测试中..." : "测试 Telegram"}
                      </button>
                    </div>
                  </div>

                  {/* Webhook (Feishu, DingTalk, WeCom, Bark, Custom) */}
                  <div
                    className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                      notificationSettings.webhook.enabled
                        ? isBlueprint
                          ? "bg-emerald-50/30 border-emerald-200/80 shadow-xs"
                          : "bg-emerald-950/20 border-emerald-900/60 shadow-xs"
                        : isBlueprint
                        ? "bg-white border-slate-200/90 shadow-xs"
                        : "bg-zinc-900/60 border-zinc-800"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b mb-3.5 border-slate-100 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-500">
                            <Zap className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <span className="font-semibold font-sans text-xs">通用 / 企业 Webhook</span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={notificationSettings.webhook.enabled}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              webhook: { ...notificationSettings.webhook, enabled: e.target.checked },
                            })
                          }
                          className="toggle toggle-success toggle-sm cursor-pointer"
                        />
                      </div>

                      <div className="space-y-3 text-xs font-sans">
                        <div>
                          <label className={`block text-11 font-medium mb-1 ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
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
                            className={`select select-bordered select-sm w-full font-sans text-xs focus:outline-none cursor-pointer ${
                              isBlueprint
                                ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                                : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                            }`}
                          >
                            <option value="generic">通用 JSON (POST)</option>
                            <option value="feishu">飞书群机器人 (Lark Robot)</option>
                            <option value="dingtalk">钉钉自定义机器人 (DingTalk)</option>
                            <option value="wecom">企业微信群机器人 (WeCom)</option>
                            <option value="bark">Bark (iOS 极速通知)</option>
                          </select>
                        </div>

                        <div>
                          <label className={`block text-11 font-medium mb-1 ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
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
                            className={`input input-bordered input-sm w-full font-mono text-xs focus:outline-none ${
                              isBlueprint
                                ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                                : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                            }`}
                          />
                        </div>

                        <div>
                          <label className={`block text-11 font-medium mb-1 ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
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
                            className={`input input-bordered input-sm w-full font-mono text-xs focus:outline-none ${
                              isBlueprint
                                ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                                : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                            }`}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs font-sans">
                      <span className={`text-11 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                        原生适配 Markdown
                      </span>
                      <button
                        type="button"
                        disabled={testingChannel !== null}
                        onClick={() => handleTestNotification("webhook")}
                        className="btn btn-xs btn-ghost text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 font-sans font-medium"
                      >
                        {testingChannel === "webhook" ? "测试中..." : "测试 Webhook"}
                      </button>
                    </div>
                  </div>

                  {/* Discord Webhook */}
                  <div
                    className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                      notificationSettings.discord.enabled
                        ? isBlueprint
                          ? "bg-indigo-50/30 border-indigo-200/80 shadow-xs"
                          : "bg-indigo-950/20 border-indigo-900/60 shadow-xs"
                        : isBlueprint
                        ? "bg-white border-slate-200/90 shadow-xs"
                        : "bg-zinc-900/60 border-zinc-800"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b mb-3.5 border-slate-100 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-[#5865F2]/15 flex items-center justify-center text-[#5865F2]">
                            <MessageSquare className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <span className="font-semibold font-sans text-xs">Discord 频道</span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={notificationSettings.discord.enabled}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              discord: { ...notificationSettings.discord, enabled: e.target.checked },
                            })
                          }
                          className="toggle toggle-primary toggle-sm cursor-pointer"
                        />
                      </div>

                      <div className="space-y-3 text-xs font-sans">
                        <div>
                          <label className={`block text-11 font-medium mb-1 ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
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
                            className={`input input-bordered input-sm w-full font-mono text-xs focus:outline-none ${
                              isBlueprint
                                ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                                : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                            }`}
                          />
                        </div>

                        <div>
                          <label className={`block text-11 font-medium mb-1 ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
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
                            className={`input input-bordered input-sm w-full font-sans text-xs focus:outline-none ${
                              isBlueprint
                                ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                                : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                            }`}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs font-sans">
                      <span className={`text-11 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                        Discord Embed 富文本卡片
                      </span>
                      <button
                        type="button"
                        disabled={testingChannel !== null}
                        onClick={() => handleTestNotification("discord")}
                        className="btn btn-xs btn-ghost text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40 font-sans font-medium"
                      >
                        {testingChannel === "discord" ? "测试中..." : "测试 Discord"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. ALERT RULES & SCHEDULED REPORTS */}
              <div>
                <div className="flex items-center justify-between mb-3 font-sans">
                  <h4 className={`text-sm font-bold flex items-center gap-2 ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                    <span>2. 智能告警规则与定时报告 (Rules & Schedules)</span>
                  </h4>
                  <span className={`text-xs ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                    自动检测异常并在关键指标越限时分发通知
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans text-xs">
                  {/* Rule 1: Node Offline & Recovery */}
                  <div
                    className={`rounded-xl border p-4 transition-all ${
                      isBlueprint ? "bg-white border-slate-200/90 shadow-xs" : "bg-zinc-900/60 border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold mb-3">
                      <Radio className="h-4 w-4 text-rose-500" />
                      <span>节点失联与恢复告警</span>
                    </div>

                    <div className="space-y-3.5">
                      <label className="flex items-center justify-between cursor-pointer select-none">
                        <span className={isBlueprint ? "text-slate-700 font-medium" : "text-zinc-300 font-medium"}>
                          开启节点离线告警
                        </span>
                        <input
                          type="checkbox"
                          checked={notificationSettings.rules.offline_alert}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              rules: { ...notificationSettings.rules, offline_alert: e.target.checked },
                            })
                          }
                          className="toggle toggle-error toggle-sm cursor-pointer"
                        />
                      </label>

                      <div>
                        <span className={`block text-11 mb-1 font-medium ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
                          离线判定超时秒数
                        </span>
                        <select
                          value={notificationSettings.rules.offline_threshold_sec}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              rules: {
                                ...notificationSettings.rules,
                                offline_threshold_sec: parseInt(e.target.value) || 60,
                              },
                            })
                          }
                          className={`select select-bordered select-sm w-full font-sans text-xs focus:outline-none cursor-pointer ${
                            isBlueprint
                              ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                              : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                          }`}
                        >
                          <option value={30}>30 秒 (极速检测)</option>
                          <option value={60}>60 秒 (推荐平衡)</option>
                          <option value={120}>120 秒 (减少抖动)</option>
                          <option value={300}>300 秒 (宽限期)</option>
                        </select>
                      </div>

                      <label className="flex items-center justify-between cursor-pointer select-none pt-2 border-t border-slate-100 dark:border-zinc-800">
                        <span className={isBlueprint ? "text-slate-700 font-medium" : "text-zinc-300 font-medium"}>
                          恢复上线通知 (含离线时长)
                        </span>
                        <input
                          type="checkbox"
                          checked={notificationSettings.rules.recovery_alert}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              rules: { ...notificationSettings.rules, recovery_alert: e.target.checked },
                            })
                          }
                          className="toggle toggle-success toggle-sm cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Rule 2: Bandwidth Quota Warning */}
                  <div
                    className={`rounded-xl border p-4 transition-all ${
                      isBlueprint ? "bg-white border-slate-200/90 shadow-xs" : "bg-zinc-900/60 border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold mb-3">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span>流量配额消耗预警</span>
                    </div>

                    <div className="space-y-3.5">
                      <label className="flex items-center justify-between cursor-pointer select-none">
                        <span className={isBlueprint ? "text-slate-700 font-medium" : "text-zinc-300 font-medium"}>
                          开启超额预警通知
                        </span>
                        <input
                          type="checkbox"
                          checked={notificationSettings.rules.traffic_alert}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              rules: { ...notificationSettings.rules, traffic_alert: e.target.checked },
                            })
                          }
                          className="toggle toggle-warning toggle-sm cursor-pointer"
                        />
                      </label>

                      <div>
                        <span className={`block text-11 mb-1 font-medium ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
                          预警触发比例阈值
                        </span>
                        <select
                          value={notificationSettings.rules.traffic_threshold_pct}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              rules: {
                                ...notificationSettings.rules,
                                traffic_threshold_pct: parseInt(e.target.value) || 85,
                              },
                            })
                          }
                          className={`select select-bordered select-sm w-full font-sans text-xs focus:outline-none cursor-pointer ${
                            isBlueprint
                              ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                              : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                          }`}
                        >
                          <option value={70}>70% 额度预警</option>
                          <option value={80}>80% 额度预警</option>
                          <option value={85}>85% 额度预警 (推荐)</option>
                          <option value={90}>90% 临界预警</option>
                          <option value={95}>95% 严重警告</option>
                        </select>
                      </div>

                      <p className={`text-11 pt-2 border-t border-slate-100 dark:border-zinc-800 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                        当节点出入网总流量达标时推送预警，内置 12 小时静默窗口避免频繁通知。
                      </p>
                    </div>
                  </div>

                  {/* Rule 3: Daily Summary Report */}
                  <div
                    className={`rounded-xl border p-4 transition-all ${
                      isBlueprint ? "bg-white border-slate-200/90 shadow-xs" : "bg-zinc-900/60 border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold mb-3">
                      <Clock className="h-4 w-4 text-cyan-500" />
                      <span>定时全网流量与监控简报</span>
                    </div>

                    <div className="space-y-3.5">
                      <label className="flex items-center justify-between cursor-pointer select-none">
                        <span className={isBlueprint ? "text-slate-700 font-medium" : "text-zinc-300 font-medium"}>
                          开启每日定时播报
                        </span>
                        <input
                          type="checkbox"
                          checked={notificationSettings.rules.daily_report}
                          onChange={(e) =>
                            setNotificationSettings({
                              ...notificationSettings,
                              rules: { ...notificationSettings.rules, daily_report: e.target.checked },
                            })
                          }
                          className="toggle toggle-info toggle-sm cursor-pointer"
                        />
                      </label>

                      <div>
                        <span className={`block text-11 mb-1 font-medium ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
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
                          className={`input input-bordered input-sm w-full font-mono text-xs focus:outline-none ${
                            isBlueprint
                              ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                              : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                          }`}
                        />
                      </div>

                      <p className={`text-11 pt-2 border-t border-slate-100 dark:border-zinc-800 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                        定时汇总集群在线率、全网吞吐量 (Tx/Rx) 及高负荷节点清单推送至已启用通道。
                      </p>
                    </div>
                  </div>
                </div>
              </div>


              {/* 3. RECENT NOTIFICATION AUDIT LOGS */}
              <div
                className={`rounded-xl border p-5 transition-all shadow-xs ${
                  isBlueprint ? "bg-white border-slate-200/90" : "bg-zinc-900/80 border-zinc-800"
                }`}
              >
                <div className="flex items-center justify-between mb-4 font-sans">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-sm font-bold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                      3. 告警推送记录与审计日志 (Recent Logs)
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-10 font-semibold bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700/60">
                      {notificationLogs.length} 条记录
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={fetchNotificationLogs}
                      className="btn btn-xs btn-ghost text-slate-600 hover:text-slate-900 dark:text-zinc-300 font-sans gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>刷新</span>
                    </button>
                    {notificationLogs.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearNotificationLogs}
                        className="btn btn-xs btn-ghost text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-sans gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>清空历史</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans text-xs">
                    <thead
                      className={`border-b text-xs font-semibold ${
                        isBlueprint ? "bg-slate-50/50 text-slate-600 border-slate-200/80" : "bg-zinc-950 text-zinc-400 border-zinc-800"
                      }`}
                    >
                      <tr>
                        <th className="py-2.5 px-3">时间</th>
                        <th className="py-2.5 px-3">推送通道</th>
                        <th className="py-2.5 px-3">事件类型</th>
                        <th className="py-2.5 px-3">消息标题与详情</th>
                        <th className="py-2.5 px-3 text-right pr-4">投递状态</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isBlueprint ? "divide-slate-100" : "divide-zinc-800/60"}`}>
                      {notificationLogs.map((logItem) => {
                        let typeText = "通知";
                        let typeClass = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-400";
                        if (logItem.type === "offline") {
                          typeClass = "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60";
                          typeText = "节点离线";
                        } else if (logItem.type === "recovery") {
                          typeClass = "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60";
                          typeText = "上线恢复";
                        } else if (logItem.type === "traffic") {
                          typeClass = "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60";
                          typeText = "流量预警";
                        } else if (logItem.type === "daily_report") {
                          typeClass = "bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60";
                          typeText = "每日简报";
                        } else if (logItem.type === "test") {
                          typeClass = "bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800/60";
                          typeText = "测试消息";
                        }

                        return (
                          <tr
                            key={logItem.id}
                            className={`transition-colors ${
                              isBlueprint ? "hover:bg-slate-50/70" : "hover:bg-zinc-800/30"
                            }`}
                          >
                            <td className="py-2.5 px-3 whitespace-nowrap text-slate-400 font-mono text-11">
                              {new Date(logItem.timestamp * 1000).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full text-10 font-mono font-bold uppercase bg-indigo-50 text-indigo-600 border border-indigo-200/70 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800/60">
                                {logItem.channel}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full text-10 font-medium border ${typeClass}`}>
                                {typeText}
                              </span>
                            </td>

                            <td className="py-2.5 px-3 max-w-md">
                              <div className={`font-medium truncate ${isBlueprint ? "text-slate-900" : "text-zinc-200"}`}>
                                {logItem.title}
                              </div>
                              <div className="text-11 text-slate-400 dark:text-zinc-500 truncate mt-0.5">
                                {logItem.content.replace(/\n/g, " · ")}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap text-right pr-4">
                              {logItem.status === "success" ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-xs">
                                  <Check className="h-3.5 w-3.5" />
                                  <span>已送达</span>
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-rose-500 font-medium text-xs"
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
                          <td colSpan={5} className="py-10 text-center text-slate-400 font-sans">
                            暂无告警推送记录。当节点状态发生变化或点击测试通知时，将在此记录审计日志。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Add / Edit Ping Target */}
      {isTargetModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in font-sans">
          <div
            className={`relative w-full max-w-lg rounded-2xl border p-6 shadow-2xl transition-colors ${
              isBlueprint ? "bg-white border-slate-200/90 text-slate-900 shadow-slate-300/60" : "bg-zinc-900 border-zinc-800 text-zinc-100 shadow-black/80"
            }`}
          >
            <div className={`flex items-center justify-between border-b pb-4 mb-5 ${isBlueprint ? "border-slate-100" : "border-zinc-800"}`}>
              <h2 className={`text-lg font-bold font-sans tracking-tight ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                {editingTargetId ? "编辑监测目标" : "添加网络监测目标"}
              </h2>
              <button
                type="button"
                onClick={() => setIsTargetModalOpen(false)}
                className="btn btn-sm btn-circle btn-ghost"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 font-sans text-sm">
              {/* 1. 名称 */}
              <div>
                <label className={`block font-medium text-xs mb-1.5 ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                  目标名称 (Label)
                </label>
                <input
                  type="text"
                  value={targetFormName}
                  onChange={(e) => setTargetFormName(e.target.value)}
                  placeholder="如: Google, 电信, YouTube"
                  className={`input input-bordered input-sm w-full font-sans text-xs focus:outline-none ${
                    isBlueprint
                      ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                      : "bg-zinc-950 border-zinc-700 text-zinc-100 focus:border-indigo-500"
                  }`}
                />
              </div>

              {/* 2. 目标地址 */}
              <div>
                <label className={`block font-medium text-xs mb-1.5 ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                  目标地址 (Target IP 或域名)
                </label>
                <input
                  type="text"
                  value={targetFormAddress}
                  onChange={(e) => setTargetFormAddress(e.target.value)}
                  placeholder="如: 8.8.8.8, 223.5.5.5, www.google.com"
                  className={`input input-bordered input-sm w-full font-mono text-xs focus:outline-none ${
                    isBlueprint
                      ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                      : "bg-zinc-950 border-zinc-700 text-zinc-100 focus:border-indigo-500"
                  }`}
                />
              </div>

              {/* 3. 类型 */}
              <div>
                <label className={`block font-medium text-xs mb-1.5 ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                  监测协议类型 (Protocol)
                </label>
                <div
                  className={`rounded-xl border p-1.5 space-y-1 ${
                    isBlueprint ? "border-slate-200/90 bg-slate-50/60" : "border-zinc-800 bg-zinc-950/60"
                  }`}
                >
                  {(["icmp", "tcp", "http"] as const).map((typeKey) => {
                    const isSelected = targetFormType === typeKey;
                    const labelText = typeKey.toUpperCase();
                    return (
                      <button
                        key={typeKey}
                        type="button"
                        onClick={() => setTargetFormType(typeKey)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all active:scale-[0.99] text-left text-xs font-sans ${
                          isSelected
                            ? isBlueprint
                              ? "bg-white text-indigo-700 font-bold shadow-xs border border-slate-200"
                              : "bg-zinc-800/90 text-indigo-400 font-bold shadow-xs border border-zinc-700"
                            : isBlueprint
                            ? "hover:bg-slate-100 text-slate-600"
                            : "hover:bg-zinc-900 text-zinc-400"
                        }`}
                      >
                        <span className="w-4 text-center font-bold text-indigo-600 dark:text-indigo-400">
                          {isSelected ? "✓" : ""}
                        </span>
                        <span className="font-bold">{labelText}</span>
                        {typeKey === "icmp" && (
                          <span className={`text-11 ml-auto font-normal ${isBlueprint ? "text-slate-500" : "text-zinc-500"}`}>
                            网络层 Ping (ICMP Echo)
                          </span>
                        )}
                        {typeKey === "tcp" && (
                          <span className={`text-11 ml-auto font-normal ${isBlueprint ? "text-slate-500" : "text-zinc-500"}`}>
                            TCP 端口连接测试
                          </span>
                        )}
                        {typeKey === "http" && (
                          <span className={`text-11 ml-auto font-normal ${isBlueprint ? "text-slate-500" : "text-zinc-500"}`}>
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
                  <label className={`block font-medium text-xs mb-1.5 ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                    TCP 端口 (Port)
                  </label>
                  <input
                    type="number"
                    value={targetFormPort}
                    onChange={(e) => setTargetFormPort(parseInt(e.target.value) || 443)}
                    placeholder="443"
                    className={`input input-bordered input-sm w-full font-mono text-xs focus:outline-none ${
                      isBlueprint ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500" : "bg-zinc-950 border-zinc-700 text-zinc-100 focus:border-indigo-500"
                    }`}
                  />
                </div>
              )}

              {/* 4. 服务器选择 */}
              <div>
                <label className={`block font-medium text-xs mb-1.5 ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                  执行监测的探针服务器
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsServerPickerOpen(!isServerPickerOpen)}
                    className="btn btn-sm btn-outline btn-primary font-sans font-medium gap-1.5"
                  >
                    <span>{isServerPickerOpen ? "收起选择" : "选择服务器"}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isServerPickerOpen ? "rotate-180" : ""}`} />
                  </button>
                  <span className={`text-xs font-sans font-medium ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                    {targetFormServers.length === 0
                      ? "所有服务器 (默认全部)"
                      : `已选 ${targetFormServers.length} 台服务器`}
                  </span>
                </div>

                {/* Server Picker dropdown */}
                {isServerPickerOpen && (
                  <div
                    className={`mt-2 p-2 rounded-xl border space-y-1 max-h-44 overflow-y-auto ${
                      isBlueprint ? "bg-white border-slate-200 shadow-lg" : "bg-zinc-950 border-zinc-800"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setTargetFormServers([])}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs font-sans transition-colors text-left ${
                        targetFormServers.length === 0
                          ? isBlueprint
                            ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-200"
                            : "bg-indigo-500/15 text-indigo-300 font-bold border border-indigo-500/30"
                          : isBlueprint
                          ? "hover:bg-slate-100 text-slate-700"
                          : "hover:bg-zinc-900 text-zinc-300"
                      }`}
                    >
                      {targetFormServers.length === 0 ? (
                        <CheckSquare className="h-4 w-4 text-indigo-600 shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                      <span>全部服务器 (所有探针节点同步执行监测)</span>
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
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs font-sans transition-colors text-left ${
                            isChecked
                              ? isBlueprint
                                ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-200"
                                : "bg-indigo-500/15 text-indigo-300 font-bold border border-indigo-500/30"
                              : isBlueprint
                              ? "hover:bg-slate-100 text-slate-700"
                              : "hover:bg-zinc-900 text-zinc-300"
                          }`}
                        >
                          {isChecked ? (
                            <CheckSquare className="h-4 w-4 text-indigo-600 shrink-0" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-400 shrink-0" />
                          )}
                          <span className="truncate">{node.name} <span className="font-mono text-11 text-slate-400 dark:text-zinc-500">({node.node_id})</span></span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Checkbox: 默认开启 */}
                <div className="mt-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={targetFormAutoStart}
                      onChange={(e) => setTargetFormAutoStart(e.target.checked)}
                      className="toggle toggle-primary toggle-sm cursor-pointer"
                    />
                    <span className={`text-xs font-medium ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                      默认自动开启监测
                    </span>
                  </label>
                  <p className={`text-11 mt-0.5 ml-11 ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>
                    开启后，新接入的服务器将自动启动对该目标的监控，已存在的服务器不受影响。
                  </p>
                </div>
              </div>

              {/* 5. 间隔 (秒) */}
              <div>
                <label className={`block font-medium text-xs mb-1.5 ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                  检测采样间隔 (秒)
                </label>
                <input
                  type="number"
                  min="5"
                  value={targetFormInterval}
                  onChange={(e) => setTargetFormInterval(parseInt(e.target.value) || 60)}
                  placeholder="60"
                  className={`input input-bordered input-sm w-full font-mono text-xs focus:outline-none ${
                    isBlueprint
                      ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                      : "bg-zinc-950 border-zinc-700 text-zinc-100 focus:border-indigo-500"
                  }`}
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className={`mt-6 flex items-center justify-end gap-3 font-sans text-xs pt-4 border-t ${isBlueprint ? "border-slate-100" : "border-zinc-800"}`}>
              <button
                type="button"
                onClick={() => setIsTargetModalOpen(false)}
                className="btn btn-sm btn-ghost font-sans text-slate-600 dark:text-zinc-400"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={handleSavePingTargetModal}
                className="btn btn-sm btn-primary font-sans font-medium"
              >
                {editingTargetId ? "保存修改" : "确认添加"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

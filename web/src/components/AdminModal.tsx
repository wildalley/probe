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
} from "lucide-react";
import { NodeState, PingTargetConfig, NodeSettings, SystemSettings, TokenItem } from "../types";
import { getRegionFlag } from "../utils/flags";
import { TagInput } from "./TagInput";
import { DatePicker } from "./DatePicker";
import { BandwidthConfig } from "./BandwidthConfig";

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
  const [activeTab, setActiveTab] = useState<"hosts" | "network" | "billing" | "tokens">("hosts");

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

  // --- Tokens State ---
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Quick deploy script state
  const [deployToken, setDeployToken] = useState("sk_default_secret_probe_token");
  const [deployName, setDeployName] = useState("node-01");
  const [deployRegion, setDeployRegion] = useState("");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

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
    const updated = { ...t, enabled: !t.enabled };
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
  const regionFlag = deployRegion.trim() && deployRegion.trim().toLowerCase() !== "auto"
    ? ` --region "${deployRegion.trim()}"`
    : "";
  const oneClickCmd = `curl -sSL ${httpUrl}/install.sh | sudo bash -s -- --server "${wsUrl}" --token "${deployToken}" --name "${deployName}"${regionFlag}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in font-sans">
      <div
        className={`relative flex flex-col w-full max-w-[1440px] h-[92vh] rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
          isBlueprint
            ? "bg-slate-50 border-slate-300 text-slate-900"
            : "bg-zinc-950 border-zinc-800 text-zinc-100"
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isBlueprint ? "bg-white border-slate-200" : "bg-zinc-900/90 border-zinc-800"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold font-mono">PROBE ADMIN CONSOLE</h2>
                <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                  管理后台
                </span>
              </div>
              <p className={`text-xs font-mono ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
                主机管理 · 网站延迟丢包监控 · 财务定价与实时汇率
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl border transition-colors ${
              isBlueprint
                ? "bg-white border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          className={`flex items-center gap-2 px-6 border-b shrink-0 text-xs font-mono overflow-x-auto ${
            isBlueprint ? "bg-slate-100/70 border-slate-200" : "bg-zinc-900/40 border-zinc-800/80"
          }`}
        >
          <button
            onClick={() => setActiveTab("hosts")}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-bold transition-colors ${
              activeTab === "hosts"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : isBlueprint
                ? "border-transparent text-slate-600 hover:text-slate-900"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Server className="h-4 w-4" />
            <span>主机管理 ({nodes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("network")}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-bold transition-colors ${
              activeTab === "network"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : isBlueprint
                ? "border-transparent text-slate-600 hover:text-slate-900"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>网络延迟与丢包检测 ({pingTargets.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("billing")}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-bold transition-colors ${
              activeTab === "billing"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : isBlueprint
                ? "border-transparent text-slate-600 hover:text-slate-900"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Coins className="h-4 w-4" />
            <span>财务计费与实时汇率</span>
          </button>

          <button
            onClick={() => setActiveTab("tokens")}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-bold transition-colors ${
              activeTab === "tokens"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : isBlueprint
                ? "border-transparent text-slate-600 hover:text-slate-900"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Key className="h-4 w-4" />
            <span>通信鉴权 Token ({tokens.length})</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: HOSTS */}
          {activeTab === "hosts" && (
            <div className="space-y-6">
              {/* Quick Deploy Card */}
              <div
                className={`rounded-2xl border p-5 transition-all shadow-sm ${
                  isBlueprint
                    ? "bg-slate-50/90 border-slate-200/90"
                    : "bg-zinc-900/80 border-zinc-800"
                }`}
              >
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 border-b pb-3 mb-4 font-mono ${
                    isBlueprint ? "border-slate-200" : "border-zinc-800"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      isBlueprint
                        ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-600"
                        : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                    } shrink-0`}>
                      <Terminal className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold tracking-tight">
                          快速添加主机 / 一键部署命令
                        </h3>
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          极速上线
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
                    自动识别地区 · 内嵌安全令牌 · 自动注册 Systemd 守护
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono mb-4">
                  <div>
                    <label className={`block mb-1.5 font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                      节点名称 (Name)
                    </label>
                    <input
                      type="text"
                      value={deployName}
                      onChange={(e) => setDeployName(e.target.value)}
                      placeholder="node-01"
                      className={`w-full rounded-xl border px-3.5 py-2 font-mono text-xs focus:outline-none transition-all ${
                        isBlueprint
                          ? "bg-white border-slate-300/90 text-slate-900 shadow-xs focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          : "bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block mb-1.5 font-semibold flex items-center justify-between ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                      <span className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-sky-500" />
                        地区 (Region)
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">● 默认自动识别</span>
                    </label>
                    <input
                      type="text"
                      value={deployRegion}
                      onChange={(e) => setDeployRegion(e.target.value)}
                      placeholder="留空自动识别 (或填写 HK, US 等)"
                      className={`w-full rounded-xl border px-3.5 py-2 font-mono text-xs focus:outline-none transition-all ${
                        isBlueprint
                          ? "bg-white border-slate-300/90 text-slate-900 placeholder:text-slate-400 shadow-xs focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          : "bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      }`}
                    />
                  </div>
                </div>

                {/* Token Auto Badge */}
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-mono mb-3.5 transition-colors ${
                    isBlueprint ? "bg-white border-slate-200/90 shadow-xs" : "bg-zinc-950/80 border-zinc-800/80"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className={isBlueprint ? "text-slate-700 font-medium" : "text-zinc-300"}>通信 Token:</span>
                    <code className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-xs">
                      {deployToken.slice(0, 14)}...{deployToken.slice(-6)}
                    </code>
                    <span className={`text-[11px] hidden sm:inline ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
                      (已自动嵌入下方安装命令)
                    </span>
                  </div>
                  <button
                    onClick={handleRegenerateDeployToken}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold transition-colors cursor-pointer"
                    title="重新生成并更换一个新 Token"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>换一个 Token</span>
                  </button>
                </div>

                {/* Command Shell Block */}
                <div className="relative group">
                  <pre
                    className={`p-4 rounded-xl border text-xs font-mono overflow-x-auto whitespace-pre-wrap select-all leading-relaxed shadow-inner ${
                      isBlueprint
                        ? "bg-slate-900 border-slate-800 text-emerald-400 font-semibold"
                        : "bg-zinc-950 border-zinc-800 text-emerald-400"
                    }`}
                  >
                    {oneClickCmd}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(oneClickCmd, "deployCmd")}
                    className="absolute right-3 top-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-mono font-bold transition-all shadow-md cursor-pointer"
                  >
                    {copiedCmd === "deployCmd" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedCmd === "deployCmd" ? "已复制" : "复制命令"}</span>
                  </button>
                </div>
              </div>

              {/* Node Editing Form (If active) */}
              {editingNode && (
                <div
                  className={`rounded-2xl border p-5 space-y-4 animate-fade-in shadow-xl ${
                    isBlueprint ? "bg-white border-indigo-400 shadow-indigo-100" : "bg-zinc-900 border-indigo-500/60 shadow-black"
                  }`}
                >
                  <div className="flex items-center justify-between border-b pb-3 font-mono">
                    <div className="flex items-center gap-2 font-bold text-base text-indigo-600 dark:text-indigo-400">
                      <Edit2 className="h-4 w-4" />
                      <span>编辑主机配置: {editingNode.name || editingNode.node_id}</span>
                    </div>
                    <button
                      onClick={() => setEditingNode(null)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition-colors ${
                        isBlueprint ? "border-slate-300 text-slate-600 hover:bg-slate-100" : "border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                      }`}
                    >
                      取消
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs font-mono">
                    <div>
                      <label className={`block mb-1 font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                        主机展示名称 (Name)
                      </label>
                      <input
                        type="text"
                        value={editingNode.name || ""}
                        onChange={(e) => setEditingNode({ ...editingNode, name: e.target.value })}
                        className={`w-full rounded-xl border px-3 py-2 focus:outline-none ${
                          isBlueprint
                            ? "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                            : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block mb-1 font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                        归属地区 (Region)
                      </label>
                      <input
                        type="text"
                        value={editingNode.region || ""}
                        onChange={(e) => setEditingNode({ ...editingNode, region: e.target.value })}
                        placeholder="如 HK, US, JP, SG 等"
                        className={`w-full rounded-xl border px-3 py-2 focus:outline-none ${
                          isBlueprint
                            ? "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                            : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block mb-1 font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                        服务提供商/线路 (Provider)
                      </label>
                      <input
                        type="text"
                        value={editingNode.provider || ""}
                        onChange={(e) => setEditingNode({ ...editingNode, provider: e.target.value })}
                        placeholder="如 BandwagonHost, Oracle, 腾讯云"
                        className={`w-full rounded-xl border px-3 py-2 focus:outline-none ${
                          isBlueprint
                            ? "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                            : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block mb-1 font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                        计费单价 (Price)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={editingNode.price}
                        onChange={(e) => setEditingNode({ ...editingNode, price: parseFloat(e.target.value) || 0 })}
                        className={`w-full rounded-xl border px-3 py-2 font-bold focus:outline-none ${
                          isBlueprint
                            ? "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                            : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block mb-1 font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                        货币单位 (Currency)
                      </label>
                      <select
                        value={editingNode.currency}
                        onChange={(e) => setEditingNode({ ...editingNode, currency: e.target.value })}
                        className={`w-full rounded-xl border px-3 py-2 font-bold focus:outline-none cursor-pointer ${
                          isBlueprint
                            ? "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
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
                      <label className={`block mb-1 font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                        计费周期 (Billing Cycle)
                      </label>
                      <select
                        value={editingNode.billing_cycle}
                        onChange={(e) => setEditingNode({ ...editingNode, billing_cycle: e.target.value })}
                        className={`w-full rounded-xl border px-3 py-2 font-bold focus:outline-none cursor-pointer ${
                          isBlueprint
                            ? "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
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
                    <label className={`block mb-1 text-xs font-mono font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
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
                    <label className={`block mb-1 text-xs font-mono font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
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
                    <label className={`block mb-1 text-xs font-mono font-semibold ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
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
                    <label className="flex items-center gap-2 text-xs font-mono font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editingNode.auto_renewal}
                        onChange={(e) => setEditingNode({ ...editingNode, auto_renewal: e.target.checked })}
                        className="rounded border-zinc-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className={isBlueprint ? "text-slate-800" : "text-zinc-200"}>
                        开启到期自动续费 (Auto Renewal)
                      </span>
                    </label>

                    <div className="flex items-center gap-3">
                      {hostSaveSuccess && (
                        <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                          <Check className="h-4 w-4" /> 配置保存成功！
                        </span>
                      )}
                      <button
                        onClick={handleSaveNodeSettings}
                        className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold shadow-md transition-all"
                      >
                        保存主机设置
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Registered Hosts List */}
              <div
                className={`rounded-2xl border overflow-hidden ${
                  isBlueprint ? "bg-white border-slate-300 shadow-sm" : "bg-zinc-900/60 border-zinc-800"
                }`}
              >
                <div
                  className={`px-5 py-3.5 border-b text-xs font-mono font-bold flex items-center justify-between ${
                    isBlueprint ? "bg-slate-100/70 border-slate-200 text-slate-800" : "bg-zinc-900 border-zinc-800 text-zinc-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-indigo-500" />
                    已注册主机列表 ({nodes.length})
                  </span>
                  <span className={`text-[11px] font-normal ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
                    点击操作栏「配置」即可修改计费、标签及流量配额
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead
                      className={`border-b text-[11px] font-bold ${
                        isBlueprint ? "bg-slate-100 text-slate-700 border-slate-200" : "bg-zinc-950/80 text-zinc-400 border-zinc-800"
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
                        <th className="py-3 px-4 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isBlueprint ? "divide-slate-200" : "divide-zinc-800/60"}`}>
                      {nodes.map((n) => {
                        const totalQuota = n.billing?.bandwidth_quota || 0;
                        const totalUsed = n.billing?.bandwidth_used || ((n.network.bytes_sent || 0) + (n.network.bytes_recv || 0));
                        const percent = totalQuota > 0 ? Math.min(100, Math.round((totalUsed / totalQuota) * 100)) : 0;

                        return (
                          <tr
                            key={n.node_id}
                            className={`transition-colors ${
                              isBlueprint ? "hover:bg-slate-50" : "hover:bg-zinc-800/40"
                            }`}
                          >
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  n.is_online
                                    ? isBlueprint
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                    : isBlueprint
                                    ? "bg-rose-100 text-rose-800 border border-rose-300"
                                    : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    n.is_online ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                                  }`}
                                />
                                {n.is_online ? "在线" : "离线"}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className={`font-bold ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                                {n.name}
                              </div>
                              <div className={`text-[11px] ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                                {n.node_id}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="flex items-center gap-1.5 font-semibold">
                                <span className="text-base">{getRegionFlag(n.region)}</span>
                                <span className={isBlueprint ? "text-slate-800" : "text-zinc-200"}>{n.region}</span>
                              </span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className={isBlueprint ? "text-slate-800 font-medium" : "text-zinc-200"}>
                                {n.system.os || "Linux"}
                              </div>
                              <div className={`text-[11px] ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                                {n.system.public_ip || "127.0.0.1"}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="font-bold text-indigo-600 dark:text-indigo-400">
                                {n.billing?.currency || "$"}{n.billing?.price || n.billing?.price_per_month || 9.9}
                                <span className={`text-[11px] font-normal ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                                  {" "}/ {n.billing?.billing_cycle || "month"}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className={`text-[11px] font-semibold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                                {totalQuota > 0 ? `${percent}%` : "无限制"}
                              </div>
                              <div className={`text-[10px] ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                                {n.billing?.bandwidth_quota ? `${(totalQuota / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB` : "无限"}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className={`font-semibold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                                {n.billing?.remaining_days != null ? `${n.billing.remaining_days} 天` : "--"}
                              </div>
                              <div className={`text-[10px] ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                                {n.billing?.expiry_date || "未设到期"}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap text-right space-x-2">
                              <button
                                onClick={() => handleEditNodeClick(n)}
                                className={`px-2.5 py-1 rounded-lg border font-bold text-xs transition-colors ${
                                  isBlueprint
                                    ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200"
                                    : "bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border-indigo-700/60"
                                }`}
                              >
                                配置
                              </button>
                              <button
                                onClick={() => handleDeleteNode(n.node_id)}
                                className={`px-2 py-1 rounded-lg border font-bold text-xs transition-colors ${
                                  isBlueprint
                                    ? "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
                                    : "bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border-rose-700/60"
                                }`}
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {nodes.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-slate-500 font-mono">
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
                  <h3 className={`text-base font-bold font-mono ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                    网络质量监测目标 (Network Probes)
                  </h3>
                  <p className={`text-xs font-mono ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
                    各探针节点定时检测目标延迟与丢包率，色彩系统自动按高对比度配色
                  </p>
                </div>

                <button
                  onClick={openAddTargetModal}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold shadow-md transition-all"
                >
                  <Plus className="h-4 w-4" />
                  <span>添加监测</span>
                </button>
              </div>

              {/* Instant ping tester quick bar */}
              <div
                className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                  isBlueprint ? "bg-white border-slate-200" : "bg-zinc-900/60 border-zinc-800"
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-mono">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className={`font-semibold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>即时测速测试:</span>
                  <input
                    type="text"
                    id="instant-test-input"
                    placeholder="输入 IP 或域名，如 1.1.1.1"
                    defaultValue="1.1.1.1"
                    className={`rounded-lg border px-2.5 py-1 text-xs font-mono focus:outline-none ${
                      isBlueprint ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-zinc-950 border-zinc-700 text-zinc-100"
                    }`}
                  />
                  <button
                    disabled={isTesting}
                    onClick={() => {
                      const input = document.getElementById("instant-test-input") as HTMLInputElement;
                      if (input && input.value) handleTestTarget(input.value.trim());
                    }}
                    className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-semibold transition-colors disabled:opacity-50"
                  >
                    {isTesting ? "测试中..." : "测试连接"}
                  </button>
                </div>

                {testResult && (
                  <div
                    className={`px-3 py-1 rounded-lg border text-xs font-mono flex items-center gap-1.5 ${
                      testResult.success
                        ? isBlueprint
                          ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                          : "bg-emerald-950/50 text-emerald-400 border-emerald-800/60"
                        : isBlueprint
                        ? "bg-rose-50 text-rose-800 border-rose-300"
                        : "bg-rose-950/50 text-rose-400 border-rose-800/60"
                    }`}
                  >
                    {testResult.success ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                    <span>
                      {testResult.success
                        ? `响应延迟: ${testResult.latency_ms} ms (${testResult.target})`
                        : `连接失败: ${testResult.error || "超时"}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Ping Targets Table */}
              <div
                className={`rounded-2xl border overflow-hidden ${
                  isBlueprint ? "bg-white border-slate-300 shadow-sm" : "bg-zinc-900/60 border-zinc-800"
                }`}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead
                      className={`border-b text-[11px] font-bold ${
                        isBlueprint ? "bg-slate-100 text-slate-700 border-slate-200" : "bg-zinc-950 text-zinc-400 border-zinc-800"
                      }`}
                    >
                      <tr>
                        <th className="py-3 px-4">色彩</th>
                        <th className="py-3 px-4">监测目标名称</th>
                        <th className="py-3 px-4">地址 / 目标</th>
                        <th className="py-3 px-4">协议类型</th>
                        <th className="py-3 px-4">检测间隔</th>
                        <th className="py-3 px-4">监测范围</th>
                        <th className="py-3 px-4">状态</th>
                        <th className="py-3 px-4 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isBlueprint ? "divide-slate-200" : "divide-zinc-800/60"}`}>
                      {pingTargets.map((t) => (
                        <tr
                          key={t.id || t.label}
                          className={`transition-colors ${
                            isBlueprint ? "hover:bg-slate-50" : "hover:bg-zinc-800/40"
                          }`}
                        >
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-3 w-3 rounded-full shadow-sm"
                                style={{ backgroundColor: t.color || "#3b82f6" }}
                              />
                              <span className="text-[10px] text-slate-400 font-mono">{t.color}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-bold">
                            <span className={isBlueprint ? "text-slate-900" : "text-zinc-100"}>{t.label}</span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <code className={`px-2 py-0.5 rounded ${isBlueprint ? "bg-slate-100 text-slate-800" : "bg-zinc-950 text-zinc-300"}`}>
                              {t.target}
                            </code>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap uppercase font-bold text-[11px]">
                            <span
                              className={`px-2 py-0.5 rounded ${
                                t.protocol === "http"
                                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                                  : t.protocol === "tcp"
                                  ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30"
                                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              }`}
                            >
                              {t.protocol || "tcp"}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                              {t.interval || 60} 秒
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {t.servers && t.servers.length > 0 ? (
                              <span className="text-zinc-400">{t.servers.length} 台服务器</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">全部服务器</span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <button
                              onClick={() => handleToggleTarget(t)}
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-colors ${
                                t.enabled !== false
                                  ? isBlueprint
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                  : isBlueprint
                                  ? "bg-slate-100 text-slate-600 border border-slate-300"
                                  : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                              }`}
                            >
                              {t.enabled !== false ? "已启用" : "已停用"}
                            </button>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-right space-x-2">
                            <button
                              onClick={() => openEditTargetModal(t)}
                              className={`px-2.5 py-1 rounded-lg border font-bold text-xs transition-colors ${
                                isBlueprint
                                  ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200"
                                  : "bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border-indigo-700/60"
                              }`}
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleDeleteTarget(t.id)}
                              className={`px-2 py-1 rounded-lg border font-bold text-xs transition-colors ${
                                isBlueprint
                                  ? "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
                                  : "bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border-rose-700/60"
                              }`}
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                      {pingTargets.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-slate-500 font-mono">
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
                  className={`p-5 rounded-2xl border ${
                    isBlueprint ? "bg-white border-slate-300 shadow-sm" : "bg-zinc-900/70 border-zinc-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-500 dark:text-zinc-400 mb-1">
                    <span>集群月度总支出 (折合人民币)</span>
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                    ¥{totalMonthlySpendCNY.toFixed(2)}
                    <span className="text-xs font-normal text-slate-500 dark:text-zinc-500 ml-2">/ 月</span>
                  </div>
                  <div className={`text-[11px] font-mono mt-2 ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
                    根据当前各币种实时汇率折算合计支出
                  </div>
                </div>

                <div
                  className={`p-5 rounded-2xl border ${
                    isBlueprint ? "bg-white border-slate-300 shadow-sm" : "bg-zinc-900/70 border-zinc-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-500 dark:text-zinc-400 mb-1">
                    <span>集群剩余总价值 (折合人民币)</span>
                    <Coins className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div className="text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                    ¥{totalRemainingValueCNY.toFixed(2)}
                  </div>
                  <div className={`text-[11px] font-mono mt-2 ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
                    根据各主机到期时间和剩余天数实时动态计算
                  </div>
                </div>
              </div>

              {/* Exchange Rates Config */}
              <div
                className={`rounded-2xl border p-5 space-y-4 ${
                  isBlueprint ? "bg-white border-slate-300 shadow-sm" : "bg-zinc-900/70 border-zinc-800"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                  <div>
                    <h3 className={`text-sm font-bold font-mono ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                      外汇汇率换算表 (Exchange Rates to {systemSettings.base_currency})
                    </h3>
                    <p className={`text-xs font-mono ${isBlueprint ? "text-slate-600" : "text-zinc-400"}`}>
                      用于将外币主机（USD、EUR、HKD、GBP、JPY）自动换算为本币成本
                    </p>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-xs">
                    <button
                      onClick={handleRefreshRates}
                      disabled={isRefreshingRates}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 transition-colors font-bold disabled:opacity-50"
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
                        isBlueprint ? "bg-slate-50 border-slate-300" : "bg-zinc-950 border-zinc-800"
                      }`}
                    >
                      <div className={`text-[11px] font-bold mb-1 ${isBlueprint ? "text-slate-700" : "text-zinc-400"}`}>
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
                        <span className="text-slate-500 font-bold">{systemSettings.base_currency}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className={`text-[11px] font-mono ${isBlueprint ? "text-slate-500" : "text-zinc-500"}`}>
                    上次汇率更新: {systemSettings.last_rate_update ? new Date(systemSettings.last_rate_update * 1000).toLocaleString() : "默认初始值"}
                  </span>

                  <div className="flex items-center gap-3">
                    {rateSaveSuccess && (
                      <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="h-4 w-4" /> 汇率保存成功
                      </span>
                    )}
                    <button
                      onClick={handleSaveRates}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold shadow-md transition-colors"
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
                className={`p-4 rounded-2xl border flex flex-wrap items-center gap-3 ${
                  isBlueprint ? "bg-white border-slate-300 shadow-sm" : "bg-zinc-900/70 border-zinc-800"
                }`}
              >
                <div className="flex-1 min-w-[240px]">
                  <input
                    type="text"
                    placeholder="输入新 Token 标签备注 (如: 美国VPS专用)..."
                    value={newTokenLabel}
                    onChange={(e) => setNewTokenLabel(e.target.value)}
                    className={`w-full rounded-xl border px-3 py-2 text-xs font-mono focus:outline-none ${
                      isBlueprint
                        ? "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                        : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
                    }`}
                  />
                </div>
                <button
                  onClick={handleCreateToken}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold shadow-md transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>生成新 Token</span>
                </button>
              </div>

              {/* Tokens list */}
              <div
                className={`rounded-2xl border overflow-hidden ${
                  isBlueprint ? "bg-white border-slate-300 shadow-sm" : "bg-zinc-900/60 border-zinc-800"
                }`}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead
                      className={`border-b text-[11px] font-bold ${
                        isBlueprint ? "bg-slate-100 text-slate-700 border-slate-200" : "bg-zinc-950 text-zinc-400 border-zinc-800"
                      }`}
                    >
                      <tr>
                        <th className="py-3 px-4">Token 令牌</th>
                        <th className="py-3 px-4">备注标签</th>
                        <th className="py-3 px-4">创建时间</th>
                        <th className="py-3 px-4 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isBlueprint ? "divide-slate-200" : "divide-zinc-800/60"}`}>
                      {tokens.map((t) => (
                        <tr
                          key={t.token}
                          className={`transition-colors ${
                            isBlueprint ? "hover:bg-slate-50" : "hover:bg-zinc-800/40"
                          }`}
                        >
                          <td className="py-3 px-4 whitespace-nowrap">
                            <code className={`px-2 py-0.5 rounded font-bold ${isBlueprint ? "bg-slate-100 text-emerald-800" : "bg-zinc-950 text-emerald-400"}`}>
                              {t.token}
                            </code>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-medium">
                            {t.label}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                            {t.created_at ? new Date(t.created_at * 1000).toLocaleString() : "--"}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-right">
                            <button
                              onClick={() => copyToClipboard(t.token, t.token)}
                              className={`px-3 py-1 rounded-lg border font-bold text-xs transition-colors ${
                                isBlueprint
                                  ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
                              }`}
                            >
                              {copiedCmd === t.token ? "已复制" : "复制"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Add / Edit Ping Target (Identical to user's uploaded screenshot) */}
      {isTargetModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in font-sans">
          <div
            className={`relative w-full max-w-lg rounded-2xl border p-6 shadow-2xl transition-colors ${
              isBlueprint ? "bg-white border-slate-300 text-slate-900" : "bg-zinc-900 border-zinc-800 text-zinc-100"
            }`}
          >
            <h2 className="text-xl font-bold font-sans tracking-tight mb-5">
              {editingTargetId ? "编辑监测" : "添加"}
            </h2>

            <div className="space-y-4 font-sans text-sm">
              {/* 1. 名称 */}
              <div>
                <label className={`block font-bold mb-1.5 ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                  名称
                </label>
                <input
                  type="text"
                  value={targetFormName}
                  onChange={(e) => setTargetFormName(e.target.value)}
                  placeholder="如: Google, 电信, YouTube"
                  className={`w-full rounded-xl border px-3.5 py-2.5 font-sans focus:outline-none ${
                    isBlueprint
                      ? "bg-white border-slate-300 text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                      : "bg-zinc-950 border-zinc-700 text-zinc-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  }`}
                />
              </div>

              {/* 2. 目标地址 */}
              <div>
                <label className={`block font-bold mb-1.5 ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                  目标地址 (域名或IP)
                </label>
                <input
                  type="text"
                  value={targetFormAddress}
                  onChange={(e) => setTargetFormAddress(e.target.value)}
                  placeholder="如: 8.8.8.8, 223.5.5.5, www.google.com"
                  className={`w-full rounded-xl border px-3.5 py-2.5 font-mono text-xs focus:outline-none ${
                    isBlueprint
                      ? "bg-white border-slate-300 text-slate-900 focus:border-indigo-600"
                      : "bg-zinc-950 border-zinc-700 text-zinc-100 focus:border-indigo-500"
                  }`}
                />
              </div>

              {/* 3. 类型 (Card list selector with checkmark ✓ matching screenshot) */}
              <div>
                <label className={`block font-bold mb-1.5 ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                  类型
                </label>
                <div
                  className={`rounded-xl border p-2 space-y-1 ${
                    isBlueprint ? "border-slate-300 bg-white" : "border-zinc-700 bg-zinc-950/60"
                  }`}
                >
                  {(["icmp", "tcp", "http"] as const).map((typeKey) => {
                    const isSelected = targetFormType === typeKey;
                    const labelText = typeKey.toUpperCase();
                    return (
                      <div
                        key={typeKey}
                        onClick={() => setTargetFormType(typeKey)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? isBlueprint
                              ? "bg-slate-100 text-slate-900 font-bold"
                              : "bg-zinc-800/80 text-zinc-100 font-bold"
                            : isBlueprint
                            ? "hover:bg-slate-50 text-slate-600"
                            : "hover:bg-zinc-900 text-zinc-400"
                        }`}
                      >
                        <span className="w-4 text-center font-bold text-indigo-600 dark:text-indigo-400">
                          {isSelected ? "✓" : ""}
                        </span>
                        <span>{labelText}</span>
                        {typeKey === "icmp" && (
                          <span className={`text-xs ml-auto font-normal ${isBlueprint ? "text-slate-500" : "text-zinc-500"}`}>
                            网络层 Ping
                          </span>
                        )}
                        {typeKey === "tcp" && (
                          <span className={`text-xs ml-auto font-normal ${isBlueprint ? "text-slate-500" : "text-zinc-500"}`}>
                            端口连接
                          </span>
                        )}
                        {typeKey === "http" && (
                          <span className={`text-xs ml-auto font-normal ${isBlueprint ? "text-slate-500" : "text-zinc-500"}`}>
                            Web HTTP 响应
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* TCP Port field if TCP */}
              {targetFormType === "tcp" && (
                <div>
                  <label className={`block font-bold mb-1.5 ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                    TCP 端口
                  </label>
                  <input
                    type="number"
                    value={targetFormPort}
                    onChange={(e) => setTargetFormPort(parseInt(e.target.value) || 443)}
                    placeholder="443"
                    className={`w-full rounded-xl border px-3.5 py-2 font-mono text-xs focus:outline-none ${
                      isBlueprint ? "bg-white border-slate-300 text-slate-900" : "bg-zinc-950 border-zinc-700 text-zinc-100"
                    }`}
                  />
                </div>
              )}

              {/* 4. 服务器选择 */}
              <div>
                <label className={`block font-bold mb-1.5 ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                  服务器
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsServerPickerOpen(!isServerPickerOpen)}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    选择
                  </button>
                  <span className={`text-xs font-mono font-medium ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
                    {targetFormServers.length === 0
                      ? "所有服务器 (全部)"
                      : `${targetFormServers.length} 已选择`}
                  </span>
                </div>

                {/* Server Picker dropdown */}
                {isServerPickerOpen && (
                  <div
                    className={`mt-2 p-3 rounded-xl border space-y-1.5 max-h-40 overflow-y-auto ${
                      isBlueprint ? "bg-slate-50 border-slate-300" : "bg-zinc-950 border-zinc-800"
                    }`}
                  >
                    <div
                      onClick={() => setTargetFormServers([])}
                      className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs font-mono ${
                        targetFormServers.length === 0 ? "font-bold text-indigo-600" : ""
                      }`}
                    >
                      {targetFormServers.length === 0 ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      <span>全部服务器 (默认监测全部节点)</span>
                    </div>
                    {nodes.map((node) => {
                      const isChecked = targetFormServers.includes(node.node_id);
                      return (
                        <div
                          key={node.node_id}
                          onClick={() => {
                            if (isChecked) {
                              setTargetFormServers(targetFormServers.filter((id) => id !== node.node_id));
                            } else {
                              setTargetFormServers([...targetFormServers, node.node_id]);
                            }
                          }}
                          className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs font-mono hover:bg-black/5 dark:hover:bg-white/5"
                        >
                          {isChecked ? (
                            <CheckSquare className="h-4 w-4 text-indigo-600" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-400" />
                          )}
                          <span>{node.name} ({node.node_id})</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Checkbox: 默认开启 */}
                <div className="mt-2.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={targetFormAutoStart}
                      onChange={(e) => setTargetFormAutoStart(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                    <span className={`text-xs font-bold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
                      默认开启
                    </span>
                  </label>
                  <p className={`text-[11px] mt-0.5 ml-5.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                    开启后，新加入的服务器会自动启用此监测；已存在的服务器不受影响。
                  </p>
                </div>
              </div>

              {/* 5. 间隔 (秒) */}
              <div>
                <label className={`block font-bold mb-1.5 ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                  间隔 (秒)
                </label>
                <input
                  type="number"
                  min="1"
                  value={targetFormInterval}
                  onChange={(e) => setTargetFormInterval(parseInt(e.target.value) || 60)}
                  placeholder="60"
                  className={`w-full rounded-xl border px-3.5 py-2.5 font-sans focus:outline-none ${
                    isBlueprint
                      ? "bg-white border-slate-300 text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                      : "bg-zinc-950 border-zinc-700 text-zinc-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  }`}
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 font-sans">
              <button
                type="button"
                onClick={() => setIsTargetModalOpen(false)}
                className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                  isBlueprint
                    ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-700"
                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                }`}
              >
                关闭
              </button>
              <button
                type="button"
                onClick={handleSavePingTargetModal}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-md transition-colors"
              >
                {editingTargetId ? "保存" : "添加"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from "react";
import { Check, CheckCircle2, Globe, Sliders, Ticket, X, Zap } from "lucide-react";
import { Switch } from "@heroui/react";
import { NodeSettings, NodeState, ThemeMode } from "../../../types";
import { getRegionFlag } from "../../../utils/flags";
import { TagInput } from "../../TagInput";
import { DatePicker } from "../../DatePicker";
import { BandwidthConfig } from "../../BandwidthConfig";
import { BlueprintSelect } from "../../ui/BlueprintSelect";
import { BILLING_CYCLE_OPTIONS, CURRENCY_OPTIONS } from "./billingOptions";

interface HostEditDialogProps {
  /** The row being configured. The dialog only mounts when this is set. */
  node: NodeState;
  theme?: ThemeMode;
  onClose: () => void;
  /** Fired after a successful save so the caller can refetch the node list. */
  onSaved?: () => void;
}

const toDraft = (node: NodeState): NodeSettings => ({
  node_id: node.node_id,
  name: node.name,
  region: node.region,
  tags: node.tags || [],
  provider: node.billing?.provider || "",
  public_ip: node.system.public_ip || "",
  public_ipv6: node.system.public_ipv6 || "",
  price: node.billing?.price || node.billing?.price_per_month || 0,
  currency: node.billing?.currency || "$",
  billing_cycle: node.billing?.billing_cycle || "month",
  expiry_date: node.billing?.expiry_date || "",
  bandwidth_quota: node.billing?.bandwidth_quota || 0,
  bandwidth_used: 0,
  auto_renewal: node.billing?.auto_renewal || false,
  note: node.billing?.note || "",
});

export const HostEditDialog: React.FC<HostEditDialogProps> = ({
  node,
  theme = "dark",
  onClose,
  onSaved,
}) => {
  const [draft, setDraft] = useState<NodeSettings>(() => toDraft(node));
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isResolvingGeo, setIsResolvingGeo] = useState(false);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [showManualOverride, setShowManualOverride] = useState(false);

  const patch = (fields: Partial<NodeSettings>) => setDraft((prev) => ({ ...prev, ...fields }));

  const liveTotalBytes = (node.network.bytes_sent || 0) + (node.network.bytes_recv || 0);
  const liveSplit = {
    up: node.network.bytes_sent || 0,
    down: node.network.bytes_recv || 0,
  };

  useEffect(() => {
    let cancelled = false;
    setSettingsLoaded(false);
    setSettingsLoadError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/nodes/${encodeURIComponent(node.node_id)}/settings`
        );
        if (!res.ok) throw new Error(`服务返回 ${res.status}`);
        const saved = await res.json();
        if (cancelled) return;
        setDraft((prev) => ({
          ...prev,
          public_ip: saved.public_ip || prev.public_ip,
          public_ipv6: saved.public_ipv6 || prev.public_ipv6,
          bandwidth_used: saved.bandwidth_used || 0,
        }));
        setSettingsLoaded(true);
      } catch {
        if (!cancelled) setSettingsLoadError("读取主机设置失败，请关闭后重试");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [node.node_id]);

  const handleAutoResolveGeo = async () => {
    const ip = draft.public_ip || node.system?.public_ip || "";
    if (!ip || ip === "127.0.0.1" || ip === "::1") {
      setGeoError("该节点未上报真实公网 IP（当前为局域网/回环地址），无法在线查询全球运营商");
      return;
    }

    try {
      setIsResolvingGeo(true);
      setGeoNotice(null);
      setGeoError(null);
      const res = await fetch(`/api/v1/geoip/lookup?ip=${encodeURIComponent(ip)}`);
      if (!res.ok) {
        setGeoError(`识别失败: 服务返回 ${res.status}`);
        return;
      }
      const data = await res.json();
      if (data && data.country_code) {
        const currentTags = draft.tags || [];
        const newTags =
          data.line_tag && !currentTags.includes(data.line_tag)
            ? [...currentTags, data.line_tag]
            : currentTags;

        patch({
          region: data.country_code !== "GLOBAL" ? data.country_code : draft.region,
          provider: data.provider || draft.provider,
          tags: newTags,
        });
        setGeoNotice(
          `已根据公网 IP 自动识别：${data.country || data.country_code} · ${data.provider} (${data.line_tag})`
        );
        setTimeout(() => setGeoNotice(null), 6000);
      }
    } catch (e: any) {
      setGeoError(`识别失败: ${e.message}`);
    } finally {
      setIsResolvingGeo(false);
    }
  };

  const handleSave = async () => {
    if (!settingsLoaded) return;
    try {
      setIsSaving(true);
      setSaveError(null);
      const res = await fetch(
        `/api/v1/nodes/${encodeURIComponent(draft.node_id)}/settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        }
      );
      if (!res.ok) {
        setSaveError(`保存失败: 服务返回 ${res.status}`);
        return;
      }
      setSaveSuccess(true);
      if (onSaved) onSaved();
      setTimeout(onClose, 900);
    } catch (e: any) {
      setSaveError(`保存失败: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const labelCls = "block mb-1 text-11 font-mono font-bold text-[var(--nezha-ink-3)] uppercase";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 lg:p-6 bg-black/80 backdrop-blur-sm animate-fade-in font-mono">
      <div className="relative flex flex-col w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none border-1.5 border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] shadow-2xl overflow-hidden transition-colors">
        {/* Dialog header */}
        <div className="flex items-center justify-between gap-2.5 sm:gap-3 px-4 py-3 sm:px-6 sm:py-3.5 border-b border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-accent)]">
              <Sliders className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold tracking-tight truncate text-[var(--nezha-ink)]">
                [ CONFIG · HOST ] // {draft.name || draft.node_id}
              </h2>
              <p className="text-11 font-mono text-[var(--nezha-ink-3)] mt-0.5">
                IDENTIFIER: {draft.node_id}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:bg-[var(--nezha-accent)] hover:text-[#141414] text-[var(--nezha-ink)] cursor-pointer"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs font-mono">
          {geoNotice && (
            <div className="border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 py-2.5 px-3.5 text-xs flex items-center gap-2 rounded-none font-bold">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{geoNotice}</span>
            </div>
          )}
          {geoError && (
            <div className="border border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 py-2.5 px-3.5 text-xs flex items-center gap-2 rounded-none font-bold" role="alert">
              <X className="h-4 w-4 shrink-0" />
              <span>{geoError}</span>
            </div>
          )}

          {/* Auto-identified region & provider */}
          <div className="border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] p-3 flex flex-wrap items-center justify-between gap-3 text-xs rounded-none">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <Globe className="h-4 w-4 text-[var(--nezha-accent)] shrink-0" />
                <span className="text-[var(--nezha-ink-3)]">归属地区:</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] text-xs font-bold">
                  <span className="text-sm leading-none">{getRegionFlag(draft.region || "")}</span>
                  <span className="leading-none">{draft.region || "自动识别中"}</span>
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-bold">
                <span className="text-[var(--nezha-ink-3)]">服务商/线路:</span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] text-xs font-bold">
                  {draft.provider || "智能测定中..."}
                </span>
              </div>

              {draft.public_ip && (
                <span className="text-11 font-mono text-[var(--nezha-ink-3)]">
                  (出口 IP: {draft.public_ip})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAutoResolveGeo}
                disabled={isResolvingGeo}
                className="h-7 px-2.5 text-11 font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                aria-label="根据该节点公网 IP 自动重新解析国家地区与网络线路"
              >
                <Zap className={`h-3 w-3 text-[var(--nezha-accent)] ${isResolvingGeo ? "animate-spin" : ""}`} />
                <span>{isResolvingGeo ? "识别中..." : "重新识别"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowManualOverride(!showManualOverride)}
                className="h-7 px-2 text-11 font-mono text-[var(--nezha-ink-3)] hover:text-[var(--nezha-ink)] flex items-center gap-1 cursor-pointer"
              >
                {showManualOverride ? "收起微调 ▴" : "手动微调 ▾"}
              </button>
            </div>
          </div>

          {/* Manual overrides, collapsed by default */}
          {showManualOverride && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3 rounded-none border border-dashed border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]">
              <div>
                <label className={labelCls} htmlFor="host-region-override">
                  强制指定地区 (覆盖自动识别)
                </label>
                <input
                  id="host-region-override"
                  type="text"
                  value={draft.region || ""}
                  onChange={(e) => patch({ region: e.target.value })}
                  placeholder="如 HK, US, JP, SG 等"
                  className="w-full h-8 px-2.5 text-xs font-mono rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] focus:border-[var(--nezha-accent)] focus:outline-none"
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="host-provider-override">
                  强制指定服务商/线路 (覆盖自动识别)
                </label>
                <input
                  id="host-provider-override"
                  type="text"
                  value={draft.provider || ""}
                  onChange={(e) => patch({ provider: e.target.value })}
                  placeholder="如 BandwagonHost CN2 GIA, Oracle"
                  className="w-full h-8 px-2.5 text-xs font-mono rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] focus:border-[var(--nezha-accent)] focus:outline-none"
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="host-public-ip">
                  公网 IPv4 (覆盖自动探测)
                </label>
                <input
                  id="host-public-ip"
                  type="text"
                  value={draft.public_ip || ""}
                  onChange={(e) => patch({ public_ip: e.target.value })}
                  placeholder={node.system.public_ip || "留空则用 Agent 探测结果"}
                  className="w-full h-8 px-2.5 text-xs font-mono rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] focus:border-[var(--nezha-accent)] focus:outline-none"
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="host-public-ipv6">
                  公网 IPv6 (覆盖自动探测)
                </label>
                <input
                  id="host-public-ipv6"
                  type="text"
                  value={draft.public_ipv6 || ""}
                  onChange={(e) => patch({ public_ipv6: e.target.value })}
                  placeholder={node.system.public_ipv6 || "留空则用 Agent 探测结果"}
                  className="w-full h-8 px-2.5 text-xs font-mono rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] focus:border-[var(--nezha-accent)] focus:outline-none"
                />
              </div>
              <p className="sm:col-span-2 text-10 text-[var(--nezha-ink-3)] font-mono">
                NAT/Docker 环境下 Agent 可能只看到内网地址。填写后以此为准，留空则回退到 Agent 探测值。
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="sm:col-span-2 md:col-span-1">
              <label className={labelCls} htmlFor="host-name">
                主机展示名称 (Name)
              </label>
              <input
                id="host-name"
                type="text"
                value={draft.name || ""}
                onChange={(e) => patch({ name: e.target.value })}
                className="w-full h-8 px-2.5 text-xs font-mono rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] focus:border-[var(--nezha-accent)] focus:outline-none"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="host-price">
                计费单价 (Price)
              </label>
              <input
                id="host-price"
                type="number"
                step="0.01"
                value={draft.price}
                onChange={(e) => patch({ price: parseFloat(e.target.value) || 0 })}
                className="w-full h-8 px-2.5 font-mono text-xs font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] focus:border-[var(--nezha-accent)] focus:outline-none"
              />
            </div>
            <div>
              <label className={labelCls}>货币单位 (Currency)</label>
              <BlueprintSelect
                value={draft.currency || "USD"}
                options={CURRENCY_OPTIONS}
                onChange={(val) => patch({ currency: val })}
                aria-label="货币单位"
              />
            </div>
            <div>
              <label className={labelCls}>计费周期 (Billing Cycle)</label>
              <BlueprintSelect
                value={draft.billing_cycle || "monthly"}
                options={BILLING_CYCLE_OPTIONS}
                onChange={(val) => patch({ billing_cycle: val })}
                aria-label="计费周期"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>服务到期时间 (Expiry Date)</label>
            <DatePicker
              value={draft.expiry_date || ""}
              onChange={(dateVal) => patch({ expiry_date: dateVal })}
              theme={theme}
            />
          </div>

          <div>
            <label className={labelCls}>流量配额与使用量设置 (Bandwidth Settings)</label>
            {settingsLoaded ? (
              <BandwidthConfig
                quotaBytes={draft.bandwidth_quota}
                usedBytes={draft.bandwidth_used || 0}
                liveTotalBytes={liveTotalBytes}
                liveSplit={liveSplit}
                onChange={(newQuota, newUsed) =>
                  patch({ bandwidth_quota: newQuota, bandwidth_used: newUsed })
                }
                theme={theme}
              />
            ) : (
              <p className="text-xs text-[var(--nezha-ink-3)] font-mono">
                {settingsLoadError || "正在读取主机设置..."}
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>线路与特性标签 (Tags)</label>
            <TagInput
              tags={draft.tags || []}
              onChange={(newTags) => patch({ tags: newTags })}
              theme={theme}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`${labelCls} mb-0 flex items-center gap-1.5`} htmlFor="host-note">
                <Ticket className="h-3.5 w-3.5 text-[var(--nezha-accent)] shrink-0" />
                <span>备注备忘 / 优惠折扣码 (Notes & Promo Code)</span>
              </label>
              <span className="text-10 text-[var(--nezha-ink-3)] font-mono">
                选填 · 支持随时修改
              </span>
            </div>
            <input
              id="host-note"
              type="text"
              value={draft.note || ""}
              onChange={(e) => patch({ note: e.target.value })}
              placeholder="如：续费循环5折码 PROMO50 / 购买渠道 / 账号备忘"
              className="w-full h-8 px-2.5 text-xs font-mono rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] focus:border-[var(--nezha-accent)] focus:outline-none"
            />
            <p className="mt-1 text-10 text-[var(--nezha-ink-3)] font-mono">
              保存后会在主机卡片和详情页醒目标出，支持在卡片与详情页一键复制。
            </p>
          </div>

          <div className="pt-1">
            <Switch
              isSelected={draft.auto_renewal}
              onChange={(v) => patch({ auto_renewal: v })}
              size="sm"
            >
              <Switch.Content className="gap-2">
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <span className="text-xs font-bold font-mono text-[var(--nezha-ink)]">
                  开启到期自动续费 (Auto Renewal)
                </span>
              </Switch.Content>
            </Switch>
          </div>
        </div>

        {/* Sticky footer actions */}
        <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-6 sm:py-3.5 border-t border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] shrink-0 text-xs font-mono">
          {saveError && (
            <span className="mr-auto text-rose-500 font-bold" role="alert">
              {saveError}
            </span>
          )}
          {saveSuccess && (
            <span className="mr-auto inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" /> [OK] 配置保存成功！
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !settingsLoaded}
            className="h-8 px-4 text-xs font-mono font-bold rounded-none border border-[#141414]/30 bg-[var(--nezha-accent)] hover:bg-[#E54D16] text-[#141414] shadow-none transition-colors cursor-pointer disabled:opacity-50"
          >
            {isSaving ? "保存中..." : !settingsLoaded && !settingsLoadError ? "读取中..." : "保存主机设置"}
          </button>
        </div>
      </div>
    </div>
  );
};

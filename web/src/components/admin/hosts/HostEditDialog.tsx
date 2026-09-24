import React, { useEffect, useState } from "react";
import { Check, CheckCircle2, Globe, Sliders, Ticket, X, Zap } from "lucide-react";
import { Button, Chip, Input, ListBox, Select, Switch } from "@heroui/react";
import { NodeSettings, NodeState, ThemeMode } from "../../../types";
import { getRegionFlag } from "../../../utils/flags";
import { cn } from "../../../lib/utils";
import { TagInput } from "../../TagInput";
import { DatePicker } from "../../DatePicker";
import { BandwidthConfig } from "../../BandwidthConfig";
import { BILLING_CYCLE_OPTIONS, CURRENCY_OPTIONS } from "./billingOptions";

interface HostEditDialogProps {
  /** The row being configured. The dialog only mounts when this is set. */
  node: NodeState;
  theme?: ThemeMode;
  onClose: () => void;
  /** Fired after a successful save so the caller can refetch the node list. */
  onSaved?: () => void;
}

/**
 * Derives the editable draft from a live node.
 *
 * Nothing here invents a value the node never reported: an unconfigured host
 * opens with empty/zero fields so a save cannot silently pin a made-up price,
 * quota or traffic figure onto it. `bandwidth_used` is the operator's
 * calibration baseline (0 = 未校准，直接按网卡累计), not the currently displayed
 * usage, so reopening the dialog never re-pins the live counter.
 */
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
  const isBlueprint = theme === "blueprint";

  const [draft, setDraft] = useState<NodeSettings>(() => toDraft(node));
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isResolvingGeo, setIsResolvingGeo] = useState(false);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [showManualOverride, setShowManualOverride] = useState(false);

  const patch = (fields: Partial<NodeSettings>) => setDraft((prev) => ({ ...prev, ...fields }));

  const liveTotalBytes = (node.network.bytes_sent || 0) + (node.network.bytes_recv || 0);

  // The live node carries the *effective* usage (baseline + counted traffic), so
  // it cannot tell us what baseline the operator saved. Read the persisted row so
  // reopening the dialog shows the real calibration value instead of resetting it
  // to 0 — a save would otherwise silently clear a calibration nobody touched.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/nodes/${encodeURIComponent(node.node_id)}/settings`
        );
        if (!res.ok) return;
        const saved = await res.json();
        if (cancelled || !saved) return;
        setDraft((prev) => ({
          ...prev,
          public_ip: saved.public_ip || prev.public_ip,
          public_ipv6: saved.public_ipv6 || prev.public_ipv6,
          bandwidth_used: saved.bandwidth_used || 0,
        }));
      } catch {
        // Offline or transient failure: keep the draft derived from live state.
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

  const labelCls = cn("block mb-1 font-medium", isBlueprint ? "text-slate-700" : "text-zinc-300");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 lg:p-6 bg-black/75 backdrop-blur-sm animate-fade-in font-sans">
      <div
        className={cn(
          "relative flex flex-col w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-2xl border-0 sm:border shadow-2xl overflow-hidden transition-colors",
          isBlueprint
            ? "bg-white border-slate-200/90 text-slate-900 shadow-slate-300/60"
            : "bg-zinc-900 border-zinc-800 text-zinc-100 shadow-black/80"
        )}
      >
        {/* Dialog header */}
        <div
          className={cn(
            "flex items-center justify-between gap-2.5 sm:gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b shrink-0",
            isBlueprint ? "border-slate-200/80 bg-slate-50/70" : "border-zinc-800 bg-zinc-950/40"
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                isBlueprint
                  ? "bg-indigo-50 border-indigo-200/80 text-indigo-600"
                  : "bg-indigo-950/50 border-indigo-800/60 text-indigo-400"
              )}
            >
              <Sliders className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2
                className={cn(
                  "text-base font-bold tracking-tight truncate",
                  isBlueprint ? "text-slate-900" : "text-zinc-100"
                )}
              >
                配置主机：{draft.name || draft.node_id}
              </h2>
              <p className={cn("text-11 font-mono mt-0.5", isBlueprint ? "text-slate-500" : "text-zinc-500")}>
                {draft.node_id}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" isIconOnly type="button" onPress={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
          {geoNotice && (
            <div className="alert alert-success py-2.5 px-3.5 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{geoNotice}</span>
            </div>
          )}
          {geoError && (
            <div className="alert alert-danger py-2.5 px-3.5 text-xs flex items-center gap-2" role="alert">
              <X className="h-4 w-4 shrink-0" />
              <span>{geoError}</span>
            </div>
          )}

          {/* Auto-identified region & provider */}
          <div
            className={cn(
              "rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3",
              isBlueprint
                ? "bg-indigo-50/50 border-indigo-200 text-slate-800"
                : "bg-indigo-950/20 border-indigo-900/60 text-zinc-200"
            )}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 font-bold">
                <Globe className="h-4 w-4 text-sky-500 shrink-0" />
                <span className={isBlueprint ? "text-slate-700" : "text-zinc-300"}>归属地区:</span>
                <Chip variant="soft" color="accent" size="sm" className="gap-1 font-bold">
                  <span className="text-sm leading-none">{getRegionFlag(draft.region || "")}</span>
                  <span className="leading-none">{draft.region || "自动识别中"}</span>
                </Chip>
              </div>

              <div className="flex items-center gap-1.5 font-bold">
                <span className={isBlueprint ? "text-slate-700" : "text-zinc-300"}>服务商/线路:</span>
                <Chip color="success" variant="soft" size="sm" className="font-bold">
                  {draft.provider || "智能测定中..."}
                </Chip>
              </div>

              {draft.public_ip && (
                <span className={cn("text-11 font-mono", isBlueprint ? "text-slate-500" : "text-zinc-500")}>
                  (出口 IP: {draft.public_ip})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onPress={handleAutoResolveGeo}
                isDisabled={isResolvingGeo}
                className="gap-1 font-medium"
                aria-label="根据该节点公网 IP 自动重新解析国家地区与网络线路"
              >
                <Zap className={cn("h-3 w-3", isResolvingGeo && "animate-spin")} />
                <span>{isResolvingGeo ? "识别中..." : "重新识别"}</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                type="button"
                onPress={() => setShowManualOverride(!showManualOverride)}
                className="text-10 text-slate-500 dark:text-zinc-400"
              >
                {showManualOverride ? "收起手动覆盖" : "手动微调 ▾"}
              </Button>
            </div>
          </div>

          {/* Manual overrides, collapsed by default */}
          {showManualOverride && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 animate-fade-in">
              <div>
                <label className={labelCls} htmlFor="host-region-override">
                  强制指定地区 (覆盖自动识别)
                </label>
                <Input
                  id="host-region-override"
                  type="text"
                  value={draft.region || ""}
                  onChange={(e) => patch({ region: e.target.value })}
                  placeholder="如 HK, US, JP, SG 等"
                  className="w-full text-xs"
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="host-provider-override">
                  强制指定服务商/线路 (覆盖自动识别)
                </label>
                <Input
                  id="host-provider-override"
                  type="text"
                  value={draft.provider || ""}
                  onChange={(e) => patch({ provider: e.target.value })}
                  placeholder="如 BandwagonHost CN2 GIA, Oracle"
                  className="w-full text-xs"
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="host-public-ip">
                  公网 IPv4 (覆盖自动探测)
                </label>
                <Input
                  id="host-public-ip"
                  type="text"
                  value={draft.public_ip || ""}
                  onChange={(e) => patch({ public_ip: e.target.value })}
                  placeholder={node.system.public_ip || "留空则用 Agent 探测结果"}
                  className="w-full text-xs font-mono"
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="host-public-ipv6">
                  公网 IPv6 (覆盖自动探测)
                </label>
                <Input
                  id="host-public-ipv6"
                  type="text"
                  value={draft.public_ipv6 || ""}
                  onChange={(e) => patch({ public_ipv6: e.target.value })}
                  placeholder={node.system.public_ipv6 || "留空则用 Agent 探测结果"}
                  className="w-full text-xs font-mono"
                />
              </div>
              <p className={cn("sm:col-span-2 text-10", isBlueprint ? "text-slate-500" : "text-zinc-500")}>
                NAT/Docker 环境下 Agent 可能只看到内网地址。这两项一旦填写就以你填的为准，留空则回退到 Agent 探测值。
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="sm:col-span-2 md:col-span-1">
              <label className={labelCls} htmlFor="host-name">
                主机展示名称 (Name)
              </label>
              <Input
                id="host-name"
                type="text"
                value={draft.name || ""}
                onChange={(e) => patch({ name: e.target.value })}
                className="w-full text-xs"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="host-price">
                计费单价 (Price)
              </label>
              <Input
                id="host-price"
                type="number"
                step="0.01"
                value={draft.price}
                onChange={(e) => patch({ price: parseFloat(e.target.value) || 0 })}
                className="w-full font-mono text-xs font-bold"
              />
            </div>
            <div>
              <label className={labelCls}>货币单位 (Currency)</label>
              <Select
                selectedKey={draft.currency}
                onSelectionChange={(key) => patch({ currency: String(key) })}
                aria-label="货币单位"
                fullWidth
              >
                <Select.Trigger className="font-mono text-xs font-bold">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {CURRENCY_OPTIONS.map((o) => (
                      <ListBox.Item key={o.key} id={o.key} textValue={o.label}>
                        {o.label}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            <div>
              <label className={labelCls}>计费周期 (Billing Cycle)</label>
              <Select
                selectedKey={draft.billing_cycle}
                onSelectionChange={(key) => patch({ billing_cycle: String(key) })}
                aria-label="计费周期"
                fullWidth
              >
                <Select.Trigger className="text-xs font-semibold">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {BILLING_CYCLE_OPTIONS.map((o) => (
                      <ListBox.Item key={o.key} id={o.key} textValue={o.label}>
                        {o.label}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          </div>

          <div>
            <label className={cn(labelCls, "text-xs")}>服务到期时间 (Expiry Date)</label>
            <DatePicker
              value={draft.expiry_date || ""}
              onChange={(dateVal) => patch({ expiry_date: dateVal })}
              theme={theme}
            />
          </div>

          <div>
            <label className={cn(labelCls, "text-xs")}>流量配额与使用量设置 (Bandwidth Settings)</label>
            <BandwidthConfig
              quotaBytes={draft.bandwidth_quota}
              usedBytes={draft.bandwidth_used || 0}
              liveTotalBytes={liveTotalBytes}
              onChange={(newQuota, newUsed) =>
                patch({ bandwidth_quota: newQuota, bandwidth_used: newUsed })
              }
              theme={theme}
            />
          </div>

          <div>
            <label className={cn(labelCls, "text-xs")}>线路与特性标签 (Tags)</label>
            <TagInput
              tags={draft.tags || []}
              onChange={(newTags) => patch({ tags: newTags })}
              theme={theme}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={cn(labelCls, "text-xs mb-0 flex items-center gap-1.5")} htmlFor="host-note">
                <Ticket className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span>备注备忘 / 优惠折扣码 (Notes & Promo Code)</span>
              </label>
              <span className={cn("text-10", isBlueprint ? "text-slate-400" : "text-zinc-500")}>
                选填 · 支持随时修改
              </span>
            </div>
            <Input
              id="host-note"
              type="text"
              value={draft.note || ""}
              onChange={(e) => patch({ note: e.target.value })}
              placeholder="如：续费循环5折码 PROMO50 / 购买渠道 / 账号备忘"
              className="w-full text-xs font-mono"
            />
            <p className={cn("mt-1 text-[11px]", isBlueprint ? "text-slate-500" : "text-zinc-400")}>
              保存后会在主机卡片和详情页醒目标出，支持在卡片与详情页一键复制。
            </p>
          </div>

          <div className="pt-1">
            <Switch
              isSelected={draft.auto_renewal}
              onChange={(v) => patch({ auto_renewal: v })}
              size="sm"
              className="text-xs font-medium"
            >
              <Switch.Content className="gap-2">
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <span className={isBlueprint ? "text-slate-800" : "text-zinc-200"}>
                  开启到期自动续费 (Auto Renewal)
                </span>
              </Switch.Content>
            </Switch>
          </div>
        </div>

        {/* Sticky footer actions */}
        <div
          className={cn(
            "flex flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-6 sm:py-4 border-t shrink-0 text-xs",
            isBlueprint ? "border-slate-200/80 bg-slate-50/70" : "border-zinc-800 bg-zinc-950/40"
          )}
        >
          {saveError && (
            <span className="mr-auto text-rose-600 dark:text-rose-400 font-medium" role="alert">
              {saveError}
            </span>
          )}
          {saveSuccess && (
            <Chip color="success" variant="soft" size="sm" className="mr-auto flex items-center gap-1 font-medium">
              <Check className="h-3.5 w-3.5" /> 配置保存成功！
            </Chip>
          )}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onPress={onClose}
            className="text-slate-600 dark:text-zinc-400"
          >
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onPress={handleSave}
            isDisabled={isSaving}
            className="font-medium"
          >
            {isSaving ? "保存中..." : "保存主机设置"}
          </Button>
        </div>
      </div>
    </div>
  );
};

import React from "react";
import { Server, Sliders, Ticket, Trash2 } from "lucide-react";
import { Button } from "@heroui/react";
import { NodeState, ThemeMode } from "../../../types";
import { getRegionFlag } from "../../../utils/flags";
import { formatBytes } from "../../../utils/format";
import { cn } from "../../../lib/utils";
import { getCycleLabel } from "./billingOptions";

interface HostTableProps {
  nodes: NodeState[];
  theme?: ThemeMode;
  onEdit: (node: NodeState) => void;
  onDelete: (nodeID: string) => void;
}

/** Read-only roster of registered hosts in Nezha Industrial Engineering style. */
export const HostTable: React.FC<HostTableProps> = ({
  nodes,
  onEdit,
  onDelete,
}) => {
  return (
    <div
      className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] overflow-hidden font-mono"
    >
      {/* Table Top Header Bar */}
      <div
        className="px-4 py-3 border-b border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-xs font-bold text-[var(--nezha-ink)] flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-[var(--nezha-accent)]" />
          <span>[01.A] 已注册主机列表 HOST ROSTER ({nodes.length})</span>
        </div>
        <span className="text-11 font-mono text-[var(--nezha-ink-3)] font-normal">
          点击「配置」管理硬件标签、折算定价及流量基准
        </span>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead
            className="border-b border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]/80 text-[var(--nezha-ink-3)] text-11 font-bold uppercase tracking-wider"
          >
            <tr>
              <th className="py-3 px-4">[状态]</th>
              <th className="py-3 px-4">[主机名 / 标识]</th>
              <th className="py-3 px-4">[节点地区]</th>
              <th className="py-3 px-4">[系统 / IP]</th>
              <th className="py-3 px-4">[定价 / 周期]</th>
              <th className="py-3 px-4">[已用 / 配额]</th>
              <th className="py-3 px-4">[服务到期]</th>
              <th className="py-3 px-4 text-right pr-6">[操作]</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--nezha-line-soft)] text-[var(--nezha-ink)]">
            {nodes.map((n) => {
              const totalQuota = n.billing?.bandwidth_quota || 0;
              const totalUsed = n.billing?.bandwidth_used || 0;
              const percent =
                totalQuota > 0 ? Math.min(100, Math.round((totalUsed / totalQuota) * 100)) : 0;

              return (
                <tr
                  key={n.node_id}
                  className="transition-colors hover:bg-[var(--nezha-panel-sub)]/50"
                >
                  {/* Status */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {n.is_online ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-10 font-bold bg-[#141414] text-[#FBFBF9] dark:bg-[#ECECE6] dark:text-[#141414] border border-[#141414] dark:border-[#ECECE6] rounded-none">
                        ● 在线
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-10 font-bold bg-[var(--nezha-accent)] text-[#141414] border border-[var(--nezha-accent)] rounded-none">
                        ✕ 离线
                      </span>
                    )}
                  </td>

                  {/* Name & ID */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="font-bold text-xs text-[var(--nezha-ink)]">
                      {n.name}
                    </div>
                    <div className="text-11 font-mono text-[var(--nezha-ink-3)]">
                      {n.node_id}
                    </div>
                    {n.billing?.note && (
                      <div
                        className="mt-1 flex items-center gap-1 text-[11px] font-mono text-[var(--nezha-accent-ink)] dark:text-[var(--nezha-accent)] font-normal truncate max-w-[190px]"
                        title={`备注/折扣码: ${n.billing.note}`}
                      >
                        <Ticket className="h-3 w-3 shrink-0 text-[var(--nezha-accent)]" />
                        <span className="truncate">{n.billing.note}</span>
                      </div>
                    )}
                  </td>

                  {/* Region */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="text-base leading-none">{getRegionFlag(n.region)}</span>
                      <span className="leading-none text-xs text-[var(--nezha-ink)]">
                        {n.region}
                      </span>
                    </span>
                  </td>

                  {/* System & IP */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="text-xs text-[var(--nezha-ink)] font-medium">
                      {n.system.os || "Linux"}
                    </div>
                    <div className="text-11 font-mono text-[var(--nezha-ink-3)]">
                      {n.system.public_ip || "未上报"}
                    </div>
                  </td>

                  {/* Pricing / Cycle */}
                  <td className="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums">
                    <div className="font-bold text-xs text-[var(--nezha-accent-ink)] dark:text-[var(--nezha-accent)]">
                      {n.billing?.currency || "$"}
                      {n.billing?.price || n.billing?.price_per_month || 0}
                      <span className="text-11 font-normal text-[var(--nezha-ink-3)] ml-1">
                        / {getCycleLabel(n.billing?.billing_cycle)}
                      </span>
                    </div>
                  </td>

                  {/* Traffic Quota */}
                  <td className="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums">
                    <div className="text-xs font-bold text-[var(--nezha-ink)]">
                      {totalQuota > 0 ? `${percent}%` : "无限制"}
                    </div>
                    <div className="text-10 text-[var(--nezha-ink-3)]">
                      {totalQuota > 0 ? `${formatBytes(totalUsed)} / ${formatBytes(totalQuota)}` : formatBytes(totalUsed)}
                    </div>
                  </td>

                  {/* Expiry */}
                  <td className="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums">
                    <div className="font-medium text-xs text-[var(--nezha-ink)]">
                      {n.billing?.expiry_date ? `${n.billing?.remaining_days ?? 0} 天` : "--"}
                    </div>
                    <div className="text-10 text-[var(--nezha-ink-3)]">
                      {n.billing?.expiry_date || "未设到期"}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-right pr-6">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEdit(n)}
                        className="h-7 px-2.5 text-11 font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] hover:bg-[var(--nezha-panel)] text-[var(--nezha-ink)] transition-colors cursor-pointer flex items-center gap-1.5"
                        aria-label={`配置主机 ${n.name}`}
                      >
                        <Sliders className="h-3 w-3 text-[var(--nezha-accent)]" />
                        <span>配置</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(n.node_id)}
                        className="h-7 px-2.5 text-11 font-mono font-bold rounded-none border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer flex items-center gap-1.5"
                        aria-label={`删除主机 ${n.name}`}
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
                <td colSpan={8} className="py-12 text-center text-[var(--nezha-ink-3)] font-mono text-xs">
                  暂无主机接入，点击右上角「添加主机」获取一键部署命令
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Responsive Cards View */}
      <div className="block md:hidden divide-y divide-[var(--nezha-line-soft)]">
        {nodes.map((n) => {
          const totalQuota = n.billing?.bandwidth_quota || 0;
          const totalUsed = n.billing?.bandwidth_used || 0;
          const percent =
            totalQuota > 0 ? Math.min(100, Math.round((totalUsed / totalQuota) * 100)) : 0;

          return (
            <div
              key={n.node_id}
              className="p-3.5 space-y-2.5 bg-[var(--nezha-panel)] transition-colors font-mono"
            >
              {/* Row 1: Status, Flag, Host Name, and Actions */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {n.is_online ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-10 font-bold bg-[#141414] text-[#FBFBF9] dark:bg-[#ECECE6] dark:text-[#141414] border border-[#141414] dark:border-[#ECECE6] rounded-none shrink-0">
                      ● 在线
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-10 font-bold bg-[var(--nezha-accent)] text-[#141414] border border-[var(--nezha-accent)] rounded-none shrink-0">
                      ✕ 离线
                    </span>
                  )}
                  <span className="text-base leading-none shrink-0">{getRegionFlag(n.region)}</span>
                  <div className="font-bold text-xs truncate text-[var(--nezha-ink)]">
                    {n.name}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEdit(n)}
                    className="h-7 px-2.5 text-11 font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] flex items-center gap-1.5 cursor-pointer"
                    aria-label={`配置主机 ${n.name}`}
                  >
                    <Sliders className="h-3 w-3 text-[var(--nezha-accent)]" />
                    <span>配置</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(n.node_id)}
                    className="h-7 px-2.5 text-11 font-mono font-bold rounded-none border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 flex items-center gap-1.5 cursor-pointer"
                    aria-label={`删除主机 ${n.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>删除</span>
                  </button>
                </div>
              </div>

              {/* Row 2: Node ID, OS & IP */}
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-11 font-mono text-[var(--nezha-ink-3)]">
                <span>{n.node_id}</span>
                <span className="flex items-center gap-1.5 text-[var(--nezha-ink)]">
                  <span>{n.system.os || "Linux"}</span>
                  <span>·</span>
                  <span>{n.system.public_ip || "127.0.0.1"}</span>
                </span>
              </div>

              {/* Row 3: Pricing & Expiry */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--nezha-line-soft)] text-xs">
                <div className="p-2 border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]">
                  <span className="text-10 block text-[var(--nezha-ink-3)]">成本定价</span>
                  <span className="font-mono font-bold text-[var(--nezha-accent-ink)] dark:text-[var(--nezha-accent)]">
                    {n.billing?.currency || "$"}{n.billing?.price || n.billing?.price_per_month || 0}
                    <span className="text-10 font-normal opacity-80 text-[var(--nezha-ink-3)] ml-1">
                      / {getCycleLabel(n.billing?.billing_cycle)}
                    </span>
                  </span>
                </div>
                <div className="p-2 border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]">
                  <span className="text-10 block text-[var(--nezha-ink-3)]">到期剩余</span>
                  <span className="font-medium text-[var(--nezha-ink)]">
                    {n.billing?.expiry_date ? `${n.billing?.remaining_days ?? 0} 天后到期` : "未设到期"}
                  </span>
                </div>
              </div>

              {/* Note / Promo Code Banner on Mobile */}
              {n.billing?.note && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-11 font-mono border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-accent-ink)] dark:text-[var(--nezha-accent)]">
                  <Ticket className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-10 opacity-75 shrink-0 text-[var(--nezha-ink-3)]">备注/折扣:</span>
                  <span className="truncate">{n.billing.note}</span>
                </div>
              )}

              {/* Row 4: Bandwidth Quota Progress */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-10 font-mono text-[var(--nezha-ink-3)]">
                  <span>已用流量: {formatBytes(totalUsed)}</span>
                  <span className="font-bold text-[var(--nezha-ink)]">
                    {totalQuota > 0 ? `${percent}% / ${formatBytes(totalQuota)}` : "无限额度"}
                  </span>
                </div>
                {totalQuota > 0 && (
                  <div className="h-1.5 w-full rounded-none overflow-hidden bg-[var(--nezha-track)]">
                    <div
                      className={cn(
                        "h-full rounded-none transition-all duration-300",
                        percent > 90 ? "bg-rose-500" : percent > 75 ? "bg-amber-500" : "bg-[var(--nezha-accent)]"
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {nodes.length === 0 && (
          <div className="py-8 text-center text-xs text-[var(--nezha-ink-3)] font-mono">
            暂无主机接入，点击右上角「添加主机」获取一键部署命令
          </div>
        )}
      </div>
    </div>
  );
};

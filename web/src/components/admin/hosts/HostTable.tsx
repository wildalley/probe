import React from "react";
import { Server, Sliders, Ticket, Trash2 } from "lucide-react";
import { Button } from "@heroui/react";
import { NodeState } from "../../../types";
import { getRegionFlag } from "../../../utils/flags";
import { formatBytes } from "../../../utils/format";
import { cn } from "../../../lib/utils";
import { getCycleLabel } from "./billingOptions";

interface HostTableProps {
  nodes: NodeState[];
  theme?: "blueprint" | "dark";
  onEdit: (node: NodeState) => void;
  onDelete: (nodeID: string) => void;
}

const TB = 1024 * 1024 * 1024 * 1024;

/** Read-only roster of registered hosts. Editing happens in a dialog. */
export const HostTable: React.FC<HostTableProps> = ({
  nodes,
  theme = "dark",
  onEdit,
  onDelete,
}) => {
  const isBlueprint = theme === "blueprint";

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden",
        isBlueprint ? "bg-white border-slate-200/90 shadow-xs" : "bg-zinc-900/60 border-zinc-800"
      )}
    >
      <div
        className={cn(
          "px-5 py-3 border-b text-xs font-semibold flex flex-wrap items-center justify-between gap-2",
          isBlueprint
            ? "bg-slate-50/80 border-slate-200/80 text-slate-700"
            : "bg-zinc-900 border-zinc-800 text-zinc-300"
        )}
      >
        <span className="flex items-center gap-2">
          <Server className="h-4 w-4 text-indigo-500" />
          已注册主机列表 ({nodes.length})
        </span>
        <span className={cn("text-xs font-normal", isBlueprint ? "text-slate-500" : "text-zinc-400")}>
          点击「配置」修改计费、标签及流量配额
        </span>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead
            className={cn(
              "border-b text-xs font-semibold",
              isBlueprint
                ? "bg-slate-50/50 text-slate-600 border-slate-200/80"
                : "bg-zinc-950/80 text-zinc-400 border-zinc-800"
            )}
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
          <tbody className={cn("divide-y", isBlueprint ? "divide-slate-100" : "divide-zinc-800/60")}>
            {nodes.map((n) => {
              const totalQuota = n.billing?.bandwidth_quota || 0;
              // 服务端已把校准基线和累计流量合成好，这里不再自己拼网卡值。
              const totalUsed = n.billing?.bandwidth_used || 0;
              const percent =
                totalQuota > 0 ? Math.min(100, Math.round((totalUsed / totalQuota) * 100)) : 0;

              return (
                <tr
                  key={n.node_id}
                  className={cn(
                    "transition-colors",
                    isBlueprint ? "hover:bg-slate-50/70" : "hover:bg-zinc-800/30"
                  )}
                >
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-11 font-medium border",
                        n.is_online
                          ? isBlueprint
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                            : "bg-emerald-950/40 text-emerald-400 border-emerald-800/60"
                          : isBlueprint
                          ? "bg-rose-50 text-rose-700 border-rose-200/80"
                          : "bg-rose-950/40 text-rose-400 border-rose-800/60"
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          n.is_online ? "bg-emerald-500" : "bg-rose-500"
                        )}
                      />
                      {n.is_online ? "在线" : "离线"}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className={cn("font-semibold", isBlueprint ? "text-slate-900" : "text-zinc-100")}>
                      {n.name}
                    </div>
                    <div
                      className={cn("text-11 font-mono", isBlueprint ? "text-slate-400" : "text-zinc-500")}
                    >
                      {n.node_id}
                    </div>
                    {n.billing?.note && (
                      <div
                        className="mt-1 flex items-center gap-1 text-[11px] font-mono text-amber-600 dark:text-amber-400 font-normal truncate max-w-[190px]"
                        title={`备注/折扣码: ${n.billing.note}`}
                      >
                        <Ticket className="h-3 w-3 shrink-0 text-amber-500" />
                        <span className="truncate">{n.billing.note}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="text-base leading-none">{getRegionFlag(n.region)}</span>
                      <span className={cn("leading-none", isBlueprint ? "text-slate-800" : "text-zinc-200")}>
                        {n.region}
                      </span>
                    </span>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className={isBlueprint ? "text-slate-800 font-medium" : "text-zinc-200"}>
                      {n.system.os || "Linux"}
                    </div>
                    <div
                      className={cn("text-11 font-mono", isBlueprint ? "text-slate-400" : "text-zinc-500")}
                    >
                      {n.system.public_ip || "未上报"}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap font-mono">
                    <div className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {n.billing?.currency || "$"}
                      {n.billing?.price || n.billing?.price_per_month || 0}
                      <span
                        className={cn(
                          "text-11 font-normal",
                          isBlueprint ? "text-slate-500" : "text-zinc-400"
                        )}
                      >
                        {" "}
                        / {getCycleLabel(n.billing?.billing_cycle)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap font-mono">
                    <div
                      className={cn(
                        "text-xs font-semibold",
                        isBlueprint ? "text-slate-800" : "text-zinc-200"
                      )}
                    >
                      {totalQuota > 0 ? `${percent}%` : "无限制"}
                    </div>
                    <div className={cn("text-10", isBlueprint ? "text-slate-400" : "text-zinc-500")}>
                      {totalQuota > 0 ? formatBytes(totalQuota) : "无限"}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className={cn("font-medium", isBlueprint ? "text-slate-800" : "text-zinc-200")}>
                      {n.billing?.expiry_date ? `${n.billing?.remaining_days ?? 0} 天` : "--"}
                    </div>
                    <div
                      className={cn("text-10 font-mono", isBlueprint ? "text-slate-400" : "text-zinc-500")}
                    >
                      {n.billing?.expiry_date || "未设到期"}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap text-right pr-6">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => onEdit(n)}
                        className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-zinc-400 dark:hover:text-indigo-400 dark:hover:bg-indigo-950/40 gap-1"
                        aria-label={`配置主机 ${n.name}`}
                      >
                        <Sliders className="h-3 w-3" />
                        <span>配置</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => onDelete(n.node_id)}
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 gap-1"
                        aria-label={`删除主机 ${n.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>删除</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {nodes.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">
                  暂无主机，点击右上角「添加主机」获取一键部署命令
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Responsive Cards View */}
      <div className="block md:hidden divide-y divide-slate-100 dark:divide-zinc-800/60">
        {nodes.map((n) => {
          const totalQuota = n.billing?.bandwidth_quota || 0;
          const totalUsed = n.billing?.bandwidth_used || 0;
          const percent =
            totalQuota > 0 ? Math.min(100, Math.round((totalUsed / totalQuota) * 100)) : 0;

          return (
            <div
              key={n.node_id}
              className={cn(
                "p-3.5 space-y-2.5 transition-colors",
                isBlueprint ? "bg-white hover:bg-slate-50/50" : "bg-zinc-900/40 hover:bg-zinc-900/70"
              )}
            >
              {/* Row 1: Status, Flag, Host Name, and Actions */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-10 font-medium border shrink-0",
                      n.is_online
                        ? isBlueprint
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                          : "bg-emerald-950/40 text-emerald-400 border-emerald-800/60"
                        : isBlueprint
                        ? "bg-rose-50 text-rose-700 border-rose-200/80"
                        : "bg-rose-950/40 text-rose-400 border-rose-800/60"
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        n.is_online ? "bg-emerald-500" : "bg-rose-500"
                      )}
                    />
                    {n.is_online ? "在线" : "离线"}
                  </span>
                  <span className="text-base leading-none shrink-0">{getRegionFlag(n.region)}</span>
                  <div className={cn("font-bold text-xs truncate", isBlueprint ? "text-slate-900" : "text-zinc-100")}>
                    {n.name}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => onEdit(n)}
                    className="h-7 px-2 text-xs font-sans gap-1 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60"
                    aria-label={`配置主机 ${n.name}`}
                  >
                    <Sliders className="h-3 w-3" />
                    <span>配置</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => onDelete(n.node_id)}
                    className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40"
                    aria-label={`删除主机 ${n.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Row 2: Node ID, OS & IP */}
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-11 font-mono">
                <span className={cn(isBlueprint ? "text-slate-500" : "text-zinc-500")}>
                  {n.node_id}
                </span>
                <span className={cn("flex items-center gap-1.5", isBlueprint ? "text-slate-600" : "text-zinc-400")}>
                  <span>{n.system.os || "Linux"}</span>
                  <span>·</span>
                  <span>{n.system.public_ip || "127.0.0.1"}</span>
                </span>
              </div>

              {/* Row 3: Pricing & Expiry */}
              <div className={cn(
                "grid grid-cols-2 gap-2 pt-2 border-t text-xs",
                isBlueprint ? "border-slate-100" : "border-zinc-800/60"
              )}>
                <div>
                  <span className={cn("text-10 block", isBlueprint ? "text-slate-400" : "text-zinc-500")}>成本定价</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    {n.billing?.currency || "$"}{n.billing?.price || n.billing?.price_per_month || 0}
                    <span className="text-10 font-normal opacity-80"> / {getCycleLabel(n.billing?.billing_cycle)}</span>
                  </span>
                </div>
                <div>
                  <span className={cn("text-10 block", isBlueprint ? "text-slate-400" : "text-zinc-500")}>到期剩余</span>
                  <span className={cn("font-medium", isBlueprint ? "text-slate-700" : "text-zinc-300")}>
                    {n.billing?.expiry_date ? `${n.billing?.remaining_days ?? 0} 天后到期` : "未设到期"}
                  </span>
                </div>
              </div>

              {/* Note / Promo Code Banner on Mobile */}
              {n.billing?.note && (
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-11 font-mono border",
                    isBlueprint
                      ? "bg-amber-50/80 border-amber-200/80 text-amber-800"
                      : "bg-amber-950/30 border-amber-800/40 text-amber-300"
                  )}
                >
                  <Ticket className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="font-sans font-medium text-[10px] opacity-75 shrink-0">备注/折扣:</span>
                  <span className="truncate">{n.billing.note}</span>
                </div>
              )}

              {/* Row 4: Bandwidth Quota Progress */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-10 font-mono">
                  <span className={cn(isBlueprint ? "text-slate-400" : "text-zinc-500")}>
                    已用流量: {formatBytes(totalUsed)}
                  </span>
                  <span className={cn("font-semibold", isBlueprint ? "text-slate-600" : "text-zinc-300")}>
                    {totalQuota > 0 ? `${percent}% / ${formatBytes(totalQuota)}` : "无限额度"}
                  </span>
                </div>
                {totalQuota > 0 && (
                  <div className={cn("h-1.5 w-full rounded-full overflow-hidden", isBlueprint ? "bg-slate-200/80" : "bg-zinc-800")}>
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        percent > 90 ? "bg-rose-500" : percent > 75 ? "bg-amber-500" : "bg-indigo-500"
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
          <div className="py-8 text-center text-xs text-slate-400">
            暂无主机，点击右上角「添加主机」获取一键部署命令
          </div>
        )}
      </div>
    </div>
  );
};

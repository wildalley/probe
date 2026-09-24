import React, { useState } from "react";
import { RefreshCw, Infinity as InfinityIcon, XCircle } from "lucide-react";
import { Input, ListBox, Select } from "@heroui/react";
import { ThemeMode } from "../types";
import { formatBytes } from "../utils/format";
import { cn } from "../lib/utils";

interface BandwidthConfigProps {
  quotaBytes: number;
  usedBytes: number;
  liveTotalBytes?: number;
  onChange: (quotaBytes: number, usedBytes: number) => void;
  theme?: ThemeMode;
}

type Unit = "MB" | "GB" | "TB";

const UNIT_MULTIPLIERS: Record<Unit, number> = {
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
};

const getBestUnit = (bytes: number): { value: number; unit: Unit } => {
  if (bytes <= 0) return { value: 0, unit: "GB" };
  if (bytes >= 1024 * 1024 * 1024 * 1024) {
    return { value: Math.round((bytes / UNIT_MULTIPLIERS.TB) * 100) / 100, unit: "TB" };
  }
  if (bytes >= 1024 * 1024 * 1024) {
    return { value: Math.round((bytes / UNIT_MULTIPLIERS.GB) * 100) / 100, unit: "GB" };
  }
  return { value: Math.round((bytes / UNIT_MULTIPLIERS.MB) * 100) / 100, unit: "MB" };
};

export const BandwidthConfig: React.FC<BandwidthConfigProps> = ({
  quotaBytes,
  usedBytes,
  liveTotalBytes = 0,
  onChange,
  theme = "dark",
}) => {
  const isBlueprint = theme === "blueprint";

  const isUnlimited = quotaBytes <= 0;

  // Quota state. No prefill: an unset quota means unlimited, and inventing a
  // 2TB default here made every unconfigured host look like it had one.
  const initialQuota = getBestUnit(quotaBytes);
  const [quotaVal, setQuotaVal] = useState<number>(initialQuota.value);
  const [quotaUnit, setQuotaUnit] = useState<Unit>(initialQuota.unit);

  // Calibration baseline. This is the number the operator reads off their
  // provider's panel; the server counts real traffic on top of it from the
  // moment it is saved. Empty (0) means "no calibration, count from the
  // interface counter", so it must not be seeded from the live counter.
  const initialUsed = getBestUnit(usedBytes);
  const [usedVal, setUsedVal] = useState<number>(initialUsed.value);
  const [usedUnit, setUsedUnit] = useState<Unit>(initialUsed.unit);

  // Sync to parent whenever values change
  const handleQuotaChange = (newVal: number, newUnit: Unit, unlimited: boolean) => {
    setQuotaVal(newVal);
    setQuotaUnit(newUnit);
    const calculatedQuota = unlimited ? 0 : Math.round(newVal * UNIT_MULTIPLIERS[newUnit]);
    const calculatedUsed = Math.round(usedVal * UNIT_MULTIPLIERS[usedUnit]);
    onChange(calculatedQuota, calculatedUsed);
  };

  const handleUsedChange = (newVal: number, newUnit: Unit) => {
    setUsedVal(newVal);
    setUsedUnit(newUnit);
    const calculatedQuota = isUnlimited ? 0 : Math.round(quotaVal * UNIT_MULTIPLIERS[quotaUnit]);
    const calculatedUsed = Math.round(newVal * UNIT_MULTIPLIERS[newUnit]);
    onChange(calculatedQuota, calculatedUsed);
  };

  const handleUnitSwitchQuota = (targetUnit: Unit) => {
    const bytes = quotaVal * UNIT_MULTIPLIERS[quotaUnit];
    const converted = Math.round((bytes / UNIT_MULTIPLIERS[targetUnit]) * 100) / 100;
    handleQuotaChange(converted, targetUnit, isUnlimited);
  };

  const handleUnitSwitchUsed = (targetUnit: Unit) => {
    const bytes = usedVal * UNIT_MULTIPLIERS[usedUnit];
    const converted = Math.round((bytes / UNIT_MULTIPLIERS[targetUnit]) * 100) / 100;
    handleUsedChange(converted, targetUnit);
  };

  const handleSyncLive = () => {
    const best = getBestUnit(liveTotalBytes);
    handleUsedChange(best.value, best.unit);
  };

  // Stats calculation
  const totalCalcQuota = isUnlimited ? 0 : quotaVal * UNIT_MULTIPLIERS[quotaUnit];
  const totalCalcUsed = usedVal * UNIT_MULTIPLIERS[usedUnit];
  const percentUsed = totalCalcQuota > 0 ? Math.min(100, Math.round((totalCalcUsed / totalCalcQuota) * 1000) / 10) : 0;
  const remainingBytes = Math.max(0, totalCalcQuota - totalCalcUsed);

  return (
    <div className="space-y-3 font-mono text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 1. 流量总额配置 */}
        <div
          className={`p-3 rounded-xl border ${
            isBlueprint ? "bg-white border-slate-200" : "bg-zinc-950/70 border-zinc-800"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`font-semibold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
              流量总配额 (Quota)
            </span>
            <button
              type="button"
              onClick={() => handleQuotaChange(quotaVal > 0 ? quotaVal : 2, quotaUnit, !isUnlimited)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-11 font-semibold transition-all cursor-pointer select-none active:scale-95 border",
                isUnlimited
                  ? isBlueprint
                    ? "bg-indigo-50 text-indigo-600 border-indigo-200 shadow-xs hover:bg-indigo-100"
                    : "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/30"
                  : isBlueprint
                  ? "bg-slate-100/90 text-slate-600 border-slate-200 hover:bg-slate-200/80 hover:text-slate-800"
                  : "bg-zinc-900 text-zinc-400 border-zinc-700/60 hover:bg-zinc-800 hover:text-zinc-200"
              )}
              title={isUnlimited ? "点击关闭无限制并设置具体配额" : "点击开启无限制流量"}
            >
              <InfinityIcon className={cn("h-3.5 w-3.5", isUnlimited ? "text-indigo-500" : isBlueprint ? "text-slate-400" : "text-zinc-500")} />
              <span>无限制</span>
              <span
                className={cn(
                  "px-1 py-0.2 rounded text-9 uppercase font-bold",
                  isUnlimited
                    ? isBlueprint
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-indigo-500/30 text-indigo-200"
                    : isBlueprint
                    ? "bg-slate-200 text-slate-500"
                    : "bg-zinc-800 text-zinc-500"
                )}
              >
                {isUnlimited ? "ON" : "OFF"}
              </span>
            </button>
          </div>

          {!isUnlimited ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min="0"
                step="any"
                value={quotaVal || ""}
                onChange={(e) => handleQuotaChange(parseFloat(e.target.value) || 0, quotaUnit, false)}
                placeholder="2"
                aria-label="流量总配额数值"
                className="flex-1 font-mono font-bold"
              />
              <Select
                selectedKey={quotaUnit}
                onSelectionChange={(key) => handleUnitSwitchQuota(key as Unit)}
                aria-label="流量总配额单位"
              >
                <Select.Trigger className={cn(
                  "font-mono font-bold text-xs h-9 px-2.5 rounded-xl border transition-all cursor-pointer",
                  isBlueprint
                    ? "bg-white border-slate-200 hover:border-slate-300 text-slate-800 shadow-xs"
                    : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-100"
                )}>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover className={cn(
                  "p-1 rounded-xl border shadow-xl z-[70] min-w-[72px] animate-fade-in",
                  isBlueprint
                    ? "bg-white border-slate-200 text-slate-800 shadow-slate-200/80"
                    : "bg-zinc-900 border-zinc-700 text-zinc-100 shadow-black/80"
                )}>
                  <ListBox>
                    {(["TB", "GB", "MB"] as const).map((u) => (
                      <ListBox.Item
                        key={u}
                        id={u}
                        className={cn(
                          "px-2.5 py-1.5 text-xs font-mono font-medium rounded-lg cursor-pointer transition-colors",
                          isBlueprint
                            ? "hover:bg-slate-100 text-slate-800 data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-600 data-[selected=true]:font-bold"
                            : "hover:bg-zinc-800 text-zinc-200 data-[selected=true]:bg-indigo-500/20 data-[selected=true]:text-indigo-300 data-[selected=true]:font-bold"
                        )}
                      >
                        {u}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          ) : (
            <div className={`py-2 px-3 rounded-xl border flex items-center justify-between gap-2 ${
              isBlueprint ? "bg-indigo-50/40 border-indigo-100 text-slate-700" : "bg-indigo-950/20 border-indigo-900/40 text-zinc-300"
            }`}>
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg shrink-0 ${
                  isBlueprint ? "bg-indigo-100 text-indigo-600" : "bg-indigo-500/20 text-indigo-400"
                }`}>
                  <InfinityIcon className="h-4 w-4" />
                </div>
                <div>
                  <div className={`font-semibold text-xs ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                    无限流量模式
                  </div>
                  <div className={`text-10 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                    不限制服务器月度流量总额
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleQuotaChange(quotaVal > 0 ? quotaVal : 2, quotaUnit, false)}
                className={`px-2.5 py-1 rounded-lg text-11 font-semibold border transition-all cursor-pointer shrink-0 active:scale-95 ${
                  isBlueprint
                    ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs"
                    : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700"
                }`}
              >
                自定义配额
              </button>
            </div>
          )}
        </div>

        {/* 2. 已用流量配置 / 校准 */}
        <div
          className={`p-3 rounded-xl border ${
            isBlueprint ? "bg-white border-slate-200" : "bg-zinc-950/70 border-zinc-800"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`font-semibold ${isBlueprint ? "text-slate-800" : "text-zinc-200"}`}>
              已用流量校准基线
            </span>
            <div className="flex items-center gap-2">
              {totalCalcUsed > 0 && (
                <button
                  type="button"
                  onClick={() => handleUsedChange(0, usedUnit)}
                  className={cn(
                    "flex items-center gap-1 text-11 transition-all cursor-pointer active:scale-95",
                    isBlueprint ? "text-slate-500 hover:text-slate-800" : "text-zinc-500 hover:text-zinc-200"
                  )}
                  title="清空基线，改为直接按网卡累计值统计"
                >
                  <XCircle className="h-3 w-3" />
                  <span>取消校准</span>
                </button>
              )}
              {liveTotalBytes > 0 && (
                <button
                  type="button"
                  onClick={handleSyncLive}
                  className="flex items-center gap-1 text-11 text-indigo-500 hover:text-indigo-400 transition-all cursor-pointer active:scale-95"
                  title={`填入当前网卡累计值: ${formatBytes(liveTotalBytes)}`}
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>填入网卡值</span>
                </button>
              )}
            </div>
          </div>

          <div className={`text-10 mb-2 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
            填入服务商面板上的已用量，保存后服务端会在此基线上继续累计真实流量。
            {liveTotalBytes > 0 && (
              <span className="ml-1">
                当前网卡累计 <strong className={isBlueprint ? "text-slate-700" : "text-zinc-300"}>{formatBytes(liveTotalBytes)}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min="0"
              step="any"
              value={usedVal || ""}
              onChange={(e) => handleUsedChange(parseFloat(e.target.value) || 0, usedUnit)}
              placeholder="0"
              aria-label="已用流量数值"
              className="flex-1 font-mono font-bold"
            />
            <Select
              selectedKey={usedUnit}
              onSelectionChange={(key) => handleUnitSwitchUsed(key as Unit)}
              aria-label="已用流量单位"
            >
              <Select.Trigger className={cn(
                "font-mono font-bold text-xs h-9 px-2.5 rounded-xl border transition-all cursor-pointer",
                isBlueprint
                  ? "bg-white border-slate-200 hover:border-slate-300 text-slate-800 shadow-xs"
                  : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-100"
              )}>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover className={cn(
                "p-1 rounded-xl border shadow-xl z-[70] min-w-[72px] animate-fade-in",
                isBlueprint
                  ? "bg-white border-slate-200 text-slate-800 shadow-slate-200/80"
                  : "bg-zinc-900 border-zinc-700 text-zinc-100 shadow-black/80"
              )}>
                <ListBox>
                  {(["GB", "TB", "MB"] as const).map((u) => (
                    <ListBox.Item
                      key={u}
                      id={u}
                      className={cn(
                        "px-2.5 py-1.5 text-xs font-mono font-medium rounded-lg cursor-pointer transition-colors",
                        isBlueprint
                          ? "hover:bg-slate-100 text-slate-800 data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-600 data-[selected=true]:font-bold"
                          : "hover:bg-zinc-800 text-zinc-200 data-[selected=true]:bg-indigo-500/20 data-[selected=true]:text-indigo-300 data-[selected=true]:font-bold"
                      )}
                    >
                      {u}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
        </div>
      </div>

      {/* Real-time preview & progress bar */}
      {!isUnlimited && totalCalcQuota > 0 && (
        <div
          className={`p-3 rounded-xl border ${
            isBlueprint ? "bg-slate-50/80 border-slate-200" : "bg-zinc-900/50 border-zinc-800/80"
          }`}
        >
          <div className="flex items-center justify-between text-11 mb-1.5">
            <span className={isBlueprint ? "text-slate-600" : "text-zinc-400"}>
              用量进度: <strong className={isBlueprint ? "text-slate-900" : "text-zinc-100"}>{formatBytes(totalCalcUsed)}</strong> / {formatBytes(totalCalcQuota)}
            </span>
            <span className={`font-bold ${percentUsed >= 90 ? "text-rose-500" : percentUsed >= 70 ? "text-amber-500" : "text-indigo-500"}`}>
              {percentUsed}% · 剩余 {formatBytes(remainingBytes)}
            </span>
          </div>
          <div className={`h-2 w-full rounded-full overflow-hidden ${isBlueprint ? "bg-slate-200" : "bg-zinc-800"}`}>
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                percentUsed >= 90
                  ? "bg-rose-500"
                  : percentUsed >= 70
                  ? "bg-amber-500"
                  : "bg-indigo-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, percentUsed))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

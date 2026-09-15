import React, { useState } from "react";
import { RefreshCw, Infinity as InfinityIcon } from "lucide-react";
import { formatBytes } from "../utils/format";

interface BandwidthConfigProps {
  quotaBytes: number;
  usedBytes: number;
  liveTotalBytes?: number;
  onChange: (quotaBytes: number, usedBytes: number) => void;
  theme?: "blueprint" | "dark";
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

  // Quota state
  const initialQuota = getBestUnit(quotaBytes > 0 ? quotaBytes : 2 * UNIT_MULTIPLIERS.TB);
  const [quotaVal, setQuotaVal] = useState<number>(initialQuota.value);
  const [quotaUnit, setQuotaUnit] = useState<Unit>(initialQuota.unit);

  // Used state
  const currentUsedBytes = usedBytes > 0 ? usedBytes : liveTotalBytes;
  const initialUsed = getBestUnit(currentUsedBytes);
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
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isUnlimited}
                onChange={(e) => handleQuotaChange(quotaVal, quotaUnit, e.target.checked)}
                className="checkbox checkbox-primary checkbox-xs rounded"
              />
              <span className={`text-11 ${isUnlimited ? "text-primary font-bold" : isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                无限制
              </span>
            </label>
          </div>

          {!isUnlimited ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                step="any"
                value={quotaVal || ""}
                onChange={(e) => handleQuotaChange(parseFloat(e.target.value) || 0, quotaUnit, false)}
                placeholder="2"
                className="input input-bordered input-sm flex-1 font-mono font-bold"
              />
              <select
                value={quotaUnit}
                onChange={(e) => handleUnitSwitchQuota(e.target.value as Unit)}
                className="select select-bordered select-sm font-mono font-bold cursor-pointer"
              >
                <option value="TB">TB</option>
                <option value="GB">GB</option>
                <option value="MB">MB</option>
              </select>
            </div>
          ) : (
            <div className={`py-1.5 px-3 rounded-lg border text-center font-bold flex items-center justify-center gap-1.5 ${
              isBlueprint ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-zinc-900 border-zinc-800 text-zinc-400"
            }`}>
              <InfinityIcon className="h-4 w-4 text-indigo-500" />
              <span>无限流量 (不限制用量)</span>
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
              已用流量 (Used)
            </span>
            {liveTotalBytes > 0 && (
              <button
                type="button"
                onClick={handleSyncLive}
                className="flex items-center gap-1 text-11 text-indigo-500 hover:text-indigo-400 transition-all cursor-pointer active:scale-95"
                title={`同步实时网卡流量: ${formatBytes(liveTotalBytes)}`}
              >
                <RefreshCw className="h-3 w-3" />
                <span>同步实时网卡</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="0"
              step="any"
              value={usedVal || ""}
              onChange={(e) => handleUsedChange(parseFloat(e.target.value) || 0, usedUnit)}
              placeholder="0"
              className="input input-bordered input-sm flex-1 font-mono font-bold"
            />
            <select
              value={usedUnit}
              onChange={(e) => handleUnitSwitchUsed(e.target.value as Unit)}
              className="select select-bordered select-sm font-mono font-bold cursor-pointer"
            >
              <option value="GB">GB</option>
              <option value="TB">TB</option>
              <option value="MB">MB</option>
            </select>
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

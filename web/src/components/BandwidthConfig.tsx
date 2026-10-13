import React, { useRef, useState } from "react";
import { Infinity as InfinityIcon, RefreshCw, XCircle } from "lucide-react";
import { ThemeMode } from "../types";
import { formatBytes } from "../utils/format";
import type { TrafficSplit } from "../utils/traffic";
import { cn } from "../lib/utils";
import { BlueprintSelect, SelectOption } from "./ui/BlueprintSelect";

interface BandwidthConfigProps {
  quotaBytes: number;
  usedBytes: number;
  liveTotalBytes?: number;
  liveSplit?: TrafficSplit | null;
  onChange: (quotaBytes: number, usedBytes: number) => void;
  theme?: ThemeMode;
}

type Unit = "MB" | "GB" | "TB";

const QUOTA_UNIT_OPTIONS: SelectOption[] = [
  { key: "TB", label: "TB" },
  { key: "GB", label: "GB" },
  { key: "MB", label: "MB" },
];

const USED_UNIT_OPTIONS: SelectOption[] = [
  { key: "GB", label: "GB" },
  { key: "TB", label: "TB" },
  { key: "MB", label: "MB" },
];

const UNIT_MULTIPLIERS: Record<Unit, number> = {
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
};

const getBestUnit = (bytes: number): { value: number; unit: Unit } => {
  if (bytes <= 0) return { value: 0, unit: "GB" };
  if (bytes >= 1024 * 1024 * 1024 * 1024) {
    return { value: Number((bytes / UNIT_MULTIPLIERS.TB).toPrecision(12)), unit: "TB" };
  }
  if (bytes >= 1024 * 1024 * 1024) {
    return { value: Number((bytes / UNIT_MULTIPLIERS.GB).toPrecision(12)), unit: "GB" };
  }
  return { value: Number((bytes / UNIT_MULTIPLIERS.MB).toPrecision(12)), unit: "MB" };
};

export const BandwidthConfig: React.FC<BandwidthConfigProps> = ({
  quotaBytes,
  usedBytes,
  liveTotalBytes = 0,
  liveSplit = null,
  onChange,
}) => {
  const isUnlimited = quotaBytes <= 0;

  const initialQuota = getBestUnit(quotaBytes);
  const [quotaVal, setQuotaVal] = useState<number>(initialQuota.value);
  const [quotaUnit, setQuotaUnit] = useState<Unit>(initialQuota.unit);

  const initialUsed = getBestUnit(usedBytes);
  const [usedVal, setUsedVal] = useState<number>(initialUsed.value);
  const [usedUnit, setUsedUnit] = useState<Unit>(initialUsed.unit);
  const usedBytesRef = useRef(usedBytes);

  // Sync to parent whenever values change
  const handleQuotaChange = (newVal: number, newUnit: Unit, unlimited: boolean) => {
    setQuotaVal(newVal);
    setQuotaUnit(newUnit);
    const calculatedQuota = unlimited ? 0 : Math.round(newVal * UNIT_MULTIPLIERS[newUnit]);
    onChange(calculatedQuota, usedBytesRef.current);
  };

  const handleUsedChange = (newVal: number, newUnit: Unit) => {
    setUsedVal(newVal);
    setUsedUnit(newUnit);
    const calculatedQuota = isUnlimited ? 0 : Math.round(quotaVal * UNIT_MULTIPLIERS[quotaUnit]);
    const calculatedUsed = Math.round(newVal * UNIT_MULTIPLIERS[newUnit]);
    usedBytesRef.current = calculatedUsed;
    onChange(calculatedQuota, calculatedUsed);
  };

  const handleUnitSwitchQuota = (targetUnit: Unit) => {
    const bytes = quotaVal * UNIT_MULTIPLIERS[quotaUnit];
    const converted = Math.round((bytes / UNIT_MULTIPLIERS[targetUnit]) * 100) / 100;
    handleQuotaChange(converted, targetUnit, isUnlimited);
  };

  const handleUnitSwitchUsed = (targetUnit: Unit) => {
    const converted = Number((usedBytesRef.current / UNIT_MULTIPLIERS[targetUnit]).toPrecision(12));
    setUsedVal(converted);
    setUsedUnit(targetUnit);
  };

  const handleSyncLive = () => {
    const best = getBestUnit(liveTotalBytes);
    setUsedVal(best.value);
    setUsedUnit(best.unit);
    usedBytesRef.current = liveTotalBytes;
    const calculatedQuota = isUnlimited ? 0 : Math.round(quotaVal * UNIT_MULTIPLIERS[quotaUnit]);
    onChange(calculatedQuota, liveTotalBytes);
  };

  // Stats calculation
  const totalCalcQuota = isUnlimited ? 0 : quotaVal * UNIT_MULTIPLIERS[quotaUnit];
  const totalCalcUsed = usedBytesRef.current;
  const percentUsed = totalCalcQuota > 0 ? Math.min(100, Math.round((totalCalcUsed / totalCalcQuota) * 1000) / 10) : 0;
  const remainingBytes = Math.max(0, totalCalcQuota - totalCalcUsed);

  return (
    <div className="space-y-3 font-mono text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 1. 流量总额配置 */}
        <div className="p-3 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-[var(--nezha-ink)]">
              流量总配额 (Quota)
            </span>
            <button
              type="button"
              onClick={() => handleQuotaChange(quotaVal > 0 ? quotaVal : 2, quotaUnit, !isUnlimited)}
              className="h-7 px-2.5 text-11 font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] cursor-pointer flex items-center gap-1.5 transition-colors"
              title={isUnlimited ? "点击关闭无限制并设置具体配额" : "点击开启无限制流量"}
            >
              <InfinityIcon className={cn("h-3.5 w-3.5", isUnlimited ? "text-[var(--nezha-accent)]" : "text-[var(--nezha-ink-3)]")} />
              <span>无限制</span>
              <span
                className={cn(
                  "px-1 py-0.2 rounded-none text-9 font-bold",
                  isUnlimited
                    ? "bg-[var(--nezha-accent)] text-[#141414]"
                    : "bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink-3)] border border-[var(--nezha-line)]"
                )}
              >
                {isUnlimited ? "ON" : "OFF"}
              </span>
            </button>
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
                aria-label="流量总配额数值"
                className="w-full h-8 px-2.5 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] focus:border-[var(--nezha-accent)] focus:outline-none"
              />
              <BlueprintSelect
                value={quotaUnit}
                options={QUOTA_UNIT_OPTIONS}
                onChange={(val) => handleUnitSwitchQuota(val as Unit)}
                aria-label="流量总配额单位"
                align="right"
                className="w-20 shrink-0"
              />
            </div>
          ) : (
            <div className="h-8 px-3 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <InfinityIcon className="h-3.5 w-3.5 text-[var(--nezha-accent)]" />
                <span className="font-bold text-xs text-[var(--nezha-ink)]">无限流量模式</span>
                <span className="text-10 text-[var(--nezha-ink-3)]">(不限制服务器月度流量总额)</span>
              </div>
              <button
                type="button"
                onClick={() => handleQuotaChange(quotaVal > 0 ? quotaVal : 2, quotaUnit, false)}
                className="h-6 px-2 text-11 font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] hover:border-[var(--nezha-ink)] cursor-pointer"
              >
                自定义配额
              </button>
            </div>
          )}
        </div>

        {/* 2. 已用流量配置 / 校准 */}
        <div className="p-3 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-[var(--nezha-ink)]">
              已用流量校准基线
            </span>
            <div className="flex items-center gap-1.5">
              {totalCalcUsed > 0 && (
                <button
                  type="button"
                  onClick={() => handleUsedChange(0, usedUnit)}
                  className="h-6 px-2 text-11 font-mono font-bold rounded-none border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 cursor-pointer flex items-center gap-1"
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
                  className="h-6 px-2 text-11 font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] cursor-pointer flex items-center gap-1"
                  title={`填入当前网卡累计值: ${formatBytes(liveTotalBytes)}`}
                >
                  <RefreshCw className="h-3 w-3 text-[var(--nezha-accent)]" />
                  <span>填入网卡值</span>
                </button>
              )}
            </div>
          </div>

          <div className="text-10 text-[var(--nezha-ink-3)] mb-2">
            填入服务商面板上的已用量，保存后服务端会在此基线上继续累计。
            {liveTotalBytes > 0 && (
              <span className="ml-1 text-[var(--nezha-ink)] font-bold">
                当前网卡累计 {formatBytes(liveTotalBytes)}
                {liveSplit && (
                  <span className="ml-1 opacity-80">
                    (↑{formatBytes(liveSplit.up)} ↓{formatBytes(liveSplit.down)})
                  </span>
                )}
              </span>
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
              aria-label="已用流量数值"
              className="w-full h-8 px-2.5 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] focus:border-[var(--nezha-accent)] focus:outline-none"
            />
            <BlueprintSelect
              value={usedUnit}
              options={USED_UNIT_OPTIONS}
              onChange={(val) => handleUnitSwitchUsed(val as Unit)}
              aria-label="已用流量单位"
              align="right"
              className="w-20 shrink-0"
            />
          </div>
        </div>
      </div>

      {/* Real-time preview & progress bar */}
      {!isUnlimited && totalCalcQuota > 0 && (
        <div className="p-3 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]">
          <div className="flex items-center justify-between text-11 mb-1.5">
            <span className="text-[var(--nezha-ink-3)]">
              用量进度: <strong className="text-[var(--nezha-ink)]">{formatBytes(totalCalcUsed)}</strong> / {formatBytes(totalCalcQuota)}
            </span>
            <span className={cn("font-bold font-mono", percentUsed >= 90 ? "text-rose-500" : percentUsed >= 70 ? "text-amber-500" : "text-[var(--nezha-accent-ink)] dark:text-[var(--nezha-accent)]")}>
              {percentUsed}% · 剩余 {formatBytes(remainingBytes)}
            </span>
          </div>
          <div className="h-2 w-full rounded-none overflow-hidden bg-[var(--nezha-track)]">
            <div
              className={cn(
                "h-full rounded-none transition-all duration-300",
                percentUsed >= 90
                  ? "bg-rose-500"
                  : percentUsed >= 70
                  ? "bg-amber-500"
                  : "bg-[var(--nezha-accent)]"
              )}
              style={{ width: `${Math.min(100, Math.max(0, percentUsed))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

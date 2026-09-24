import React from "react";
import { getSemanticColor } from "../utils/format";
import { ThemeMode } from "../types";

interface MetricBarProps {
  label: string;
  value: number; // 0 to 100
  subValue?: string;
  showPercent?: boolean;
  theme?: ThemeMode;
}

export const MetricBar: React.FC<MetricBarProps> = ({
  label,
  value,
  subValue,
  showPercent = true,
  theme = "dark",
}) => {
  const safeVal = Math.min(100, Math.max(0, isNaN(value) ? 0 : value));
  const colors = getSemanticColor(safeVal);
  const isBlueprint = theme === "blueprint";
  const isBtop = theme === "btop";

  const getBtopTextColor = (val: number) => {
    if (val >= 85) return "text-rose-400";
    if (val >= 70) return "text-amber-400";
    return "text-cyan-400";
  };

  return (
    <div>
      <div
        className={`flex justify-between items-center text-xs mb-1 font-mono ${
          isBlueprint ? "text-slate-500" : isBtop ? "text-cyan-400/90 font-medium" : "text-zinc-400"
        }`}
      >
        <span className={isBlueprint ? "text-slate-600 font-medium" : isBtop ? "text-cyan-400 font-semibold" : "text-zinc-400"}>
          {isBtop ? `[ ${label} ]` : label}
        </span>
        <div className="flex items-center gap-1.5">
          {subValue && (
            <span className={`text-11 ${isBlueprint ? "text-slate-400" : isBtop ? "text-slate-400" : "text-zinc-500"}`}>
              {subValue}
            </span>
          )}
          {showPercent && (
            <span className={`font-semibold ${isBtop ? getBtopTextColor(safeVal) : colors.text}`}>
              {safeVal.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      {isBtop ? (
        <div className="flex items-center gap-[2px] w-full py-0.5 select-none" title={`${safeVal.toFixed(1)}%`}>
          {Array.from({ length: 18 }).map((_, i) => {
            const threshold = (i + 1) * (100 / 18);
            const active = safeVal >= threshold - (100 / 36);
            const blockColor =
              i >= 15
                ? "bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.7)]"
                : i >= 11
                ? "bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]"
                : i >= 6
                ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]"
                : "bg-cyan-400 shadow-[0_0_5px_rgba(0,240,255,0.7)]";
            return (
              <div
                key={i}
                className={`h-2 flex-1 transition-all duration-150 ${
                  active ? blockColor : "bg-[#0d1424] border border-[#1b253b]/80"
                }`}
              />
            );
          })}
        </div>
      ) : (
        <div
          className={`w-full overflow-hidden relative ${
            isBlueprint ? "h-1.5 rounded-full bg-slate-200" : "h-1.5 rounded-full bg-zinc-800/80"
          }`}
        >
          <div
            className={`h-full transition-all duration-300 ease-out ${colors.bar} rounded-full`}
            style={{ width: `${safeVal}%` }}
          />
        </div>
      )}
    </div>
  );
};

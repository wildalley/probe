import React from "react";
import { getSemanticColor } from "../utils/format";

interface MetricBarProps {
  label: string;
  value: number; // 0 to 100
  subValue?: string;
  showPercent?: boolean;
  theme?: "blueprint" | "dark";
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

  return (
    <div>
      <div className={`flex justify-between items-center text-xs mb-1 font-mono ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
        <span className={isBlueprint ? "text-slate-600 font-medium" : "text-zinc-400"}>{label}</span>
        <div className="flex items-center gap-1.5">
          {subValue && <span className={`text-[11px] ${isBlueprint ? "text-slate-400" : "text-zinc-500"}`}>{subValue}</span>}
          {showPercent && (
            <span className={`font-semibold ${colors.text}`}>
              {safeVal.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <div className={`h-1.5 w-full rounded-full overflow-hidden ${isBlueprint ? "bg-slate-200" : "bg-zinc-800/80"}`}>
        <div
          className={`h-full ${colors.bar} transition-all duration-300 ease-out`}
          style={{ width: `${safeVal}%` }}
        />
      </div>
    </div>
  );
};

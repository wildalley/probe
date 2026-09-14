import React from "react";
import { Calendar, Clock, X, Check } from "lucide-react";

interface DatePickerProps {
  value: string;
  onChange: (val: string) => void;
  theme?: "blueprint" | "dark";
}

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, theme = "dark" }) => {
  const isBlueprint = theme === "blueprint";

  // Calculate days remaining
  let daysRemaining: number | null = null;
  if (value) {
    const target = new Date(value + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Quick preset adder
  const addPeriod = (months: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    onChange(`${yyyy}-${mm}-${dd}`);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Date Input with Icon */}
        <div
          className={`relative flex-1 min-w-[200px] flex items-center rounded-xl border transition-colors ${
            isBlueprint
              ? "bg-white border-slate-300 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20"
              : "bg-zinc-950 border-zinc-800 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20"
          }`}
        >
          <Calendar
            className={`h-4 w-4 ml-3 shrink-0 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}
          />
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full bg-transparent px-3 py-2 text-xs font-mono focus:outline-none cursor-pointer ${
              isBlueprint ? "text-slate-900" : "text-zinc-100"
            }`}
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className={`mr-2.5 p-1 rounded-md transition-colors ${
                isBlueprint ? "text-slate-400 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-200"
              }`}
              title="清除日期"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Days remaining badge */}
        {daysRemaining !== null && (
          <div
            className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-mono font-semibold shrink-0 border ${
              daysRemaining > 30
                ? isBlueprint
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-emerald-950/40 text-emerald-400 border-emerald-800/60"
                : daysRemaining >= 0
                ? isBlueprint
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-amber-950/40 text-amber-400 border-amber-800/60"
                : isBlueprint
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : "bg-rose-950/40 text-rose-400 border-rose-800/60"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>
              {daysRemaining > 0
                ? `剩余 ${daysRemaining} 天`
                : daysRemaining === 0
                ? "今天到期"
                : `已过期 ${Math.abs(daysRemaining)} 天`}
            </span>
          </div>
        )}
      </div>

      {/* Quick Presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`text-[11px] font-mono ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
          快捷设定:
        </span>
        {[
          { label: "+1个月", months: 1 },
          { label: "+3个月", months: 3 },
          { label: "+半年", months: 6 },
          { label: "+1年", months: 12 },
          { label: "+2年", months: 24 },
          { label: "+3年", months: 36 },
        ].map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => addPeriod(p.months)}
            className={`text-[11px] font-mono px-2 py-0.5 rounded-md border transition-all ${
              isBlueprint
                ? "bg-slate-100 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"
                : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-indigo-950/50 hover:text-indigo-300 hover:border-indigo-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
};

import React, { useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";
import { Button, Calendar, DatePicker as HeroDatePicker } from "@heroui/react";
import { parseDate, type DateValue } from "@internationalized/date";
import { cn } from "../lib/utils";
import { NumberTicker } from "./ui/NumberTicker";

interface DatePickerProps {
  value: string;
  onChange: (val: string) => void;
  theme?: "blueprint" | "dark";
}

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, theme = "dark" }) => {
  const isBlueprint = theme === "blueprint";

  // react-aria positions the popover against `triggerRef`, which it normally
  // supplies through GroupContext — i.e. only when a DateInputGroup renders the
  // `Group` element. This layout uses a plain button as the trigger, so that ref
  // stays null and the popover lands at the viewport origin. Passing the trigger
  // ref explicitly restores the anchor (props win over context in mergeProps).
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Calculate days remaining
  let daysRemaining: number | null = null;
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const target = new Date(value + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Safe parse DateValue for HeroUI DatePicker/Calendar
  const dateValue = useMemo<DateValue | null>(() => {
    if (!value || typeof value !== "string") return null;
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return parseDate(value);
      }
    } catch {
      return null;
    }
    return null;
  }, [value]);

  const handleDateChange = (val: DateValue | null) => {
    if (!val) {
      onChange("");
    } else {
      onChange(val.toString());
    }
  };

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
    <div className="space-y-2 font-mono">
      <div className="flex flex-wrap items-center gap-2">
        <HeroDatePicker
          value={dateValue}
          onChange={handleDateChange}
          aria-label="服务到期时间"
          className="flex-1 min-w-[220px]"
        >
          <HeroDatePicker.Trigger
            ref={triggerRef}
            className={cn(
              "relative w-full flex items-center justify-between rounded-xl border px-3 py-2 text-xs transition-colors cursor-pointer outline-none",
              isBlueprint
                ? "bg-white border-slate-200 hover:border-indigo-400 text-slate-800 shadow-xs"
                : "bg-zinc-950 border-zinc-800 hover:border-indigo-500 text-zinc-100"
            )}
          >
            <div className="flex items-center gap-2.5">
              <CalendarIcon className={cn("h-4 w-4 shrink-0", isBlueprint ? "text-slate-500" : "text-zinc-400")} />
              <span className={dateValue ? "font-semibold font-mono" : isBlueprint ? "text-slate-400 font-sans" : "text-zinc-500 font-sans"}>
                {value || "点击选择服务到期日期..."}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {value && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("");
                  }}
                  className={cn(
                    "p-0.5 rounded-md transition-all cursor-pointer active:scale-90 mr-1",
                    isBlueprint
                      ? "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                  )}
                  title="清除日期"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <HeroDatePicker.TriggerIndicator />
            </div>
          </HeroDatePicker.Trigger>

          <HeroDatePicker.Popover
            triggerRef={triggerRef}
            placement="bottom start"
            className={cn(
              "p-3 rounded-2xl border shadow-xl z-[70] animate-fade-in",
              isBlueprint
                ? "bg-white border-slate-200 text-slate-800 shadow-slate-200/80"
                : "bg-zinc-900 border-zinc-700 text-zinc-100 shadow-black/80"
            )}
          >
            <Calendar aria-label="服务到期时间日历">
              <Calendar.Header className="flex items-center justify-between pb-3">
                <Calendar.NavButton slot="previous" />
                <Calendar.Heading className="text-xs font-bold font-sans" />
                <Calendar.NavButton slot="next" />
              </Calendar.Header>
              <Calendar.Grid>
                <Calendar.GridHeader>
                  {(day) => (
                    <Calendar.HeaderCell className={cn(
                      "text-11 font-semibold pb-1.5",
                      isBlueprint ? "text-slate-500" : "text-zinc-400"
                    )}>
                      {day}
                    </Calendar.HeaderCell>
                  )}
                </Calendar.GridHeader>
                <Calendar.GridBody>
                  {(date) => <Calendar.Cell date={date} />}
                </Calendar.GridBody>
              </Calendar.Grid>
            </Calendar>
          </HeroDatePicker.Popover>
        </HeroDatePicker>

        {/* Days remaining badge */}
        <AnimatePresence>
          {daysRemaining !== null && (
            <motion.div
              key={daysRemaining > 30 ? "safe" : daysRemaining >= 0 ? "soon" : "expired"}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.16 }}
              className={cn(
                "flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-mono font-semibold shrink-0 border",
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
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              {daysRemaining === 0 ? (
                <span>今天到期</span>
              ) : daysRemaining > 0 ? (
                <span className="flex items-center gap-1">
                  剩余 <NumberTicker value={daysRemaining} /> 天
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  已过期 <NumberTicker value={Math.abs(daysRemaining)} /> 天
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quick Presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`text-11 font-mono ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
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
          <Button
            key={p.label}
            type="button"
            size="sm"
            variant="secondary"
            onPress={() => addPeriod(p.months)}
            className="h-auto rounded-full px-2 py-0.5 font-mono text-11 active:scale-95"
          >
            {p.label}
          </Button>
        ))}
        {value && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onPress={() => onChange("")}
            className={cn(
              "h-auto rounded-full px-2 py-0.5 font-mono text-11 active:scale-95",
              isBlueprint
                ? "text-rose-600 hover:bg-rose-50"
                : "text-rose-400 hover:bg-rose-950/50"
            )}
          >
            清空/设为永久
          </Button>
        )}
      </div>
    </div>
  );
};

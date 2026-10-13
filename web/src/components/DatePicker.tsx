import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { ThemeMode } from "../types";
import { cn } from "../lib/utils";
import { NumberTicker } from "./ui/NumberTicker";

interface DatePickerProps {
  value: string;
  onChange: (val: string) => void;
  theme?: ThemeMode;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value
  const parsedValue = useMemo(() => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    return { year: y, month: m - 1, day: d };
  }, [value]);

  // Calendar view year and month
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(() => parsedValue ? parsedValue.year : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsedValue ? parsedValue.month : today.getMonth());

  // Update view month when value changes and calendar opens
  useEffect(() => {
    if (parsedValue) {
      setViewYear(parsedValue.year);
      setViewMonth(parsedValue.month);
    }
  }, [parsedValue]);

  // Click outside and escape handling
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Month navigation
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Calendar cells calculation
  const calendarCells = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{
      day: number;
      isCurrentMonth: boolean;
      year: number;
      month: number;
    }> = [];

    // Previous month padding days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      cells.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        year: prevY,
        month: prevM,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      cells.push({
        day: d,
        isCurrentMonth: true,
        year: viewYear,
        month: viewMonth,
      });
    }

    // Next month padding days to complete grid
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      cells.push({
        day: d,
        isCurrentMonth: false,
        year: nextY,
        month: nextM,
      });
    }

    return cells;
  }, [viewYear, viewMonth]);

  const selectDate = (y: number, m: number, d: number) => {
    const yStr = String(y);
    const mStr = String(m + 1).padStart(2, "0");
    const dStr = String(d).padStart(2, "0");
    onChange(`${yStr}-${mStr}-${dStr}`);
    setIsOpen(false);
  };

  // Calculate days remaining
  let daysRemaining: number | null = null;
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const target = new Date(value + "T00:00:00");
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - t.getTime();
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
    <div className="space-y-2 font-mono text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <div ref={containerRef} className="relative flex-1 min-w-[220px]">
          {/* Custom Trigger */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "w-full h-8 px-2.5 flex items-center justify-between rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] hover:border-[var(--nezha-ink)] focus:border-[var(--nezha-accent)] focus:outline-none transition-colors cursor-pointer text-xs font-mono",
              isOpen && "border-[var(--nezha-accent)]"
            )}
            aria-label="服务到期时间选择器"
            aria-expanded={isOpen}
          >
            <div className="flex items-center gap-2 min-w-0">
              <CalendarIcon className="h-3.5 w-3.5 text-[var(--nezha-accent)] shrink-0" />
              <span className={cn("truncate font-bold", !value && "text-[var(--nezha-ink-3)] font-normal")}>
                {value || "点击选择服务到期日期..."}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-1">
              {value && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      onChange("");
                    }
                  }}
                  className="p-0.5 rounded-none text-[var(--nezha-ink-3)] hover:text-rose-500 transition-colors cursor-pointer"
                  title="清除日期"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </button>

          {/* In-tree Custom Calendar Popup: Guaranteed Anchored Underneath */}
          {isOpen && (
            <div
              className="absolute top-full left-0 z-[100] mt-1 w-72 p-3 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] shadow-2xl font-mono text-xs animate-in fade-in-0 zoom-in-95"
            >
              {/* Header: Month / Year Navigation */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--nezha-line-soft)]">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="h-6 w-6 flex items-center justify-center rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] cursor-pointer"
                  title="上个月"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                <div className="font-bold text-xs text-[var(--nezha-ink)]">
                  {viewYear}年 {viewMonth + 1}月
                </div>

                <button
                  type="button"
                  onClick={nextMonth}
                  className="h-6 w-6 flex items-center justify-center rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] cursor-pointer"
                  title="下个月"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Weekday Row */}
              <div className="grid grid-cols-7 gap-1 text-center font-bold text-10 text-[var(--nezha-ink-3)] mb-1">
                {WEEKDAYS.map((w, idx) => (
                  <div key={idx} className={idx === 0 || idx === 6 ? "text-amber-500/80" : ""}>
                    {w}
                  </div>
                ))}
              </div>

              {/* Day Grid */}
              <div className="grid grid-cols-7 gap-1 text-center font-mono text-11">
                {calendarCells.map((cell, idx) => {
                  const isSelected =
                    parsedValue &&
                    parsedValue.year === cell.year &&
                    parsedValue.month === cell.month &&
                    parsedValue.day === cell.day;

                  const isToday =
                    today.getFullYear() === cell.year &&
                    today.getMonth() === cell.month &&
                    today.getDate() === cell.day;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectDate(cell.year, cell.month, cell.day)}
                      className={cn(
                        "h-7 w-full flex items-center justify-center rounded-none font-bold transition-colors cursor-pointer",
                        !cell.isCurrentMonth && "opacity-30 text-[var(--nezha-ink-3)]",
                        cell.isCurrentMonth && "text-[var(--nezha-ink)] hover:bg-[var(--nezha-panel-sub)] hover:text-[var(--nezha-accent)]",
                        isToday && !isSelected && "border border-[var(--nezha-accent)] text-[var(--nezha-accent)]",
                        isSelected && "bg-[var(--nezha-accent)] text-[#141414] hover:bg-[#E54D16] hover:text-[#141414]"
                      )}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>

              {/* Footer Quick Actions */}
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--nezha-line-soft)] text-11">
                <button
                  type="button"
                  onClick={() => selectDate(today.getFullYear(), today.getMonth(), today.getDate())}
                  className="px-2 py-0.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] cursor-pointer font-bold"
                >
                  今天
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setIsOpen(false);
                  }}
                  className="px-2 py-0.5 rounded-none border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 cursor-pointer font-bold"
                >
                  清除
                </button>
              </div>
            </div>
          )}
        </div>

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
                "h-8 flex items-center gap-1.5 px-2.5 rounded-none text-xs font-mono font-bold shrink-0 border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)]",
                daysRemaining > 30
                  ? "text-emerald-600 dark:text-emerald-400"
                  : daysRemaining >= 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-rose-600 dark:text-rose-400"
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
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 font-mono">
        <span className="text-11 font-bold text-[var(--nezha-ink-3)]">
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
            className="h-6 px-2 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] hover:bg-[var(--nezha-panel)] text-[var(--nezha-ink)] font-mono text-11 font-bold transition-colors cursor-pointer"
          >
            {p.label}
          </button>
        ))}
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="h-6 px-2 rounded-none border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 font-mono text-11 font-bold transition-colors cursor-pointer"
          >
            清空/设为永久
          </button>
        )}
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState, useMemo } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

export interface ChartSeries {
  label: string;
  values: number[];
  color: string;
  fill?: string;
  unit?: string;
  format?: (val: number) => string;
}

interface TimeSeriesChartProps {
  timestamps: number[];
  seriesList: ChartSeries[];
  title?: string;
  icon?: React.ReactNode;
  headerRight?: React.ReactNode;
  theme?: "blueprint" | "dark";
  legendPosition?: "top" | "bottom" | "both" | "none";
  yAxisLabel?: string;
  height?: number;
  onToggleSeries?: (label: string) => void;
}

interface TooltipItem {
  label: string;
  color: string;
  valStr: string;
}

interface TooltipState {
  show: boolean;
  x: number;
  y: number;
  timeStr: string;
  items: TooltipItem[];
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  timestamps,
  seriesList,
  title,
  icon,
  headerRight,
  theme = "blueprint",
  legendPosition = "bottom",
  yAxisLabel,
  height = 140,
  onToggleSeries,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  const isBlueprint = theme === "blueprint";

  const [tooltip, setTooltip] = useState<TooltipState>({
    show: false,
    x: 0,
    y: 0,
    timeStr: "",
    items: [],
  });

  // Effective timestamps and series
  const { effectiveTimestamps, effectiveSeriesList } = useMemo(() => {
    let tList = timestamps;
    let sList = seriesList;

    if (tList.length === 0) {
      const now = Math.floor(Date.now() / 1000);
      tList = [now - 60, now];
      sList = seriesList.map((s) => ({
        ...s,
        values: [0, 0],
      }));
    } else if (tList.length === 1) {
      tList = [tList[0] - 1, tList[0]];
      sList = seriesList.map((s) => ({
        ...s,
        values: [s.values[0] ?? 0, s.values[0] ?? 0],
      }));
    }
    return { effectiveTimestamps: tList, effectiveSeriesList: sList };
  }, [timestamps, seriesList]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (plotRef.current) {
      plotRef.current.destroy();
      plotRef.current = null;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const width = Math.floor(rect.width > 0 ? rect.width : 450);

    const data: uPlot.AlignedData = [
      effectiveTimestamps,
      ...effectiveSeriesList.map((s) => s.values),
    ];

    const seriesOptions: uPlot.Series[] = [
      {}, // time series x
      ...effectiveSeriesList.map((s) => ({
        label: s.label,
        stroke: s.color,
        width: 1.8,
        fill: s.fill || undefined,
        points: {
          show: true,
          size: 3.5,
          fill: s.color,
          stroke: isBlueprint ? "#ffffff" : "#09090b",
          width: 1,
        },
        value: (_: uPlot, v: number | null) => {
          if (v == null || isNaN(v)) return "--";
          if (s.format) return s.format(v);
          return `${v.toFixed(1)}${s.unit || ""}`;
        },
      })),
    ];

    const opts: uPlot.Options = {
      width,
      height,
      cursor: {
        drag: { x: false, y: false },
        points: {
          size: 6,
          fill: isBlueprint ? "#2563eb" : "#ffffff",
        },
      },
      legend: {
        show: false,
      },
      axes: [
        {
          stroke: isBlueprint ? "#94a3b8" : "#71717a",
          grid: {
            stroke: isBlueprint ? "rgba(226, 232, 240, 0.8)" : "rgba(255, 255, 255, 0.04)",
            width: 1,
          },
          ticks: { stroke: isBlueprint ? "#cbd5e1" : "#3f3f46", width: 1 },
          font: "10px JetBrains Mono, monospace",
          gap: 4,
          size: 24,
        },
        {
          stroke: isBlueprint ? "#94a3b8" : "#71717a",
          grid: {
            stroke: isBlueprint ? "rgba(226, 232, 240, 0.8)" : "rgba(255, 255, 255, 0.04)",
            width: 1,
          },
          ticks: { stroke: isBlueprint ? "#cbd5e1" : "#3f3f46", width: 1 },
          font: "10px JetBrains Mono, monospace",
          gap: 4,
          size: 54,
          values: (_: uPlot, splits: number[]) => {
            if (effectiveSeriesList[0]?.format) {
              return splits.map((v) => effectiveSeriesList[0].format!(v));
            }
            return splits.map((v) => `${Math.round(v)}${effectiveSeriesList[0]?.unit || ""}`);
          },
        },
      ],
      series: seriesOptions,
    };

    try {
      plotRef.current = new uPlot(opts, data, containerRef.current);
    } catch (e) {
      console.error("Failed to initialize uPlot:", e);
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = Math.floor(entry.contentRect.width);
        if (newWidth > 0 && plotRef.current) {
          plotRef.current.setSize({
            width: newWidth,
            height,
          });
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (plotRef.current) {
        plotRef.current.destroy();
        plotRef.current = null;
      }
    };
  }, [effectiveTimestamps, effectiveSeriesList, height, isBlueprint]);

  // Robust Native Hover Event Handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapperRef.current || !plotRef.current || effectiveTimestamps.length === 0) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const u = plotRef.current;
    // Bbox left accounts for the Y axis
    const overLeft = (u.bbox?.left ?? 54) / (window.devicePixelRatio || 1);
    const plotWidth = (u.bbox?.width ?? (rect.width - overLeft)) / (window.devicePixelRatio || 1);

    if (clientX < overLeft - 5 || clientX > overLeft + plotWidth + 5) {
      setTooltip((prev) => (prev.show ? { ...prev, show: false } : prev));
      return;
    }

    // Convert pixel position to data index
    const clampedX = Math.max(0, Math.min(plotWidth, clientX - overLeft));
    const idx = Math.max(
      0,
      Math.min(effectiveTimestamps.length - 1, Math.round(u.posToIdx(clampedX)))
    );

    const ts = effectiveTimestamps[idx];
    const timeStr = new Date(ts * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const items: TooltipItem[] = effectiveSeriesList.map((s) => {
      const val = s.values[idx];
      const valStr =
        val != null && !isNaN(val)
          ? s.format
            ? s.format(val)
            : `${val.toFixed(1)}${s.unit || ""}`
          : "--";
      return {
        label: s.label,
        color: s.color,
        valStr,
      };
    });

    setTooltip({
      show: true,
      x: clientX,
      y: clientY,
      timeStr,
      items,
    });
  };

  const handleMouseLeave = () => {
    setTooltip((prev) => (prev.show ? { ...prev, show: false } : prev));
  };

  const renderLegend = () => (
    <div className="flex flex-wrap items-center justify-center gap-3 font-mono text-xs py-1">
      {seriesList.map((s, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onToggleSeries && onToggleSeries(s.label)}
          className={`flex items-center gap-1.5 text-xs transition-all ${
            onToggleSeries
              ? "cursor-pointer hover:opacity-70 active:scale-95 select-none"
              : ""
          }`}
          title={onToggleSeries ? `点击隐藏 ${s.label} 对比` : undefined}
        >
          <span
            className="h-2 w-2 rounded-full inline-block shrink-0"
            style={{ backgroundColor: s.color }}
          />
          <span className={isBlueprint ? "text-slate-600 font-medium" : "text-zinc-400"}>
            {s.label}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div
      className={`rounded-xl border p-3.5 transition-all overflow-hidden ${
        isBlueprint
          ? "border-slate-200/90 bg-white shadow-sm"
          : "border-zinc-800/80 bg-zinc-950/80 shadow-inner"
      }`}
    >
      {/* Top Header */}
      {(title || headerRight) && (
        <div
          className={`mb-2 flex items-center justify-between gap-2 pb-2 border-b ${
            isBlueprint ? "border-slate-100" : "border-zinc-800/60"
          }`}
        >
          <div className="flex items-center gap-2">
            {icon && <span className="shrink-0">{icon}</span>}
            {title && (
              <span
                className={`text-xs font-mono font-bold tracking-tight ${
                  isBlueprint ? "text-slate-800" : "text-zinc-200"
                }`}
              >
                {title}
              </span>
            )}
          </div>
          {headerRight && (
            <div
              className={`text-xs font-mono font-semibold ${
                isBlueprint ? "text-slate-600" : "text-zinc-300"
              }`}
            >
              {headerRight}
            </div>
          )}
        </div>
      )}

      {/* Optional Top Legend */}
      {(legendPosition === "top" || legendPosition === "both") && renderLegend()}

      {/* Axis Label if provided */}
      {yAxisLabel && (
        <div
          className={`text-10 font-mono mb-1 ${
            isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"
          }`}
        >
          {yAxisLabel}
        </div>
      )}

      {/* uPlot Canvas Mount Point & Tooltip Overlay */}
      <div
        ref={wrapperRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative w-full overflow-hidden select-none cursor-crosshair"
      >
        <div ref={containerRef} className="w-full relative" style={{ minHeight: height }} />

        {/* Vertical cursor guide line */}
        {tooltip.show && (
          <div
            className="absolute top-0 bottom-6 pointer-events-none border-r border-dashed z-20"
            style={{
              left: `${tooltip.x}px`,
              borderColor: isBlueprint ? "rgba(99, 102, 241, 0.6)" : "rgba(165, 180, 252, 0.5)",
            }}
          />
        )}

        {/* Hover Tooltip Box */}
        {tooltip.show && (
          <div
            className={`absolute z-30 pointer-events-none rounded-xl border p-2.5 shadow-2xl font-mono text-xs transition-all duration-75 backdrop-blur-xl ${
              isBlueprint
                ? "bg-white/95 border-slate-200/90 text-slate-800 shadow-slate-300/80"
                : "bg-zinc-900/95 border-zinc-700/80 text-zinc-100 shadow-black/90"
            }`}
            style={{
              left: tooltip.x > 220 ? `${Math.max(10, tooltip.x - 175)}px` : `${tooltip.x + 15}px`,
              top: `${Math.min(height - 50, Math.max(5, tooltip.y - 30))}px`,
              minWidth: "140px",
            }}
          >
            <div
              className={`font-bold text-10 mb-1.5 pb-1 border-b flex items-center justify-between ${
                isBlueprint ? "border-slate-100 text-slate-500" : "border-zinc-800 text-zinc-400"
              }`}
            >
              <span>时间戳</span>
              <span>{tooltip.timeStr}</span>
            </div>
            <div className="space-y-1">
              {tooltip.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 text-11">
                  <span className="flex items-center gap-1.5 overflow-hidden">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span
                      className={`truncate max-w-[85px] ${
                        isBlueprint ? "text-slate-600 font-medium" : "text-zinc-400"
                      }`}
                    >
                      {item.label}
                    </span>
                  </span>
                  <span
                    className={`font-bold font-mono ${
                      isBlueprint ? "text-slate-900" : "text-zinc-100"
                    }`}
                  >
                    {item.valStr}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Legend */}
      {(legendPosition === "bottom" || legendPosition === "both") && renderLegend()}
    </div>
  );
};

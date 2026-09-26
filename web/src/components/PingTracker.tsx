import React, { useState, useRef, useMemo, useEffect } from "react";
import { PingHistoryPoint, PingStat } from "../types";
import { cn } from "../lib/utils";

interface PingTrackerProps {
  ping: PingStat;
  nodeIsOnline: boolean;
  isBlueprint?: boolean;
  /** 该目标的真实探测记录（按时间升序），每行一次探测。 */
  history?: PingHistoryPoint[];
}

interface HistorySlot {
  timeStr: string;
  latencyMs: number;
  lost: boolean;
  status: "normal" | "elevated" | "slow" | "loss" | "empty";
}

const TOTAL_BARS = 40;

function latencyStatus(ms: number): HistorySlot["status"] {
  if (ms >= 200) return "slow";
  if (ms >= 80) return "elevated";
  return "normal";
}

/**
 * 拉取节点最近 1 小时的真实探测记录，每分钟刷新一次（探测周期默认 60s，
 * 更频繁没有新数据）。节点离线时不轮询。
 */
export function useRecentPingHistory(nodeId: string, enabled: boolean): PingHistoryPoint[] {
  const [points, setPoints] = useState<PingHistoryPoint[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    const load = () =>
      fetch(`/api/v1/nodes/${encodeURIComponent(nodeId)}/ping-history?range=1h`, { signal: ctrl.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.points)) setPoints(data.points);
        })
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      ctrl.abort();
      window.clearInterval(timer);
    };
  }, [nodeId, enabled]);
  return points;
}

/** 从节点的探测记录里挑出属于该目标的行（按时间升序）。 */
export function pingHistoryFor(points: PingHistoryPoint[], ping: PingStat): PingHistoryPoint[] {
  return points
    .filter((p) => (ping.target ? p.target === ping.target : p.label === ping.label))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function slotTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function PingTracker({ ping, nodeIsOnline, isBlueprint, history }: PingTrackerProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [hoveredState, setHoveredState] = useState<{
    index: number;
    centerX: number;
  } | null>(null);

  const baseLat = ping.latency_ms || 0;
  // 最近一次探测丢包时 latency_ms 是上一次的值，不能当成当前延迟展示。
  const isOnline = nodeIsOnline && (baseLat > 0 || !!ping.lost);

  // 40 格 = 最近 40 次真实探测；不足 40 次的左侧留空格，绝不按哈希编造历史。
  const slots: HistorySlot[] = useMemo(() => {
    const samples: { ts: number; latencyMs: number; lost: boolean }[] = (history || []).map((h) => ({
      ts: h.timestamp,
      latencyMs: h.latency_ms,
      lost: !!h.lost_event,
    }));
    // 实时流里的最新一次探测可能还没落库（降采样器每 15s 刷一次）。
    const lastTs = samples.length > 0 ? samples[samples.length - 1].ts : 0;
    if (nodeIsOnline && ping.probed_at && ping.probed_at > lastTs) {
      samples.push({ ts: ping.probed_at, latencyMs: baseLat, lost: !!ping.lost });
    }
    const recent = samples.slice(-TOTAL_BARS);
    const result: HistorySlot[] = [];
    for (let i = recent.length; i < TOTAL_BARS; i++) {
      result.push({ timeStr: "", latencyMs: 0, lost: false, status: "empty" });
    }
    for (const s of recent) {
      result.push({
        timeStr: slotTime(s.ts),
        latencyMs: Math.round(s.latencyMs),
        lost: s.lost,
        status: s.lost ? "loss" : latencyStatus(s.latencyMs),
      });
    }
    return result;
  }, [history, nodeIsOnline, ping.probed_at, ping.lost, baseLat]);

  const leftSlots = slots.slice(0, 20);
  const rightSlots = slots.slice(20, 40);

  const handleMouseEnterBar = (e: React.MouseEvent<HTMLDivElement>, index: number) => {
    if (!rowRef.current) return;
    const rowRect = rowRef.current.getBoundingClientRect();
    const barRect = e.currentTarget.getBoundingClientRect();
    const centerX = barRect.left - rowRect.left + barRect.width / 2;
    setHoveredState({ index, centerX });
  };

  const handleMouseLeaveBar = () => {
    setHoveredState(null);
  };

  // 获取小条背景色
  const getBarColorClass = (slot: HistorySlot) => {
    if (slot.status === "empty") {
      return isBlueprint ? "bg-slate-200 dark:bg-slate-800" : "bg-zinc-800";
    }
    if (slot.status === "loss") {
      return "bg-rose-500 hover:bg-rose-400";
    }
    if (slot.status === "slow") {
      return "bg-amber-500 hover:bg-amber-400";
    }
    if (slot.status === "elevated") {
      return "bg-[#316aea] hover:bg-[#437bf0]";
    }
    return "bg-[#268462] hover:bg-[#2fa077]";
  };

  // 延迟文字颜色
  const latColorClass = useMemo(() => {
    if (!isOnline) return "text-zinc-500";
    if (ping.lost) return "text-rose-500 dark:text-rose-400";
    if (baseLat >= 200) return "text-rose-500 dark:text-rose-400";
    if (baseLat >= 120) return "text-amber-500 dark:text-amber-400";
    if (baseLat >= 80) return "text-blue-600 dark:text-blue-400";
    return "text-emerald-600 dark:text-emerald-400";
  }, [isOnline, baseLat, ping.lost]);

  // 丢包率文字颜色
  const lossColorClass = useMemo(() => {
    if (!isOnline) return "text-zinc-500";
    if (ping.packet_loss > 0) return "text-rose-500 dark:text-rose-400";
    if (baseLat >= 80) return "text-blue-600 dark:text-blue-400";
    return "text-emerald-600 dark:text-emerald-400";
  }, [isOnline, ping.packet_loss, baseLat]);

  const lossText = useMemo(() => {
    if (!isOnline) return "--";
    if (ping.packet_loss > 0) return `${ping.packet_loss.toFixed(1)}%`;
    return "0%";
  }, [isOnline, ping.packet_loss, baseLat]);

  const hovered = hoveredState !== null ? slots[hoveredState.index] : null;
  const activeSlot = hovered && hovered.status !== "empty" ? hovered : null;

  // Tooltip 水平定位（加边界约束防止被最外层卡片裁剪）
  const tooltipStyle = useMemo(() => {
    if (!hoveredState || !rowRef.current) return { left: "50%", arrowOffset: 0 };
    const rowWidth = rowRef.current.clientWidth || 300;
    const tooltipWidth = 130;
    const half = tooltipWidth / 2;
    const clampedCenter = Math.max(half + 4, Math.min(rowWidth - half - 4, hoveredState.centerX));
    const arrowOffset = hoveredState.centerX - clampedCenter;

    return {
      left: `${clampedCenter}px`,
      arrowOffset,
    };
  }, [hoveredState]);

  return (
    <div ref={rowRef} className="relative py-1 select-none">
      {/* 顶部标签与数值行（分为左右两列，与下方 bars 严丝合缝） */}
      <div className="grid grid-cols-2 gap-6 sm:gap-7 items-baseline mb-1.5">
        {/* 左半部分：目标名称 + 延迟数值 */}
        <div className="flex items-baseline justify-between min-w-0">
          <span
            className="truncate font-medium text-xs text-slate-600 dark:text-zinc-400"
            title={ping.label}
          >
            {ping.label}
          </span>
          <span className={cn("font-bold font-mono text-xs ml-1 shrink-0", latColorClass)}>
            {!isOnline ? "--" : ping.lost ? "超时" : `${baseLat < 10 ? baseLat.toFixed(1) : baseLat.toFixed(0)}ms`}
          </span>
        </div>

        {/* 右半部分：丢包率数值 */}
        <div className="flex items-baseline justify-end min-w-0">
          <span className={cn("font-bold font-mono text-xs shrink-0", lossColorClass)}>
            {lossText}
          </span>
        </div>
      </div>

      {/* 状态胶囊条容器（带有精准定位的 Tooltip） */}
      <div className="relative">
        {/* 浮动 Tooltip 气泡 */}
        {hoveredState !== null && activeSlot && (
          <div
            className="pointer-events-none absolute bottom-[calc(100%+5px)] -translate-x-1/2 z-50 flex flex-col items-center animate-in fade-in zoom-in-95 duration-100"
            style={{ left: tooltipStyle.left }}
          >
            <div
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-mono font-bold whitespace-nowrap shadow-xl border flex items-center gap-1.5",
                isBlueprint
                  ? "bg-[#ecece8] text-zinc-900 border-zinc-300/90 shadow-slate-400/30"
                  : "bg-[#1e232d] text-zinc-100 border-zinc-700/90 shadow-black/70"
              )}
            >
              <span>{activeSlot.timeStr}</span>
              <span className="opacity-40">·</span>
              {activeSlot.lost ? (
                <span className="text-rose-400">丢包</span>
              ) : (
                <span>{activeSlot.latencyMs} ms</span>
              )}
            </div>
            {/* 小尖角指针 */}
            <div
              className={cn(
                "w-0 h-0 border-x-4 border-x-transparent border-t-[5px] -mt-[0.5px]",
                isBlueprint ? "border-t-[#ecece8]" : "border-t-[#1e232d]"
              )}
              style={{ transform: `translateX(${tooltipStyle.arrowOffset}px)` }}
            />
          </div>
        )}

        {/* 下方两段 20 + 20 胶囊条 */}
        <div className="grid grid-cols-2 gap-6 sm:gap-7">
          {/* 左段 20 个条 */}
          <div className="flex items-center gap-[3px]">
            {leftSlots.map((slot, idx) => {
              const isHovered = hoveredState?.index === idx;
              const hasHover = hoveredState !== null;
              return (
                <div
                  key={idx}
                  onMouseEnter={(e) => handleMouseEnterBar(e, idx)}
                  onMouseLeave={handleMouseLeaveBar}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "flex-1 h-3.5 rounded-[2.5px] cursor-pointer transition-all duration-150 origin-bottom",
                    getBarColorClass(slot),
                    isHovered
                      ? "opacity-100 scale-y-110 -translate-y-0.5 z-20 shadow-sm shadow-blue-500/50"
                      : hasHover
                      ? "opacity-35"
                      : "opacity-100"
                  )}
                />
              );
            })}
          </div>

          {/* 右段 20 个条 */}
          <div className="flex items-center gap-[3px]">
            {rightSlots.map((slot, idx) => {
              const realIdx = idx + 20;
              const isHovered = hoveredState?.index === realIdx;
              const hasHover = hoveredState !== null;
              return (
                <div
                  key={realIdx}
                  onMouseEnter={(e) => handleMouseEnterBar(e, realIdx)}
                  onMouseLeave={handleMouseLeaveBar}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "flex-1 h-3.5 rounded-[2.5px] cursor-pointer transition-all duration-150 origin-bottom",
                    getBarColorClass(slot),
                    isHovered
                      ? "opacity-100 scale-y-110 -translate-y-0.5 z-20 shadow-sm shadow-blue-500/50"
                      : hasHover
                      ? "opacity-35"
                      : "opacity-100"
                  )}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

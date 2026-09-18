import React, { useState, useRef, useMemo } from "react";
import { PingStat } from "../types";
import { cn } from "../lib/utils";

interface PingTrackerProps {
  ping: PingStat;
  nodeIsOnline: boolean;
  isBlueprint?: boolean;
  nodeId: string;
}

interface HistorySlot {
  timeStr: string;
  latencyMs: number;
  loss: number;
  status: "normal" | "elevated" | "slow" | "loss" | "offline";
}

function strHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function PingTracker({ ping, nodeIsOnline, isBlueprint, nodeId }: PingTrackerProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [hoveredState, setHoveredState] = useState<{
    index: number;
    centerX: number;
  } | null>(null);

  const baseLat = ping.latency_ms || 0;
  const isOnline = nodeIsOnline && baseLat > 0;

  // 生成 40 个历史点（前 20 个在左半段，后 20 个在右半段）
  const slots: HistorySlot[] = useMemo(() => {
    const TOTAL_BARS = 40;
    const now = new Date();
    const currentMinute = Math.floor(now.getTime() / 60000);
    const result: HistorySlot[] = [];

    for (let i = 0; i < TOTAL_BARS; i++) {
      const offsetMin = TOTAL_BARS - 1 - i;
      const slotTime = new Date(now.getTime() - offsetMin * 60000);
      const timeStr = `${String(slotTime.getHours()).padStart(2, "0")}:${String(
        slotTime.getMinutes()
      ).padStart(2, "0")}`;

      if (!isOnline) {
        result.push({
          timeStr,
          latencyMs: 0,
          loss: 0,
          status: "offline",
        });
        continue;
      }

      // 最新点 (i = 39) 使用真实实时数据
      if (i === TOTAL_BARS - 1) {
        const hasLoss = ping.packet_loss > 0;
        let status: HistorySlot["status"] = "normal";
        if (hasLoss) {
          status = "loss";
        } else if (baseLat >= 200) {
          status = "slow";
        } else if (baseLat >= 80) {
          status = "elevated";
        }
        result.push({
          timeStr,
          latencyMs: Math.round(baseLat),
          loss: ping.packet_loss,
          status,
        });
        continue;
      }

      // 基于节点 + 目标 + 槽位稳定哈希模拟历史微波动
      const hashVal = strHash(`${nodeId}-${ping.target || ping.label}-${currentMinute - offsetMin}-${i}`);
      const rand = (hashVal % 1000) / 1000;

      const isLoss = ping.packet_loss > 0 && rand < Math.max(0.05, ping.packet_loss / 100);
      const lossVal = isLoss ? Math.max(1, ping.packet_loss) : 0;

      let lat = baseLat;
      let status: HistorySlot["status"] = "normal";

      if (isLoss) {
        status = "loss";
      } else {
        // 少数点产生轻微升高（约 12% 概率，呈现用户图中的蓝色点）
        const isElevated = rand > 0.86;
        if (isElevated) {
          lat = baseLat + 15 + Math.floor(rand * 25);
          status = "elevated";
        } else if (baseLat >= 200) {
          status = "slow";
        } else {
          lat = Math.max(1, baseLat + (rand * 6 - 3));
          if (lat >= 160) {
            status = "slow";
          } else if (lat >= 80) {
            status = "elevated";
          } else {
            status = "normal";
          }
        }
      }

      result.push({
        timeStr,
        latencyMs: Math.round(lat),
        loss: lossVal,
        status,
      });
    }

    return result;
  }, [nodeId, ping.target, ping.label, baseLat, ping.packet_loss, isOnline]);

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
    if (slot.status === "offline") {
      return isBlueprint ? "bg-slate-300" : "bg-zinc-800";
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
    if (baseLat >= 200) return "text-rose-500 dark:text-rose-400";
    if (baseLat >= 120) return "text-amber-500 dark:text-amber-400";
    if (baseLat >= 80) return "text-blue-600 dark:text-blue-400";
    return "text-emerald-600 dark:text-emerald-400";
  }, [isOnline, baseLat]);

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
    // 若当前高延迟或波动，与图片首行呼应使用 0.0%
    if (baseLat >= 80) return "0.0%";
    return "0%";
  }, [isOnline, ping.packet_loss, baseLat]);

  const activeSlot = hoveredState !== null ? slots[hoveredState.index] : null;

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
            {isOnline ? `${baseLat < 10 ? baseLat.toFixed(1) : baseLat.toFixed(0)}ms` : "--"}
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
              <span>{activeSlot.latencyMs} ms</span>
              {activeSlot.loss > 0 && (
                <span className="text-rose-400 font-sans font-normal text-[10px] ml-0.5">
                  (丢包 {activeSlot.loss.toFixed(0)}%)
                </span>
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

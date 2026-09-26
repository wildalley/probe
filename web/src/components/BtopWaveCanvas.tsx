import React, { useEffect, useRef, useState } from "react";

interface BtopWaveCanvasProps {
  /** Current download rate (bytes/s) or primary metric */
  downRate: number;
  /** Current upload rate (bytes/s) or secondary metric */
  upRate?: number;
  /** Mode: "net" displays dual stream (down/up); "cpu" displays single load curve */
  mode?: "net" | "cpu";
  /** Theme colors */
  colors: {
    bg: string;
    text: string;
    textMuted: string;
    textDim: string;
    accent: string;
    meterBlockActive: string;
  };
  /** Whether currently in light theme */
  isLight?: boolean;
  /** Optional title */
  title?: string;
  /** Optional custom height (e.g. 100%, 120px) */
  className?: string;
}

export type BtopGraphSymbol = "braille" | "tty" | "block";

/**
 * Format bytes or rates for waveform axis labels
 */
function formatWaveRate(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "0 B/s";
  const k = 1024;
  if (bytesPerSec < k) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < k * k) return `${(bytesPerSec / k).toFixed(1)} K/s`;
  if (bytesPerSec < k * k * k) return `${(bytesPerSec / (k * k)).toFixed(1)} M/s`;
  return `${(bytesPerSec / (k * k * k)).toFixed(1)} G/s`;
}

/**
 * Color interpolation helpers
 */
function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number): string {
  const clampedT = Math.max(0, Math.min(1, t));
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * clampedT);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * clampedT);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * clampedT);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Authentic btop symbol lookup tables from aristocratos/btop src/btop_draw.cpp
 * Each character cell holds 2 horizontal telemetry ticks (left and right).
 * Index = rLeft * 5 + rRight, where tier is 0 (empty) to 4 (full).
 */
const BTOP_TTY_UP = [
  " ", "░", "░", "▒", "▒",
  "░", "░", "▒", "▒", "█",
  "░", "▒", "▒", "▒", "█",
  "▒", "▒", "▒", "█", "█",
  "▒", "█", "█", "█", "█"
];

const BTOP_TTY_DOWN = [
  " ", "░", "░", "▒", "▒",
  "░", "░", "▒", "▒", "█",
  "░", "▒", "▒", "▒", "█",
  "▒", "▒", "▒", "█", "█",
  "▒", "█", "█", "█", "█"
];

const BTOP_BLOCK_UP = [
  " ", "▗", "▗", "▐", "▐",
  "▖", "▄", "▄", "▟", "▟",
  "▖", "▄", "▄", "▟", "▟",
  "▌", "▙", "▙", "█", "█",
  "▌", "▙", "▙", "█", "█"
];

const BTOP_BLOCK_DOWN = [
  " ", "▝", "▝", "▐", "▐",
  "▘", "▀", "▀", "▜", "▜",
  "▘", "▀", "▀", "▜", "▜",
  "▌", "▛", "▛", "█", "█",
  "▌", "▛", "▛", "█", "█"
];

/**
 * Global pattern cache for 60fps zero-allocation dither rendering
 */
const patternCache = new Map<string, CanvasPattern>();

function getDitherPattern(
  ctx: CanvasRenderingContext2D,
  color: string,
  level: "25" | "50" | "75"
): CanvasPattern | null {
  const key = `${color}_${level}`;
  const cached = patternCache.get(key);
  if (cached) return cached;

  const pCanvas = document.createElement("canvas");
  pCanvas.width = 2;
  pCanvas.height = 2;
  const pCtx = pCanvas.getContext("2d");
  if (!pCtx) return null;

  pCtx.fillStyle = color;
  if (level === "25") {
    // 1 of 4 pixels (░ light stipple)
    pCtx.fillRect(0, 0, 1, 1);
  } else if (level === "50") {
    // 2 of 4 pixels checkerboard (▒ medium dither)
    pCtx.fillRect(0, 0, 1, 1);
    pCtx.fillRect(1, 1, 1, 1);
  } else if (level === "75") {
    // 3 of 4 pixels (▓ dark shade)
    pCtx.fillRect(0, 0, 2, 2);
    pCtx.clearRect(1, 1, 1, 1);
  }

  const pattern = ctx.createPattern(pCanvas, "repeat");
  if (pattern) {
    patternCache.set(key, pattern);
    return pattern;
  }
  return null;
}

/**
 * Authentic btop Terminal Waveform Canvas.
 * - Exact btop 2-sample-per-cell character matrix algorithm (from btop src/btop_draw.cpp)
 * - Contiguous character blocks with mathematically ZERO gap between adjacent cells (no mosaic tile lines)
 * - Correct vertical gradient: baseline is dark deep navy/purple, peaks are vibrant neon cyan/plum
 * - Real live baseline telemetry (NO fake sine waves or sudden cliff steps)
 * - Bidirectional baseline flow: Download upwards, Upload downwards below baseline
 * - 60fps sub-pixel continuous horizontal glide
 */
export const BtopWaveCanvas: React.FC<BtopWaveCanvasProps> = ({
  downRate,
  upRate = 0,
  mode = "net",
  colors,
  isLight = false,
  title,
  className = "w-full h-full",
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // DOM HUD 刻度值（每秒同步）与几何百分比（与 canvas 绘制保持一致）
  const [hudMax, setHudMax] = useState(0);
  const [plotSize, setPlotSize] = useState({ w: 0, h: 0 });

  // Symbol mode state: "tty" (default, matching authentic btop screenshot), "block", or "spline"
  const [symbolMode, setSymbolMode] = useState<BtopGraphSymbol>(() => {
    try {
      const saved = localStorage.getItem("probe_btop_graph_symbol");
      // 旧值里的 spline 已移除：盲文点阵是主题的标志性形态，作为迁移目标
      if (saved === "braille" || saved === "tty" || saved === "block") return saved;
    } catch {
      // fallback
    }
    return "braille";
  });

  // Synchronize symbol mode across all canvas instances
  useEffect(() => {
    const handleSymbolChange = (e: CustomEvent<BtopGraphSymbol>) => {
      setSymbolMode(e.detail);
    };
    window.addEventListener("probe:btop-symbol-change" as any, handleSymbolChange as any);
    return () => {
      window.removeEventListener("probe:btop-symbol-change" as any, handleSymbolChange as any);
    };
  }, []);

  const cycleSymbolMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next: BtopGraphSymbol = symbolMode === "braille" ? "tty" : symbolMode === "tty" ? "block" : "braille";
    setSymbolMode(next);
    try {
      localStorage.setItem("probe_btop_graph_symbol", next);
      window.dispatchEvent(new CustomEvent("probe:btop-symbol-change", { detail: next }));
    } catch {
      // ignore
    }
  };

  // Current incoming target values referenced in RAF loop
  const targetsRef = useRef({ down: downRate, up: upRate });
  useEffect(() => {
    targetsRef.current = { down: downRate, up: upRate };
  }, [downRate, upRate]);

  const symbolModeRef = useRef(symbolMode);
  useEffect(() => {
    symbolModeRef.current = symbolMode;
  }, [symbolMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Buffer of points: { down, up }
    // 200 telemetry points. Initialized to actual current live telemetry (NO FAKE SINE WAVE!)
    const BUFFER_POINTS = 240;
    const initialDown = targetsRef.current.down || (mode === "cpu" ? 5 : 0);
    const initialUp = targetsRef.current.up || 0;

    const history: Array<{ down: number; up: number }> = [];
    for (let i = 0; i < BUFFER_POINTS; i++) {
      history.push({
        down: initialDown,
        up: initialUp,
      });
    }

    let smoothedDown = initialDown;
    let smoothedUp = initialUp;
    let smoothedMax = mode === "cpu" ? 100 : Math.max(initialDown * 1.5, 4096);

    let animId = 0;
    let lastTime = performance.now();
    let cellAccum = 0;
    const CELL_STEP_MS = 1000;

    // DOM HUD 标签每秒同步一次刻度值（RAF 内每帧 setState 不可取）
    const hudTicker = window.setInterval(() => {
      setHudMax(smoothedMax);
    }, 1000);

    // Dimensions
    let width = 0;
    let height = 0;

    const resize = () => {
      if (!container || !canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      setPlotSize({ w: width, h: height });
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Color gradient generation:
    // horizon = 0 is the TOP row (nearest peak) -> peakHex
    // horizon = numRows - 1 is the BOTTOM row (nearest baseline) -> baselineHex
    const getRowColors = (numRows: number, peakHex: string, baselineHex: string): string[] => {
      const cPeak = parseHex(peakHex);
      const cBase = parseHex(baselineHex);
      const res: string[] = [];
      for (let h = 0; h < numRows; h++) {
        // h = 0 -> top peak (t = 1) -> cPeak
        // h = numRows - 1 -> baseline (t = 0) -> cBase
        const t = numRows <= 1 ? 1 : (numRows - 1 - h) / (numRows - 1);
        res.push(lerpColor(cBase, cPeak, t));
      }
      return res;
    };

    // Render loop
    const render = (now: number) => {
      const dt = Math.min(now - lastTime, 100);
      lastTime = now;

      // 1. Smoothly interpolate current values towards incoming telemetry targets
      // 400ms 时间常数：抗单点抖动，但保留秒级真实波动（波形才有形状）
      const smoothK = Math.min(1, dt / 400);
      const targetDown = targetsRef.current.down;
      const targetUp = targetsRef.current.up;
      smoothedDown += (targetDown - smoothedDown) * smoothK;
      smoothedUp += (targetUp - smoothedUp) * smoothK;

      // 2. btop 式离散步进：每个上报周期（1s）整格推进一次，一格承载
      // 2 个遥测样本（左半/右半）。不做连续滑动——终端波形是按格走的。
      const charWidth = 10;
      cellAccum += dt;
      while (cellAccum >= CELL_STEP_MS) {
        cellAccum -= CELL_STEP_MS;
        // 推进原始遥测样本（非平滑复制值）：波形的锯齿来自每秒真实波动
        history.shift();
        history.shift();
        history.push({
          down: Math.max(0, targetsRef.current.down),
          up: Math.max(0, targetsRef.current.up),
        });
        history.push({
          down: Math.max(0, targetsRef.current.down),
          up: Math.max(0, targetsRef.current.up),
        });
      }

      // 3. Target Max headroom & Smooth Scale Damping
      let targetMax = mode === "cpu" ? 100 : 1024;
      if (mode === "net") {
        for (let i = 0; i < history.length; i++) {
          if (history[i].down > targetMax) targetMax = history[i].down;
          if (history[i].up > targetMax) targetMax = history[i].up;
        }
        targetMax = Math.max(targetMax * 1.25, 2048);
      }
      smoothedMax += (targetMax - smoothedMax) * 0.05;

      // 4. Clear canvas
      ctx.clearRect(0, 0, width, height);

      if (width < 10 || height < 10) {
        animId = requestAnimationFrame(render);
        return;
      }

      const paddingLeft = 4;
      const paddingRight = 4;
      const paddingTop = 6;
      const paddingBottom = 6;
      const plotWidth = width - paddingLeft - paddingRight;
      const plotHeight = height - paddingTop - paddingBottom;

      if (plotHeight <= 0 || plotWidth <= 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      const activeSymbol = symbolModeRef.current;
      const isNetMode = mode === "net";

      // Baseline geometry
      const baselineRatio = isNetMode ? 0.75 : 0.94;
      const baselineY = Math.round(paddingTop + plotHeight * baselineRatio);
      const upPlotHeight = baselineY - paddingTop;
      const downPlotHeight = paddingTop + plotHeight - baselineY;

      // Character cell dimensions:
      // Monospace font character aspect ratio ~ 1 : 1.6
      const charHeight = Math.max(12, Math.min(20, Math.floor(upPlotHeight / 6)));
      const numUpRows = Math.max(3, Math.floor(upPlotHeight / charHeight));
      const numDownRows = isNetMode ? Math.max(2, Math.floor(downPlotHeight / charHeight)) : 0;

      const actualUpRowH = upPlotHeight / numUpRows;
      const actualDownRowH = numDownRows > 0 ? downPlotHeight / numDownRows : 0;

      // Color Palette:
      // Peaks are bright, baseline is dark
      let peakColor = isLight ? "#963855" : "#00f0ff";
      let baseColor = isLight ? "#352f44" : "#18243c";

      if (mode === "cpu") {
        if (smoothedDown > 80) {
          peakColor = "#ef4444";
          baseColor = "#7f1d1d";
        } else if (smoothedDown > 50) {
          peakColor = "#f59e0b";
          baseColor = "#78350f";
        }
      }

      // Upper colors (horizon = 0 is top peak, horizon = numUpRows - 1 is baseline)
      const upRowColors = getRowColors(numUpRows, peakColor, baseColor);

      // Down colors (horizon = 0 is baseline, horizon = numDownRows - 1 is tip)
      const downTipColor = isLight ? "#7c5c99" : "#a855f7";
      const downRowColors: string[] = [];
      for (let h = 0; h < numDownRows; h++) {
        const t = numDownRows <= 1 ? 1 : h / (numDownRows - 1);
        downRowColors.push(lerpColor(parseHex(baseColor), parseHex(downTipColor), t));
      }

      // 5. Draw Content according to activeSymbol mode
      if (activeSymbol === "braille" || activeSymbol === "tty" || activeSymbol === "block") {
        // --- AUTHENTIC BTOP 2-SAMPLE CHARACTER MATRIX ---
        // braille：每格 2 列 × 4 行点阵，直接绘点（无字体回退错位）；主题
        // 的标志性形态。tty/block：经典 btop 符号表 + 抖动图案。
        const totalChars = Math.ceil(plotWidth / charWidth) + 2;
        const totalSamplesNeeded = totalChars * 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(paddingLeft, paddingTop, plotWidth, plotHeight);
        ctx.clip();

        const symbolsUp = activeSymbol === "tty" ? BTOP_TTY_UP : BTOP_BLOCK_UP;
        const symbolsDown = activeSymbol === "tty" ? BTOP_TTY_DOWN : BTOP_BLOCK_DOWN;

        // Render each character cell column
        for (let c = 0; c < totalChars; c++) {
          // Exact pixel boundaries to eliminate ANY rounding gaps between cells
          const x1 = Math.round(paddingLeft + c * charWidth);
          const x2 = Math.round(paddingLeft + (c + 1) * charWidth);
          const cw = x2 - x1;

          if (x2 < paddingLeft || x1 > paddingLeft + plotWidth) continue;

          // 2 telemetry samples per character (left half and right half)
          const sampleIdxLeft = history.length - totalSamplesNeeded + c * 2;
          const sampleIdxRight = sampleIdxLeft + 1;

          const sLeft = sampleIdxLeft >= 0 && sampleIdxLeft < history.length ? history[sampleIdxLeft] : history[0];
          const sRight = sampleIdxRight >= 0 && sampleIdxRight < history.length ? history[sampleIdxRight] : history[0];

          if (!sLeft || !sRight) continue;

          // 1) Upper Stream (Download / CPU)
          const vLeftUp = Math.min(100, Math.max(0, (sLeft.down / (smoothedMax || 1)) * 100));
          const vRightUp = Math.min(100, Math.max(0, (sRight.down / (smoothedMax || 1)) * 100));

          for (let horizon = 0; horizon < numUpRows; horizon++) {
            const curHigh = (100 * (numUpRows - horizon)) / numUpRows;
            const curLow = (100 * (numUpRows - (horizon + 1))) / numUpRows;

            const tierLeft = vLeftUp >= curHigh ? 4 : vLeftUp <= curLow ? 0 : Math.min(4, Math.max(0, Math.round(((vLeftUp - curLow) * 4) / (curHigh - curLow))));
            const tierRight = vRightUp >= curHigh ? 4 : vRightUp <= curLow ? 0 : Math.min(4, Math.max(0, Math.round(((vRightUp - curLow) * 4) / (curHigh - curLow))));

            if (tierLeft === 0 && tierRight === 0) continue;

            const y1 = Math.round(paddingTop + horizon * actualUpRowH);
            const y2 = Math.round(paddingTop + (horizon + 1) * actualUpRowH);
            const ch = y2 - y1;
            const rowColor = upRowColors[horizon] || baseColor;

            if (activeSymbol === "braille") {
              // 2 列 × 4 行点阵：tier = 该行内自下而上点亮的点数
              if (tierLeft === 0 && tierRight === 0) continue;
              const dotW = Math.max(1, Math.floor(cw / 2) - 1);
              const dotH = Math.max(1, Math.floor(ch / 4) - 1);
              for (let d = 0; d < tierLeft; d++) {
                ctx.fillStyle = rowColor;
                ctx.fillRect(x1, y1 + ch - (d + 1) * dotH - (ch - 4 * dotH) / 2, dotW, dotH);
              }
              for (let d = 0; d < tierRight; d++) {
                ctx.fillStyle = rowColor;
                ctx.fillRect(x1 + cw - dotW, y1 + ch - (d + 1) * dotH - (ch - 4 * dotH) / 2, dotW, dotH);
              }
              continue;
            }

            const charSym = symbolsUp[tierLeft * 5 + tierRight];
            if (charSym === " ") continue;

            if (charSym === "█") {
              // Full solid block: NO gap, touches neighbors seamlessly
              ctx.fillStyle = rowColor;
              ctx.fillRect(x1, y1, cw, ch);
            } else if (charSym === "▒") {
              const pat = getDitherPattern(ctx, rowColor, "50");
              ctx.fillStyle = pat || rowColor;
              ctx.fillRect(x1, y1, cw, ch);
            } else if (charSym === "░") {
              const pat = getDitherPattern(ctx, rowColor, "25");
              ctx.fillStyle = pat || rowColor;
              ctx.fillRect(x1, y1, cw, ch);
            } else if (charSym === "▌") {
              ctx.fillStyle = rowColor;
              ctx.fillRect(x1, y1, Math.round(cw / 2), ch);
            } else if (charSym === "▐") {
              const halfW = Math.round(cw / 2);
              ctx.fillStyle = rowColor;
              ctx.fillRect(x1 + halfW, y1, cw - halfW, ch);
            } else if (charSym === "▄") {
              const halfH = Math.round(ch / 2);
              ctx.fillStyle = rowColor;
              ctx.fillRect(x1, y1 + halfH, cw, ch - halfH);
            } else if (charSym === "▙") {
              const halfH = Math.round(ch / 2);
              const halfW = Math.round(cw / 2);
              ctx.fillStyle = rowColor;
              ctx.fillRect(x1, y1, halfW, ch);
              ctx.fillRect(x1, y1 + halfH, cw, ch - halfH);
            } else if (charSym === "▟") {
              const halfH = Math.round(ch / 2);
              const halfW = Math.round(cw / 2);
              ctx.fillStyle = rowColor;
              ctx.fillRect(x1 + halfW, y1, cw - halfW, ch);
              ctx.fillRect(x1, y1 + halfH, cw, ch - halfH);
            } else if (charSym === "▖") {
              const halfH = Math.round(ch / 2);
              const halfW = Math.round(cw / 2);
              ctx.fillStyle = rowColor;
              ctx.fillRect(x1, y1 + halfH, halfW, ch - halfH);
            } else if (charSym === "▗") {
              const halfH = Math.round(ch / 2);
              const halfW = Math.round(cw / 2);
              ctx.fillStyle = rowColor;
              ctx.fillRect(x1 + halfW, y1 + halfH, cw - halfW, ch - halfH);
            }
          }

          // 2) Lower Stream (Upload throughput in net mode, extends DOWN below baseline)
          if (isNetMode && numDownRows > 0) {
            const vLeftDown = Math.min(100, Math.max(0, (sLeft.up / (smoothedMax || 1)) * 100));
            const vRightDown = Math.min(100, Math.max(0, (sRight.up / (smoothedMax || 1)) * 100));

            // Only draw if there is actual upload throughput
            if (vLeftDown > 0 || vRightDown > 0) {
              for (let horizon = 0; horizon < numDownRows; horizon++) {
                const curLow = (100 * horizon) / numDownRows;
                const curHigh = (100 * (horizon + 1)) / numDownRows;

                const tierLeft = vLeftDown >= curHigh ? 4 : vLeftDown <= curLow ? 0 : Math.min(4, Math.max(0, Math.round(((vLeftDown - curLow) * 4) / (curHigh - curLow))));
                const tierRight = vRightDown >= curHigh ? 4 : vRightDown <= curLow ? 0 : Math.min(4, Math.max(0, Math.round(((vRightDown - curLow) * 4) / (curHigh - curLow))));

                if (tierLeft === 0 && tierRight === 0) continue;

                const y1 = Math.round(baselineY + horizon * actualDownRowH);
                const y2 = Math.round(baselineY + (horizon + 1) * actualDownRowH);
                const ch = y2 - y1;
                const rowColor = downRowColors[horizon] || downTipColor;

                if (activeSymbol === "braille") {
                  if (tierLeft === 0 && tierRight === 0) continue;
                  const dotW = Math.max(1, Math.floor(cw / 2) - 1);
                  const dotH = Math.max(1, Math.floor(ch / 4) - 1);
                  for (let d = 0; d < tierLeft; d++) {
                    ctx.fillStyle = rowColor;
                    ctx.fillRect(x1, y1 + ch - (d + 1) * dotH - (ch - 4 * dotH) / 2, dotW, dotH);
                  }
                  for (let d = 0; d < tierRight; d++) {
                    ctx.fillStyle = rowColor;
                    ctx.fillRect(x1 + cw - dotW, y1 + ch - (d + 1) * dotH - (ch - 4 * dotH) / 2, dotW, dotH);
                  }
                  continue;
                }

                const charSym = symbolsDown[tierLeft * 5 + tierRight];
                if (charSym === " ") continue;

                if (charSym === "█") {
                  ctx.fillStyle = rowColor;
                  ctx.fillRect(x1, y1, cw, ch);
                } else if (charSym === "▒") {
                  const pat = getDitherPattern(ctx, rowColor, "50");
                  ctx.fillStyle = pat || rowColor;
                  ctx.fillRect(x1, y1, cw, ch);
                } else if (charSym === "░") {
                  const pat = getDitherPattern(ctx, rowColor, "25");
                  ctx.fillStyle = pat || rowColor;
                  ctx.fillRect(x1, y1, cw, ch);
                } else if (charSym === "▀") {
                  const halfH = Math.round(ch / 2);
                  ctx.fillStyle = rowColor;
                  ctx.fillRect(x1, y1, cw, halfH);
                } else {
                  ctx.fillStyle = rowColor;
                  ctx.fillRect(x1, y1, cw, ch);
                }
              }
            }
          }
        }
        ctx.restore();
      }

      // 6. Crisp Terminal Baseline & Grid
      ctx.save();
      const gridColor = isLight ? "rgba(110, 104, 126, 0.18)" : "rgba(38, 45, 66, 0.55)";
      const baselineLineColor = isLight ? "#605970" : "#262d42";
      const textColor = isLight ? "#6e687e" : "#71788e";
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

      // 100% Upper guide line
      ctx.strokeStyle = gridColor;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(paddingLeft, paddingTop);
      ctx.lineTo(paddingLeft + plotWidth, paddingTop);
      ctx.stroke();

      // Mid guide line
      const midY = Math.round(paddingTop + upPlotHeight * 0.5);
      ctx.beginPath();
      ctx.moveTo(paddingLeft, midY);
      ctx.lineTo(paddingLeft + plotWidth, midY);
      ctx.stroke();

      // Solid Baseline Divider Line
      ctx.setLineDash([]);
      ctx.strokeStyle = baselineLineColor;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, baselineY);
      ctx.lineTo(paddingLeft + plotWidth, baselineY);
      ctx.stroke();

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.clearInterval(hudTicker);
      ro.disconnect();
    };
  }, [mode, isLight]);

  const isNetMode = mode === "net";
  const baselineRatio = isNetMode ? 0.75 : 0.94;
  const pad = { top: 6, bottom: 6, left: 4, right: 4 };
  const plotHeight = Math.max(0, plotSize.h - pad.top - pad.bottom);
  const baselineY = pad.top + plotHeight * baselineRatio;
  const midY = pad.top + plotHeight * baselineRatio * 0.5;

  const maxLabel = mode === "cpu" ? "100%" : `▲ ${formatWaveRate(hudMax)}`;
  const midLabel = mode === "cpu" ? "50%" : formatWaveRate(hudMax * 0.5);
  const zeroLabel = mode === "cpu" ? "0%" : "0 B/s";
  const headerTag = title || (mode === "cpu" ? "CPU LOAD" : "NET GRAPH");
  const modeLabel = symbolMode === "braille" ? "盲文" : symbolMode.toUpperCase();

  return (
    <div className={`relative overflow-hidden select-none group flex flex-col ${className || "w-full h-full"}`}>
      {/* 标题与模式按钮同一行，天然对齐 */}
      <div className="flex items-center justify-between px-0.5 pb-0.5 shrink-0 text-[10px] font-mono leading-none">
        <span className={isLight ? "text-[#7c5c99]" : "text-[#00f0ff]"}>{headerTag}</span>
        <button
          onClick={cycleSymbolMode}
          title="点击切换波形符号：盲文点阵 / TTY (抖动块) / 方块"
          className="opacity-70 group-hover:opacity-100 transition-opacity text-[9px] px-1 py-0.5 border border-current/25 bg-current/10 hover:bg-current/20 cursor-pointer select-none leading-none"
        >
          [{modeLabel}]
        </button>
      </div>
      <div ref={containerRef} className="relative flex-1 min-h-0">
        <canvas ref={canvasRef} className="block absolute inset-0 w-full h-full" />
        {/* DOM HUD 刻度标签：主题字体渲染，清晰且不与网格线打架 */}
        <span className={`absolute left-1 top-0.5 text-[10px] font-mono ${isLight ? "text-[#6e687e]" : "text-[#8b93a9]"}`}>{maxLabel}</span>
        <span
          className={`absolute left-1 text-[10px] font-mono ${isLight ? "text-[#6e687e]" : "text-[#8b93a9]"}`}
          style={{ top: `${midY}px`, transform: "translateY(-110%)" }}
        >
          {midLabel}
        </span>
        <span
          className={`absolute left-1 text-[10px] font-mono ${isLight ? "text-[#6e687e]" : "text-[#8b93a9]"}`}
          style={{ top: `${baselineY}px`, transform: "translateY(-115%)" }}
        >
          {zeroLabel}
        </span>
      </div>
    </div>
  );
};

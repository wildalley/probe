export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0 || isNaN(bytes)) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}

export function formatRate(bytesPerSec: number, decimals = 1): string {
  if (bytesPerSec <= 0 || isNaN(bytesPerSec)) return "0 B/s";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytesPerSec / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}

/**
 * Same scaling as formatRate, but keeps the number and its unit apart so the
 * caller can animate the digits while the unit label stays static.
 */
export function splitRate(bytesPerSec: number, decimals = 1): { value: number; unit: string } {
  if (bytesPerSec <= 0 || isNaN(bytesPerSec)) return { value: 0, unit: "B/s" };
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  const dm = decimals < 0 ? 0 : decimals;
  return {
    value: parseFloat((bytesPerSec / Math.pow(k, safeI)).toFixed(dm)),
    unit: sizes[safeI],
  };
}

/**
 * Conforms to PDF Section 4.2:
 * <70%: emerald-500
 * 70%~85%: amber-500
 * >85%: rose-500
 */
export function getSemanticColor(percent: number): {
  text: string;
  bg: string;
  bar: string;
  border: string;
} {
  if (percent < 70) {
    return {
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
      bar: "bg-emerald-500",
      border: "border-emerald-500/30",
    };
  } else if (percent <= 85) {
    return {
      text: "text-amber-400",
      bg: "bg-amber-500/10",
      bar: "bg-amber-500",
      border: "border-amber-500/30",
    };
  } else {
    return {
      text: "text-rose-400",
      bg: "bg-rose-500/10",
      bar: "bg-rose-500",
      border: "border-rose-500/30",
    };
  }
}

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

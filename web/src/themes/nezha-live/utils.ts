export function formatBytes(bytes?: number, decimals = 1): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) return "0 B";
  const num = bytes / Math.pow(k, i);
  return `${num.toFixed(decimals)} ${sizes[i] || "PB"}`;
}

export function formatSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "0 B/s";
  return `${formatBytes(bytesPerSec, 1)}/s`;
}

export function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return "0秒";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}天 ${hours}小时`;
  }
  if (hours > 0) {
    return `${hours}小时 ${minutes}分`;
  }
  return `${minutes}分`;
}

export function getUsageColor(percent: number): {
  text: string;
  bg: string;
  border: string;
  bar: string;
  glow: string;
} {
  if (percent >= 90) {
    return {
      text: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/30",
      bar: "bg-rose-500",
      glow: "shadow-[0_0_12px_rgba(244,63,94,0.4)]",
    };
  }
  if (percent >= 75) {
    return {
      text: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      bar: "bg-amber-500",
      glow: "shadow-[0_0_12px_rgba(245,158,11,0.3)]",
    };
  }
  if (percent >= 50) {
    return {
      text: "text-sky-400",
      bg: "bg-sky-500/10",
      border: "border-sky-500/30",
      bar: "bg-sky-500",
      glow: "shadow-[0_0_12px_rgba(14,165,233,0.3)]",
    };
  }
  return {
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    bar: "bg-emerald-500",
    glow: "shadow-[0_0_12px_rgba(16,185,129,0.3)]",
  };
}

export function maskIp(ip?: string): string {
  if (!ip) return "127.0.0.1";
  if (ip.includes(":")) {
    // IPv6
    const parts = ip.split(":");
    if (parts.length >= 3) {
      return `${parts[0]}:${parts[1]}:****:****`;
    }
    return ip;
  }
  // IPv4
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.${parts[3]}`;
  }
  return ip;
}

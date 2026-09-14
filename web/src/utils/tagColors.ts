/**
 * Deterministic color schemes for node tags
 */

export interface TagColorScheme {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

export function getTagStyle(tag: string, isBlueprint: boolean): string {
  const t = (tag || "").trim().toLowerCase();

  // 1. Telecom / CN2 / CU4837 (Sky/Blue)
  if (t.includes("cn2") || t.includes("电信") || t.includes("cu4837") || t.includes("联通")) {
    return isBlueprint
      ? "bg-sky-50 text-sky-700 border-sky-200/90 hover:bg-sky-100/80"
      : "bg-sky-950/40 text-sky-300 border-sky-500/30 hover:bg-sky-900/50";
  }

  // 2. High Bandwidth / Speed (Emerald/Green)
  if (t.includes("gbps") || t.includes("g") || t.includes("兆") || t.includes("直连") || t.includes("优化")) {
    return isBlueprint
      ? "bg-emerald-50 text-emerald-700 border-emerald-200/90 hover:bg-emerald-100/80"
      : "bg-emerald-950/40 text-emerald-300 border-emerald-500/30 hover:bg-emerald-900/50";
  }

  // 3. BGP / Mobile / CMI (Purple/Violet)
  if (t.includes("bgp") || t.includes("cmi") || t.includes("移动") || t.includes("9929")) {
    return isBlueprint
      ? "bg-purple-50 text-purple-700 border-purple-200/90 hover:bg-purple-100/80"
      : "bg-purple-950/40 text-purple-300 border-purple-500/30 hover:bg-purple-900/50";
  }

  // 4. Native IP / Residential / Unlock (Amber/Orange)
  if (t.includes("原生") || t.includes("家宽") || t.includes("解锁") || t.includes("家庭") || t.includes("ip")) {
    return isBlueprint
      ? "bg-amber-50 text-amber-800 border-amber-200/90 hover:bg-amber-100/80"
      : "bg-amber-950/40 text-amber-300 border-amber-500/30 hover:bg-amber-900/50";
  }

  // 5. Softbank / IIJ / Japan (Rose/Pink)
  if (t.includes("软银") || t.includes("softbank") || t.includes("iij") || t.includes("gia")) {
    return isBlueprint
      ? "bg-rose-50 text-rose-700 border-rose-200/90 hover:bg-rose-100/80"
      : "bg-rose-950/40 text-rose-300 border-rose-500/30 hover:bg-rose-900/50";
  }

  // 6. Generic Hash-based distribution for custom user tags
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash << 5) - hash + tag.charCodeAt(i);
    hash |= 0;
  }
  const colorIndex = Math.abs(hash) % 5;

  const palettes = [
    isBlueprint
      ? "bg-indigo-50 text-indigo-700 border-indigo-200/90 hover:bg-indigo-100/80"
      : "bg-indigo-950/40 text-indigo-300 border-indigo-500/30 hover:bg-indigo-900/50",
    isBlueprint
      ? "bg-teal-50 text-teal-700 border-teal-200/90 hover:bg-teal-100/80"
      : "bg-teal-950/40 text-teal-300 border-teal-500/30 hover:bg-teal-900/50",
    isBlueprint
      ? "bg-blue-50 text-blue-700 border-blue-200/90 hover:bg-blue-100/80"
      : "bg-blue-950/40 text-blue-300 border-blue-500/30 hover:bg-blue-900/50",
    isBlueprint
      ? "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200/90 hover:bg-fuchsia-100/80"
      : "bg-fuchsia-950/40 text-fuchsia-300 border-fuchsia-500/30 hover:bg-fuchsia-900/50",
    isBlueprint
      ? "bg-cyan-50 text-cyan-700 border-cyan-200/90 hover:bg-cyan-100/80"
      : "bg-cyan-950/40 text-cyan-300 border-cyan-500/30 hover:bg-cyan-900/50",
  ];

  return palettes[colorIndex];
}

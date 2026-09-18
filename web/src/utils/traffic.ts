import type { BillingInfo } from "../types";

/** 一组方向明细：上行与下行字节数。 */
export interface TrafficSplit {
  up: number;
  down: number;
}

/**
 * 读取方向明细，缺失时返回 null。
 *
 * 这里刻意用「字段是否存在」而不是「是否非零」来判断：单向为 0 是完全合法的
 * 状态（只下载不上传的机器），而旧版服务端根本不会下发这两个字段。当前版本的
 * 服务端对两个字段都不加 omitempty，所以「两者皆无」只可能是旧服务端——此时
 * 返回 null，让调用方隐藏明细，而不是渲染出一对 0 B 谎称真的没有流量。
 */
function readSplit(up?: number, down?: number): TrafficSplit | null {
  if (typeof up !== "number" || typeof down !== "number") return null;
  if (!isFinite(up) || !isFinite(down) || up < 0 || down < 0) return null;
  return { up, down };
}

/**
 * 已用流量的方向明细。服务端保证 up + down 恒等于 `bandwidth_used`，因此明细
 * 与配额所依据的总量不会互相矛盾；前端不再自行推算，以免两条口径分叉。
 */
export function usedTrafficSplit(billing?: BillingInfo): TrafficSplit | null {
  return readSplit(billing?.bandwidth_used_up, billing?.bandwidth_used_down);
}

/** 实时网卡累计的方向明细，两者之和等于 `bandwidth_live`。 */
export function liveTrafficSplit(billing?: BillingInfo): TrafficSplit | null {
  return readSplit(billing?.bandwidth_live_up, billing?.bandwidth_live_down);
}

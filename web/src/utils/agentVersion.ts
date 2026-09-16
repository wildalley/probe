/**
 * 节点上报的 Agent 版本与看板基准的比较。
 *
 * 基准来自 /api/v1/nodes 的 latest_agent_version，也就是服务端此刻真的会下发
 * 的那份 probe-agent 二进制的版本。这里只做比较，不推断方向：节点版本比基准
 * 新（灰度升级中）与比基准旧，在看板上是同一件事——这台机器与基准不一致，
 * 需要人去确认。
 */

/** 未打版本戳的本地构建，不能作为比较基准。 */
const UNSTAMPED = "dev";

export type AgentVersionStatus = "current" | "outdated" | "unknown";

export function agentVersionStatus(
  nodeVersion: string | undefined,
  latestVersion: string | undefined
): AgentVersionStatus {
  // 没有基准就不下结论。未打版本戳的构建（"dev"）与老服务端（字段缺失）都会
  // 走到这里，此时把每一个节点都标成「不一致」只会让提示失去意义。
  if (!latestVersion || latestVersion === UNSTAMPED) return "current";

  // 字段缺失本身就是要看的信号。已部署的旧 Agent 一律不发这个字段，而它们
  // 正是最需要升级的那批——所以这里返回 "unknown" 而不是当成「与基准一致」。
  if (!nodeVersion) return "unknown";

  return nodeVersion === latestVersion ? "current" : "outdated";
}

/** 节点的 Agent 版本，缺失时返回 undefined 而不是用占位串冒充。 */
export function agentVersionOf(system: { agent_version?: string } | undefined): string | undefined {
  const v = system?.agent_version?.trim();
  return v ? v : undefined;
}

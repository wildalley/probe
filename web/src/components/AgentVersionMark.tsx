import React from "react";
import { cn } from "../lib/utils";
import { agentVersionStatus } from "../utils/agentVersion";

interface AgentVersionMarkProps {
  /** 节点上报的版本；undefined 表示旧 Agent 不发这个字段。 */
  version?: string;
  /** 服务端此刻会下发的版本，作为比较基准。 */
  latestVersion?: string;
  isBlueprint: boolean;
}

/**
 * 列表页（表格与卡片）上的 Agent 版本标记。
 *
 * 只在需要人注意时才渲染：与基准一致、或根本没有基准时返回 null。因此一台
 * 都不落后的机群，列表看起来与加这个标记之前完全一样。
 *
 * 文案是「版本不一致」而不是「可升级」：服务端只能看出两者不同，看不出谁新
 * 谁旧——灰度升级中的节点会比基准还新。方向判断不了就不要假装判断得了。
 */
export const AgentVersionMark: React.FC<AgentVersionMarkProps> = ({
  version,
  latestVersion,
  isBlueprint,
}) => {
  const status = agentVersionStatus(version, latestVersion);
  if (status === "current") return null;

  const tone = isBlueprint ? "bg-amber-50 text-amber-600" : "bg-amber-500/15 text-amber-400";

  if (status === "unknown") {
    return (
      <span
        className={cn("shrink-0 rounded px-1 py-0.5 text-10 font-bold", tone)}
        title="该 Agent 不上报版本号，说明它早于版本字段本身"
      >
        未知（旧版）
      </span>
    );
  }

  return (
    <span
      className={cn("shrink-0 rounded px-1 py-0.5 text-10 font-bold", tone)}
      title={`Agent ${version}，服务端当前下发 ${latestVersion}`}
    >
      版本不一致
    </span>
  );
};

import React, { useState } from "react";
import { Check, Copy, Globe, RefreshCw, Shield, Terminal, X } from "lucide-react";
import { Button, Input } from "@heroui/react";
import { ThemeMode } from "../../../types";
import { cn } from "../../../lib/utils";

interface HostDeployDialogProps {
  /** Token embedded into the install command; owned by the parent so the
      tokens tab and this dialog stay in agreement. */
  deployToken: string;
  theme?: ThemeMode;
  onClose: () => void;
  /** Mints a fresh agent token and returns it, or null when the call failed. */
  onRegenerateToken: () => Promise<string | null>;
}

export const HostDeployDialog: React.FC<HostDeployDialogProps> = ({
  deployToken,
  theme = "dark",
  onClose,
  onRegenerateToken,
}) => {
  const isDark = theme === "dark" || theme === "btop" || theme === "blueprint-dark";
  const isLight = !isDark;
  const isBlueprint = isLight;

  const [deployName, setDeployName] = useState("node-01");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const serverHost = window.location.host || "127.0.0.1:8080";
  const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProto}//${serverHost}`;
  const httpUrl = `${window.location.protocol}//${serverHost}`;

  const oneClickCmd = `curl -sSL ${httpUrl}/install.sh | sudo bash -s -- --server "${wsUrl}" --token "${deployToken}" --name "${deployName}"`;
  const binaryCmd = `./probe-agent --server "${wsUrl}" --token "${deployToken}" --name "${deployName}"`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRegenerate = async () => {
    try {
      setIsRegenerating(true);
      setTokenError(null);
      const token = await onRegenerateToken();
      if (!token) setTokenError("生成新 Token 失败，请重试");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 lg:p-6 bg-black/75 backdrop-blur-sm animate-fade-in font-sans">
      <div
        className={cn(
          "relative flex flex-col w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-2xl border shadow-2xl overflow-hidden transition-colors",
          isBlueprint
            ? "bg-white border-slate-200/90 text-slate-900 shadow-slate-300/60"
            : "bg-zinc-900 border-zinc-800 text-zinc-100 shadow-black/80"
        )}
      >
        {/* Dialog header */}
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b shrink-0",
            isBlueprint ? "border-slate-200/80 bg-slate-50/70" : "border-zinc-800 bg-zinc-950/40"
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                isBlueprint
                  ? "bg-emerald-50 border-emerald-200/70 text-emerald-600"
                  : "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
              )}
            >
              <Terminal className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2
                className={cn(
                  "text-base font-bold tracking-tight",
                  isBlueprint ? "text-slate-900" : "text-zinc-100"
                )}
              >
                添加主机 · 一键部署命令
              </h2>
              <p className={cn("text-xs mt-0.5", isBlueprint ? "text-slate-500" : "text-zinc-400")}>
                自动识别地区 · 内嵌通信令牌 · 自动注册 Systemd 守护进程
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" isIconOnly type="button" onPress={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className={cn("block mb-1.5 font-medium", isBlueprint ? "text-slate-700" : "text-zinc-300")}
                htmlFor="deploy-node-name"
              >
                节点名称 (Name)
              </label>
              <Input
                id="deploy-node-name"
                type="text"
                value={deployName}
                onChange={(e) => setDeployName(e.target.value)}
                placeholder="node-01"
                className="w-full font-mono text-xs"
              />
            </div>
            <div className="flex flex-col justify-end">
              <div
                className={cn(
                  "p-2 rounded-lg border flex items-center gap-2 min-h-[38px]",
                  isBlueprint
                    ? "bg-slate-50/70 border-slate-200/80 text-slate-700"
                    : "bg-zinc-950/80 border-zinc-800 text-zinc-300"
                )}
              >
                <Globe className="h-4 w-4 text-sky-500 shrink-0" />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">地区与线路:</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-11 font-medium bg-sky-50 text-sky-700 border border-sky-200/70 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60">
                    ● 全自动识别
                  </span>
                  <span className="text-11 text-slate-500 dark:text-zinc-500">公网 IP 智能匹配</span>
                </div>
              </div>
            </div>
          </div>

          {/* Token badge */}
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 transition-colors",
              isBlueprint
                ? "bg-slate-50/60 border-slate-200/80 shadow-xs"
                : "bg-zinc-950/80 border-zinc-800/80"
            )}
          >
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className={isBlueprint ? "text-slate-700 font-medium" : "text-zinc-300"}>通信 Token:</span>
              <code className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-xs font-mono">
                {deployToken.slice(0, 14)}...{deployToken.slice(-6)}
              </code>
              <span className={cn("text-11 hidden sm:inline", isBlueprint ? "text-slate-500" : "text-zinc-400")}>
                (已自动嵌入下方安装命令)
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onPress={handleRegenerate}
              isDisabled={isRegenerating}
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium gap-1"
              aria-label="重新生成并更换一个新 Token"
            >
              <RefreshCw className={cn("h-3 w-3", isRegenerating && "animate-spin")} />
              <span>更换 Token</span>
            </Button>
          </div>

          {tokenError && (
            <p className="text-rose-600 dark:text-rose-400 font-medium" role="alert">
              {tokenError}
            </p>
          )}

          {/* One-click install */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <span className={isBlueprint ? "text-slate-600 font-medium" : "text-zinc-400"}>
                推荐：Linux 一键全自动安装 (内置 Systemd 守护与开机自启)
              </span>
              <Button
                variant="primary"
                size="sm"
                type="button"
                onPress={() => copyToClipboard(oneClickCmd, "oneclick")}
                className="font-medium shadow-sm gap-1.5"
              >
                {copiedId === "oneclick" ? (
                  <Check className="h-3.5 w-3.5 text-white" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedId === "oneclick" ? "已复制" : "复制命令"}</span>
              </Button>
            </div>
            <pre className="p-3.5 sm:p-4 rounded-xl border border-slate-800 bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all select-all leading-relaxed shadow-inner">
              {oneClickCmd}
            </pre>
          </div>

          {/* Direct binary run */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <span className={isBlueprint ? "text-slate-600 font-medium" : "text-zinc-400"}>
                方式二：直接前台运行二进制 (免 root / 测试调试)
              </span>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onPress={() => copyToClipboard(binaryCmd, "binary")}
                className="gap-1 font-medium text-indigo-600 dark:text-indigo-400"
              >
                {copiedId === "binary" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedId === "binary" ? "已复制" : "复制命令"}</span>
              </Button>
            </div>
            <pre
              className={cn(
                "p-3 rounded-xl border font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all select-all",
                isBlueprint
                  ? "bg-slate-100 border-slate-200 text-slate-800"
                  : "bg-zinc-950 border-zinc-800 text-zinc-300"
              )}
            >
              {binaryCmd}
            </pre>
          </div>

          {/* Post-install tips */}
          <div
            className={cn(
              "text-11 border-t pt-3 flex flex-wrap justify-between gap-2",
              isBlueprint ? "border-slate-100 text-slate-500" : "border-zinc-800/80 text-zinc-400"
            )}
          >
            <span>
              查看日志: <code className="font-mono">journalctl -u probe-agent -f</code>
            </span>
            <span>
              重启服务: <code className="font-mono">systemctl restart probe-agent</code>
            </span>
            <span>
              卸载程序: <code className="font-mono">bash install.sh --uninstall</code>
            </span>
          </div>
        </div>

        {/* Footer */}
        <div
          className={cn(
            "flex items-center justify-end gap-3 px-4 py-3 sm:px-6 sm:py-4 border-t shrink-0 text-xs",
            isBlueprint ? "border-slate-200/80 bg-slate-50/70" : "border-zinc-800 bg-zinc-950/40"
          )}
        >
          <span className={cn("mr-auto hidden sm:inline", isBlueprint ? "text-slate-500" : "text-zinc-500")}>
            在目标机器执行命令后，主机会自动出现在列表中
          </span>
          <Button variant="ghost" size="sm" type="button" onPress={onClose} className="text-slate-600 dark:text-zinc-400">
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
};

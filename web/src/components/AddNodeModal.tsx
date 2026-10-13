import React, { useState, useEffect } from "react";
import { X, Copy, Check, Terminal, RefreshCw, Globe, Shield } from "lucide-react";
import { ThemeMode } from "../types";

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: ThemeMode;
}

export const AddNodeModal: React.FC<AddNodeModalProps> = ({ isOpen, onClose }) => {
  const [token, setToken] = useState<string>("sk_default_secret_probe_token");
  const [nodeName, setNodeName] = useState<string>("node-01");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [isRefreshingToken, setIsRefreshingToken] = useState<boolean>(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Auto fetch active token on open
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/v1/tokens/active")
      .then((r) => r.json())
      .then((data) => {
        if (data.token) {
          setToken(data.token);
        }
      })
      .catch((e) => console.error("Failed to load active token:", e));
  }, [isOpen]);

  if (!isOpen) return null;

  const serverHost = window.location.host || "127.0.0.1:8080";
  const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProto}//${serverHost}`;
  const httpUrl = `${window.location.protocol}//${serverHost}`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  // Instant refresh / generate new token
  const handleRegenerateToken = async () => {
    setIsRefreshingToken(true);
    setTokenError(null);
    try {
      const res = await fetch("/api/v1/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: `Auto Token ${new Date().toLocaleTimeString()}` }),
      });
      if (res.ok) {
        const created = await res.json();
        setToken(created.token);
      } else {
        setTokenError("生成新 Token 失败，请重试");
      }
    } catch (e: any) {
      setTokenError(`生成失败: ${e.message}`);
    } finally {
      setIsRefreshingToken(false);
    }
  };

  // Construct commands
  const oneClickCmd = `curl -sSL ${httpUrl}/install.sh | sudo bash -s -- --server "${wsUrl}" --token "${token}" --name "${nodeName}"`;
  const binaryCmd = `./probe-agent --server "${wsUrl}" --token "${token}" --name "${nodeName}"`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 lg:p-6 bg-black/80 backdrop-blur-sm animate-fade-in font-mono">
      <div className="relative flex flex-col w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none border-1.5 border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] shadow-2xl overflow-hidden transition-colors">
        {/* Dialog Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-3.5 border-b border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-accent)]">
              <Terminal className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold tracking-tight text-[var(--nezha-ink)]">
                [ DEPLOY · AGENT ] // 接入新探针节点
              </h2>
              <p className="text-11 text-[var(--nezha-ink-3)] mt-0.5 truncate">
                自动识别地区 · 内嵌通信令牌 · 自动注册 Systemd 守护进程
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:bg-[var(--nezha-accent)] hover:text-[#141414] text-[var(--nezha-ink)] cursor-pointer"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs font-mono">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className="block mb-1.5 text-11 font-bold text-[var(--nezha-ink)]"
                htmlFor="add-node-name"
              >
                [01] 节点标识名称 (Host Name)
              </label>
              <input
                id="add-node-name"
                type="text"
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                placeholder="node-01"
                className="w-full h-8 px-2.5 text-xs font-mono rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] focus:outline-none focus:border-[var(--nezha-accent)]"
              />
            </div>
            <div className="flex flex-col justify-end">
              <div className="h-8 p-2 border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] flex items-center gap-2 text-xs">
                <Globe className="h-4 w-4 text-[var(--nezha-accent)] shrink-0" />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-[var(--nezha-ink)]">地区与线路:</span>
                  <span className="px-1.5 py-0.2 text-10 font-bold bg-[var(--nezha-ink)] text-[var(--nezha-panel)] rounded-none">
                    AUTO-DETECT
                  </span>
                  <span className="text-10 text-[var(--nezha-ink-3)]">公网 IP 自动映射</span>
                </div>
              </div>
            </div>
          </div>

          {/* Token Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] px-3.5 py-2.5 transition-colors">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-[var(--nezha-accent)] shrink-0" />
              <span className="font-bold text-[var(--nezha-ink)]">通信 Token:</span>
              <code className="text-xs font-mono font-bold px-2 py-0.5 border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-accent-ink)] dark:text-[var(--nezha-accent)]">
                {token.slice(0, 14)}...{token.slice(-6)}
              </code>
              <span className="text-11 text-[var(--nezha-ink-3)] hidden sm:inline">
                (已自动嵌入下方脚本)
              </span>
            </div>
            <button
              type="button"
              onClick={handleRegenerateToken}
              disabled={isRefreshingToken}
              className="h-7 px-2.5 text-11 font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
              aria-label="重新生成并更换一个新 Token"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshingToken ? "animate-spin" : ""}`} />
              <span>更换 Token</span>
            </button>
          </div>

          {tokenError && (
            <p className="text-rose-500 font-bold text-xs" role="alert">
              {tokenError}
            </p>
          )}

          {/* Section 1: One-click script */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-[var(--nezha-ink)]">
                [METHOD 1] Linux 一键脚本 (内置 Systemd 守护与开机自启)
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(oneClickCmd, "oneclick")}
                className="h-7 px-3 text-xs font-mono font-bold rounded-none bg-[var(--nezha-accent)] text-[#141414] hover:bg-[#E54D16] border border-[#141414]/20 transition-all cursor-pointer shadow-none flex items-center gap-1.5"
              >
                {copiedCmd === "oneclick" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedCmd === "oneclick" ? "已复制命令" : "复制命令"}</span>
              </button>
            </div>
            <pre className="p-3 sm:p-4 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-sea)] text-[var(--nezha-ink)] font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all select-all leading-relaxed">
              {oneClickCmd}
            </pre>
          </div>

          {/* Section 2: Direct Binary Execution */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-[var(--nezha-ink-2)]">
                [METHOD 2] 直接前台运行二进制 (免 root / 容器测试)
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(binaryCmd, "binary")}
                className="h-7 px-3 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] cursor-pointer flex items-center gap-1"
              >
                {copiedCmd === "binary" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedCmd === "binary" ? "已复制" : "复制命令"}</span>
              </button>
            </div>
            <pre className="p-3 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-sea)] text-[var(--nezha-ink)] font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all select-all">
              {binaryCmd}
            </pre>
          </div>

          {/* Tips */}
          <div className="text-11 border-t border-[var(--nezha-line-soft)] pt-3 flex flex-wrap justify-between gap-2 text-[var(--nezha-ink-3)] font-mono">
            <span>
              查看日志: <code className="font-bold text-[var(--nezha-ink)]">journalctl -u probe-agent -f</code>
            </span>
            <span>
              重启服务: <code className="font-bold text-[var(--nezha-ink)]">systemctl restart probe-agent</code>
            </span>
            <span>
              卸载清理: <code className="font-bold text-[var(--nezha-ink)]">bash install.sh --uninstall</code>
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 sm:px-6 sm:py-3.5 border-t border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] shrink-0 text-xs font-mono">
          <span className="mr-auto hidden sm:inline text-11 text-[var(--nezha-ink-3)]">
            目标机器执行命令后，主机会自动出现在监控与管理列表中
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] transition-colors cursor-pointer"
          >
            关闭窗口
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from "react";
import { X, Copy, Check, Terminal, RefreshCw, Globe, ShieldCheck, Zap } from "lucide-react";

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddNodeModal: React.FC<AddNodeModalProps> = ({ isOpen, onClose }) => {
  const [token, setToken] = useState<string>("sk_default_secret_probe_token");
  const [nodeName, setNodeName] = useState<string>("node-01");
  const [customRegion, setCustomRegion] = useState<string>("");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [isRefreshingToken, setIsRefreshingToken] = useState<boolean>(false);

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
    try {
      const res = await fetch("/api/v1/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: `Auto Token ${new Date().toLocaleTimeString()}` }),
      });
      if (res.ok) {
        const created = await res.json();
        setToken(created.token);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshingToken(false);
    }
  };

  // Construct commands (omit region flag if empty or auto so agent auto-detects)
  const regionFlag = customRegion.trim() && customRegion.trim().toLowerCase() !== "auto" 
    ? ` --region "${customRegion.trim()}"` 
    : "";

  const oneClickCmd = `curl -sSL ${httpUrl}/install.sh | sudo bash -s -- --server "${wsUrl}" --token "${token}" --name "${nodeName}"${regionFlag}`;
  const binaryCmd = `./probe-agent --server "${wsUrl}" --token "${token}" --name "${nodeName}"${regionFlag}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <Terminal className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">部署新探针节点 (Deploy Agent)</h3>
              <p className="text-xs text-zinc-400">Token 自动生成并内置于命令中 · 地区根据公网 IP 全自动识别</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Configuration inputs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          <div>
            <label className="block text-zinc-400 mb-1">节点名称 (Node Name)</label>
            <input
              type="text"
              value={nodeName}
              onChange={(e) => setNodeName(e.target.value)}
              placeholder="node-01"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3 text-sky-400" />
                所在地区 (Region)
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold">● 默认自动识别</span>
            </label>
            <input
              type="text"
              value={customRegion}
              onChange={(e) => setCustomRegion(e.target.value)}
              placeholder="留空自动识别 (或手动指定 HK, US 等)"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Token status & auto-generation banner */}
        <div className="mt-3 flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-xs font-mono">
          <div className="flex items-center gap-2 text-zinc-300">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>通信 Token:</span>
            <code className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {token.slice(0, 14)}...{token.slice(-6)}
            </code>
            <span className="text-[11px] text-zinc-500 hidden sm:inline">(已自动嵌入下方安装命令)</span>
          </div>
          <button
            onClick={handleRegenerateToken}
            disabled={isRefreshingToken}
            className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
            title="生成并换一个新的安全 Token"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshingToken ? "animate-spin" : ""}`} />
            <span>换一个 Token</span>
          </button>
        </div>

        {/* Section 1: One-click Auto Install (Highlighted) */}
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-3.5">
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <span className="font-bold text-emerald-400 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              推荐：Linux 一键全自动安装 (内置 Systemd 守护与开机自启)
            </span>
            <button
              onClick={() => copyToClipboard(oneClickCmd, "oneclick")}
              className="flex items-center gap-1 px-3 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold transition-colors border border-emerald-500/30 shadow-sm"
            >
              {copiedCmd === "oneclick" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedCmd === "oneclick" ? "已复制命令" : "一键复制命令"}</span>
            </button>
          </div>
          <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap select-all leading-relaxed">
            {oneClickCmd}
          </pre>
        </div>

        {/* Section 2: Direct Binary Execution */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400 mb-1">
            <span className="text-zinc-400">方式二：直接前台运行二进制 (免 root / 测试调试)</span>
            <button
              onClick={() => copyToClipboard(binaryCmd, "binary")}
              className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {copiedCmd === "binary" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedCmd === "binary" ? "已复制" : "复制命令"}</span>
            </button>
          </div>
          <pre className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap">
            {binaryCmd}
          </pre>
        </div>

        {/* Footer management tips */}
        <div className="mt-3 text-[11px] font-mono text-zinc-500 border-t border-zinc-800/60 pt-2.5 flex flex-wrap justify-between gap-2">
          <span>查看日志: journalctl -u probe-agent -f</span>
          <span>重启服务: systemctl restart probe-agent</span>
          <span>卸载程序: bash install.sh --uninstall</span>
        </div>
      </div>
    </div>
  );
};

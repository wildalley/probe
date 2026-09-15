import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Copy, Check, Terminal, RefreshCw, Globe, ShieldCheck, Zap } from "lucide-react";
import { cn } from "../lib/utils";
import { BorderBeam } from "./ui/BorderBeam";

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: "blueprint" | "dark";
}

export const AddNodeModal: React.FC<AddNodeModalProps> = ({ isOpen, onClose, theme = "dark" }) => {
  const [token, setToken] = useState<string>("sk_default_secret_probe_token");
  const [nodeName, setNodeName] = useState<string>("node-01");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [isRefreshingToken, setIsRefreshingToken] = useState<boolean>(false);

  const isBlueprint = theme === "blueprint";

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

  // Construct commands (agent auto-detects region and provider by default)
  const oneClickCmd = `curl -sSL ${httpUrl}/install.sh | sudo bash -s -- --server "${wsUrl}" --token "${token}" --name "${nodeName}"`;
  const binaryCmd = `./probe-agent --server "${wsUrl}" --token "${token}" --name "${nodeName}"`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.21, 0.47, 0.32, 0.98] }}
        className={cn(
          "relative w-full max-w-2xl rounded-2xl border p-6 shadow-2xl backdrop-blur-xl",
          isBlueprint
            ? "bg-white border-slate-200/90 text-slate-900 shadow-slate-300/60"
            : "bg-zinc-900/95 border-zinc-800 text-zinc-100 shadow-black/80"
        )}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between border-b pb-4 ${
            isBlueprint ? "border-slate-100" : "border-zinc-800"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2.5 rounded-xl border ${
                isBlueprint
                  ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              }`}
            >
              <Terminal className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-base font-bold font-sans ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                  部署新探针节点 (Deploy Agent)
                </h3>
                <span className="badge badge-success badge-sm badge-outline font-sans font-semibold">
                  智能免配置
                </span>
              </div>
              <p className={`text-xs font-sans mt-0.5 ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                Token 自动生成 · 地区与运营商根据公网 IP 全自动识别
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Configuration inputs: Node name & Auto-detect status */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs font-sans">
          <div>
            <label className={`block mb-1.5 font-medium ${isBlueprint ? "text-slate-700" : "text-zinc-300"}`}>
              节点名称 (Node Name)
            </label>
            <input
              type="text"
              value={nodeName}
              onChange={(e) => setNodeName(e.target.value)}
              placeholder="node-01"
              className={`input input-bordered input-sm w-full font-mono text-xs focus:outline-none ${
                isBlueprint
                  ? "bg-white border-slate-200 text-slate-900 focus:border-indigo-500"
                  : "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500"
              }`}
            />
          </div>

          <div className="flex flex-col justify-end">
            <div className={`p-2 rounded-xl border flex items-center gap-2 text-xs font-sans min-h-[38px] ${
              isBlueprint ? "bg-slate-50 border-slate-200 text-slate-700" : "bg-zinc-950/80 border-zinc-800 text-zinc-300"
            }`}>
              <Globe className="h-4 w-4 text-sky-500 shrink-0" />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">地区与线路:</span>
                <span className="badge badge-success badge-sm badge-outline font-semibold">● 全自动识别</span>
                <span className="text-11 text-slate-500 dark:text-zinc-500">免手动填写</span>
              </div>
            </div>
          </div>
        </div>

        {/* Token status & auto-generation banner */}
        <div
          className={`mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-sans ${
            isBlueprint
              ? "bg-slate-50 border-slate-200 text-slate-700"
              : "bg-zinc-950/80 border-zinc-800/80 text-zinc-300"
          }`}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
            <span className="font-medium">通信 Token:</span>
            <code className="text-emerald-600 dark:text-emerald-400 font-bold font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {token.slice(0, 14)}...{token.slice(-6)}
            </code>
            <span className={`text-11 hidden sm:inline ${isBlueprint ? "text-slate-500" : "text-zinc-500"}`}>
              (已自动嵌入安装命令)
            </span>
          </div>
          <button
            onClick={handleRegenerateToken}
            disabled={isRefreshingToken}
            className="btn btn-xs btn-ghost text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium gap-1 font-sans"
            title="生成并换一个新的安全 Token"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshingToken ? "animate-spin" : ""}`} />
            <span>换一个 Token</span>
          </button>
        </div>

        {/* Section 1: One-click Auto Install (Highlighted) */}
        <div
          className={cn(
            "relative mt-4 overflow-hidden rounded-xl border p-4",
            isBlueprint
              ? "bg-emerald-50/50 border-emerald-200"
              : "bg-emerald-950/15 border-emerald-500/30"
          )}
        >
          {/* Beam marks this out as the recommended path */}
          <BorderBeam size={140} duration={9} colorFrom="#34d399" colorTo="#22d3ee" />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-sans mb-2.5">
            <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-emerald-500" />
              推荐：Linux 一键全自动安装 (内置 Systemd 守护与开机自启)
            </span>
            <button
              onClick={() => copyToClipboard(oneClickCmd, "oneclick")}
              className="btn btn-sm btn-success text-white font-medium shadow-sm gap-1.5 font-sans"
            >
              {copiedCmd === "oneclick" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedCmd === "oneclick" ? "已复制命令" : "一键复制命令"}</span>
            </button>
          </div>
          <pre
            className={`p-3.5 rounded-xl border text-xs font-mono overflow-x-auto whitespace-pre-wrap select-all leading-relaxed ${
              isBlueprint
                ? "bg-slate-900 border-slate-800 text-emerald-400 font-semibold"
                : "bg-zinc-950 border-zinc-800 text-emerald-300"
            }`}
          >
            {oneClickCmd}
          </pre>
        </div>

        {/* Section 2: Direct Binary Execution */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between text-xs font-sans mb-1.5">
            <span className={isBlueprint ? "text-slate-600 font-medium" : "text-zinc-400"}>
              方式二：直接前台运行二进制 (免 root / 测试调试)
            </span>
            <button
              onClick={() => copyToClipboard(binaryCmd, "binary")}
              className="btn btn-xs btn-ghost text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium gap-1 font-sans"
            >
              {copiedCmd === "binary" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedCmd === "binary" ? "已复制" : "复制命令"}</span>
            </button>
          </div>
          <pre
            className={`p-3 rounded-xl border text-xs font-mono overflow-x-auto whitespace-pre-wrap select-all ${
              isBlueprint
                ? "bg-slate-100 border-slate-200 text-slate-800"
                : "bg-zinc-950 border-zinc-800 text-zinc-300"
            }`}
          >
            {binaryCmd}
          </pre>
        </div>

        {/* Footer management tips */}
        <div
          className={`mt-4 text-11 font-sans border-t pt-3 flex flex-wrap justify-between gap-2 ${
            isBlueprint ? "border-slate-100 text-slate-500" : "border-zinc-800/80 text-zinc-400"
          }`}
        >
          <span>查看日志: <code className="font-mono">journalctl -u probe-agent -f</code></span>
          <span>重启服务: <code className="font-mono">systemctl restart probe-agent</code></span>
          <span>卸载程序: <code className="font-mono">bash install.sh --uninstall</code></span>
        </div>
      </motion.div>
    </div>
  );
};


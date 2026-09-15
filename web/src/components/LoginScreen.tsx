import React, { useState } from "react";
import { Server, Lock, User, LogIn, AlertCircle, Eye, EyeOff, ShieldCheck } from "lucide-react";

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  theme: "blueprint" | "dark";
  /** Shown when anonymous read-only viewing is available. */
  allowPublicView?: boolean;
  onContinueAsGuest?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  theme,
  allowPublicView = false,
  onContinueAsGuest,
}) => {
  const isBlueprint = theme === "blueprint";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || submitting) return;

    setSubmitting(true);
    setError(null);
    const result = await onLogin(username.trim(), password);
    if (!result.ok) {
      setError(result.error || "登录失败");
      setPassword("");
    }
    setSubmitting(false);
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-4 ${
        isBlueprint ? "blueprint-grid text-slate-800" : "cyber-grid bg-zinc-950 text-zinc-100"
      }`}
    >
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-indigo-500/40 shadow-inner">
            <Server className="h-7 w-7 text-indigo-500" />
          </div>
          <h1
            className={`mt-4 text-xl font-bold tracking-wider font-mono uppercase ${
              isBlueprint ? "text-slate-900" : "text-zinc-100"
            }`}
          >
            CYBER<span className="text-indigo-500">PROBE</span>
          </h1>
          <p className={`mt-1 text-xs font-mono ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
            控制台登录 · Console Access
          </p>
        </div>

        {/* Login card */}
        <form
          onSubmit={handleSubmit}
          className={`rounded-2xl border p-6 ${
            isBlueprint
              ? "bg-white border-slate-200 shadow-sm"
              : "bg-zinc-900/60 border-zinc-800 backdrop-blur-xl"
          }`}
        >
          <div className="space-y-4">
            {/* Username */}
            <div>
              <label
                htmlFor="probe-username"
                className={`block text-[11px] font-mono mb-1.5 ${
                  isBlueprint ? "text-slate-500" : "text-zinc-400"
                }`}
              >
                USERNAME
              </label>
              <div className="relative">
                <User
                  className={`absolute left-3 top-2.5 h-4 w-4 ${
                    isBlueprint ? "text-slate-400" : "text-zinc-500"
                  }`}
                />
                <input
                  id="probe-username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className={`w-full rounded-lg border pl-9 pr-3 py-2 text-xs font-mono focus:outline-none transition-colors ${
                    isBlueprint
                      ? "bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500"
                      : "bg-zinc-950/60 border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:border-indigo-500"
                  }`}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="probe-password"
                className={`block text-[11px] font-mono mb-1.5 ${
                  isBlueprint ? "text-slate-500" : "text-zinc-400"
                }`}
              >
                PASSWORD
              </label>
              <div className="relative">
                <Lock
                  className={`absolute left-3 top-2.5 h-4 w-4 ${
                    isBlueprint ? "text-slate-400" : "text-zinc-500"
                  }`}
                />
                <input
                  id="probe-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full rounded-lg border pl-9 pr-10 py-2 text-xs font-mono focus:outline-none transition-colors ${
                    isBlueprint
                      ? "bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500"
                      : "bg-zinc-950/60 border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:border-indigo-500"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  className={`absolute right-2.5 top-2.5 transition-colors ${
                    isBlueprint
                      ? "text-slate-400 hover:text-slate-700"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-mono text-rose-500"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !username.trim() || !password}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-mono font-medium text-white transition-colors shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogIn className="h-4 w-4" />
              <span>{submitting ? "验证中..." : "登录控制台"}</span>
            </button>

            {allowPublicView && onContinueAsGuest && (
              <button
                type="button"
                onClick={onContinueAsGuest}
                className={`w-full text-center text-[11px] font-mono transition-colors ${
                  isBlueprint
                    ? "text-slate-500 hover:text-slate-800"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                以只读访客身份查看监控面板
              </button>
            )}
          </div>
        </form>

        <div
          className={`mt-5 flex items-start gap-2 text-[11px] font-mono ${
            isBlueprint ? "text-slate-500" : "text-zinc-500"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-px text-indigo-500" />
          <span>
            初始密码在服务端首次启动的日志中输出，登录后请立即修改。
          </span>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from "react";
import { Server, Lock, User, LogIn, AlertCircle, Eye, EyeOff, ShieldCheck, Terminal, Sun, Moon } from "lucide-react";
import { ThemeMode } from "../types";

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  theme?: ThemeMode;
  /** Shown when anonymous read-only viewing is available. */
  allowPublicView?: boolean;
  onContinueAsGuest?: () => void;
  guestButtonLabel?: string;
  onSelectTheme?: (theme: ThemeMode) => void;
  onToggleTheme?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  theme = "btop",
  allowPublicView = false,
  onContinueAsGuest,
  guestButtonLabel,
  onSelectTheme,
  onToggleTheme,
}) => {
  const isBlueprintLight = theme === "blueprint";
  const isBlueprintDark = theme === "blueprint-dark";
  const isBlueprint = isBlueprintLight || isBlueprintDark;
  const isBtopDark = theme === "btop";
  const isBtopLight = theme === "btop-light";
  const isBtop = isBtopDark || isBtopLight;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCycleTheme = () => {
    if (onToggleTheme) {
      onToggleTheme();
    } else if (onSelectTheme) {
      if (theme === "blueprint") onSelectTheme("blueprint-dark");
      else if (theme === "blueprint-dark") onSelectTheme("blueprint");
      else if (theme === "btop-light") onSelectTheme("btop");
      else if (theme === "btop") onSelectTheme("btop-light");
      else onSelectTheme("blueprint");
    }
  };

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
      className={`min-h-screen flex flex-col items-center justify-center px-4 relative transition-colors duration-200 ${
        isBlueprint
          ? "blueprint-grid text-slate-800 bg-slate-100/50"
          : isBtopLight
          ? "btop-light-grid text-[#2b2735] bg-[#ebe7ee]"
          : isBtopDark
          ? "btop-grid text-slate-100 bg-[#06080d]"
          : "cyber-grid bg-zinc-950 text-zinc-100"
      }`}
    >
      {/* Top Floating Theme Switcher */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={handleCycleTheme}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all cursor-pointer active:scale-95 ${
            isBlueprint
              ? "bg-white border-slate-200 text-slate-700 shadow-sm hover:border-slate-300"
              : isBtopLight
              ? "bg-[#ded8e6] border-[#aba4b8] text-[#2b2735] shadow-[0_2px_10px_rgba(0,0,0,0.06)] hover:border-[#7c5c99]"
              : isBtopDark
              ? "bg-[#0b101c] border-[#1b253b] text-cyan-400 hover:border-cyan-500/60 shadow-[0_0_12px_rgba(0,240,255,0.15)]"
              : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
          }`}
          title={`当前: ${
            isBtopLight
              ? "btop++ 亮色 (示例图同款)"
              : isBtopDark
              ? "btop++ 暗色终端"
              : isBlueprint
              ? "蓝图浅色"
              : "默认暗黑"
          } (点击切换)`}
        >
          {isBtopLight ? (
            <Terminal className="h-3.5 w-3.5 text-purple-700" />
          ) : isBtopDark ? (
            <Terminal className="h-3.5 w-3.5 text-cyan-400" />
          ) : isBlueprint ? (
            <Sun className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <Moon className="h-3.5 w-3.5 text-indigo-400" />
          )}
          <span>
            {isBtopLight
              ? "THEME: btop++ 亮色 (示例同款)"
              : isBtopDark
              ? "THEME: btop++ 暗色"
              : isBlueprint
              ? "主题: 蓝图"
              : "THEME: DARK"}
          </span>
        </button>
      </div>

      <div className="w-full max-w-md">
        {/* ======================= BTOP++ TERMINAL CONSOLE VIEW ======================= */}
        {isBtop ? (
          <div
            className={`border font-mono shadow-2xl transition-colors ${
              isBtopLight
                ? "border-[#aba4b8] bg-[#f2eef5] text-[#2b2735] shadow-[0_10px_35px_rgba(43,39,53,0.12)]"
                : "border-[#1b253b] bg-[#070b14] text-slate-100 shadow-[0_0_35px_rgba(0,240,255,0.08)]"
            }`}
          >
            {/* Terminal Window Titlebar */}
            <div
              className={`flex items-center justify-between border-b px-3.5 py-2 text-xs select-none ${
                isBtopLight
                  ? "border-[#aba4b8] bg-[#ded8e6] text-[#2b2735]"
                  : "border-[#1b253b] bg-[#0b101c] text-slate-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500 inline-block opacity-85" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block opacity-85" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block opacity-85" />
                <span className="ml-2 font-bold tracking-tight">
                  btop++ v1.3.2 · [ SECURITY GATEWAY ]
                </span>
              </div>
              <span
                className={`text-[10px] font-bold ${
                  isBtopLight ? "text-[#7c5c99]" : "text-cyan-400"
                }`}
              >
                TTY1 · {isBtopLight ? "LIGHT" : "DARK"}
              </span>
            </div>

            {/* Terminal Window Header Banner */}
            <div
              className={`p-4 sm:p-5 border-b ${
                isBtopLight
                  ? "border-[#aba4b8]/60 bg-[#ebe7ee]/80"
                  : "border-[#1b253b]/70 bg-[#090e1a]/60"
              }`}
            >
              <div
                className={`flex items-center justify-between text-xs font-semibold mb-1 ${
                  isBtopLight ? "text-[#7c5c99]" : "text-cyan-400"
                }`}
              >
                <span>┌─ [ CYBERPROBE++ SYSTEM MONITOR ]</span>
                <span className="text-emerald-600 font-bold">● STANDBY</span>
              </div>
              <p
                className={`text-[11px] pl-3 ${
                  isBtopLight ? "text-[#6e687e]" : "text-slate-400"
                }`}
              >
                Operator credentials required to access cluster telemetry and node administration.
              </p>
            </div>

            {/* Terminal Form */}
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
              <div>
                <label
                  htmlFor="probe-username"
                  className={`block text-11 font-mono font-semibold mb-1 tracking-wider ${
                    isBtopLight ? "text-[#352f44]" : "text-cyan-400"
                  }`}
                >
                  [ USERNAME ] ❯
                </label>
                <div className="relative">
                  <User
                    className={`absolute left-3 top-2.5 h-4 w-4 ${
                      isBtopLight ? "text-[#7c5c99]" : "text-cyan-500"
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
                    className={`w-full pl-9 pr-3 py-2 text-xs font-mono focus:outline-none transition-colors ${
                      isBtopLight
                        ? "bg-[#ebe7ee] border border-[#aba4b8] text-[#2b2735] placeholder-[#9e97ab] focus:border-[#7c5c99] focus:ring-1 focus:ring-[#7c5c99]/30"
                        : "bg-[#0b101c] border border-[#1b253b] text-slate-100 placeholder-slate-600 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="probe-password"
                  className={`block text-11 font-mono font-semibold mb-1 tracking-wider ${
                    isBtopLight ? "text-[#352f44]" : "text-cyan-400"
                  }`}
                >
                  [ PASSWORD ] ❯
                </label>
                <div className="relative">
                  <Lock
                    className={`absolute left-3 top-2.5 h-4 w-4 ${
                      isBtopLight ? "text-[#7c5c99]" : "text-cyan-500"
                    }`}
                  />
                  <input
                    id="probe-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full pl-9 pr-10 py-2 text-xs font-mono focus:outline-none transition-colors ${
                      isBtopLight
                        ? "bg-[#ebe7ee] border border-[#aba4b8] text-[#2b2735] placeholder-[#9e97ab] focus:border-[#7c5c99] focus:ring-1 focus:ring-[#7c5c99]/30"
                        : "bg-[#0b101c] border border-[#1b253b] text-slate-100 placeholder-slate-600 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    className={`absolute right-2.5 top-2.5 transition-colors cursor-pointer ${
                      isBtopLight
                        ? "text-[#6e687e] hover:text-[#2b2735]"
                        : "text-slate-500 hover:text-cyan-300"
                    }`}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Error Output */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-mono text-rose-600 dark:text-rose-400"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
                  <span>[ERROR] {error}</span>
                </div>
              )}

              {/* Terminal Submit Button */}
              <button
                type="submit"
                disabled={submitting || !username.trim() || !password}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-mono font-bold tracking-wider transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] ${
                  isBtopLight
                    ? "border border-[#352f44] bg-[#352f44] text-[#f2eef5] hover:bg-[#483d56] shadow-md shadow-[#352f44]/20"
                    : "border border-cyan-400 bg-cyan-400 hover:bg-cyan-300 text-[#06080d] shadow-[0_0_15px_rgba(0,240,255,0.4)]"
                }`}
              >
                <LogIn className="h-4 w-4" />
                <span>{submitting ? "AUTHENTICATING..." : "[ ↵ EXECUTE LOGIN (ENTER) ]"}</span>
              </button>

              {allowPublicView && onContinueAsGuest && (
                <button
                  type="button"
                  onClick={onContinueAsGuest}
                  className={`w-full text-center text-xs font-mono py-1.5 transition-colors cursor-pointer border ${
                    isBtopLight
                      ? "text-[#7c5c99] border-[#aba4b8] hover:bg-[#ebe7ee]"
                      : "text-cyan-400/80 hover:text-cyan-300 border-[#1b253b] hover:border-cyan-500/40"
                  }`}
                >
                  [ ⇥ CONTINUE AS READ-ONLY GUEST ]
                </button>
              )}
            </form>

            {/* Terminal Window Footer */}
            <div
              className={`border-t px-3.5 py-2 text-[10px] flex items-center justify-between ${
                isBtopLight
                  ? "border-[#aba4b8] bg-[#ded8e6] text-[#6e687e]"
                  : "border-[#1b253b] bg-[#0b101c] text-slate-500"
              }`}
            >
              <span>└─ [ PORT: 8080 · SQLite ]</span>
              <span className={isBtopLight ? "text-[#352f44] font-semibold" : "text-cyan-400/80"}>
                DEFAULT PASS: admin / admin123
              </span>
            </div>
          </div>
        ) : (
          /* ======================= DEFAULT / BLUEPRINT VIEW ======================= */
          <>
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
              <p className={`mt-1 text-xs font-sans ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
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
                    className={`block text-11 font-mono mb-1.5 ${
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
                    className={`block text-11 font-mono mb-1.5 ${
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
                      className={`absolute right-2.5 top-2.5 transition-colors cursor-pointer ${
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
                    className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-sans text-rose-500"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting || !username.trim() || !password}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-sans font-medium text-white transition-colors shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <LogIn className="h-4 w-4" />
                  <span>{submitting ? "验证中..." : "登录控制台"}</span>
                </button>

                {allowPublicView && onContinueAsGuest && (
                  <button
                    type="button"
                    onClick={onContinueAsGuest}
                    className={`w-full text-center text-11 font-sans transition-colors cursor-pointer ${
                      isBlueprint
                        ? "text-slate-500 hover:text-slate-800"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {guestButtonLabel || "以只读访客身份查看监控面板"}
                  </button>
                )}
              </div>
            </form>

            <div
              className={`mt-5 flex items-start gap-2 text-11 font-sans ${
                isBlueprint ? "text-slate-500" : "text-zinc-500"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-px text-indigo-500" />
              <span>
                初始密码在服务端首次启动的日志中输出，登录后请立即修改。
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

import React, { useState } from "react";
import { Lock, User, LogIn, AlertCircle, Eye, EyeOff, Sun, Moon } from "lucide-react";
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
  const isDark = theme === "btop" || theme === "blueprint-dark" || theme === "dark";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCycleTheme = () => {
    if (onToggleTheme) {
      onToggleTheme();
    } else if (onSelectTheme) {
      if (theme === "btop-light" || theme === "blueprint") onSelectTheme("btop");
      else onSelectTheme("btop-light");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || submitting) return;

    setSubmitting(true);
    setError(null);
    const result = await onLogin(username.trim(), password);
    if (!result.ok) {
      setError(result.error || "登录失败: 凭证无效");
      setPassword("");
    }
    setSubmitting(false);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 relative nezha-grid bg-[var(--nezha-sea)] text-[var(--nezha-ink)] font-mono transition-colors duration-200"
    >
      {/* Top Floating Theme Switcher */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={handleCycleTheme}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] text-xs font-mono font-semibold transition-all cursor-pointer hover:border-[var(--nezha-ink)] active:scale-95 shadow-xs"
          title={`当前: ${isDark ? "暗色模式" : "暖白纸质亮色"} (点击切换)`}
        >
          {isDark ? (
            <Moon className="h-3.5 w-3.5 text-[var(--nezha-accent)]" />
          ) : (
            <Sun className="h-3.5 w-3.5 text-[var(--nezha-accent)]" />
          )}
          <span>THEME: {isDark ? "DARK SLATE" : "WARM CANVAS"}</span>
        </button>
      </div>

      <div className="w-full max-w-md">
        {/* ======================= NEZHA INDUSTRIAL AUTH CONSOLE ======================= */}
        <div
          className="rounded-none border-1.5 border-[var(--nezha-line)] bg-[var(--nezha-panel)] shadow-2xl transition-colors overflow-hidden"
        >
          {/* Terminal Window Titlebar */}
          <div
            className="flex items-center justify-between border-b border-[var(--nezha-line)] px-3.5 py-2 text-xs select-none bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)]"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-none bg-[var(--nezha-accent)] inline-block" />
              <span className="font-bold tracking-tight">
                PROBE · SECURITY GATEWAY
              </span>
            </div>
            <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 bg-[var(--nezha-ink)] text-[var(--nezha-panel)] rounded-none">
              TTY1 // AUTH
            </span>
          </div>

          {/* Terminal Window Header Banner */}
          <div
            className="p-4 sm:p-5 border-b border-[var(--nezha-line)] bg-[var(--nezha-panel)]"
          >
            <div className="flex items-center justify-between text-xs font-bold mb-1 text-[var(--nezha-accent-ink)] dark:text-[var(--nezha-accent)]">
              <span>┌─ [ CONTROL ACCESS · 探针中枢管理后台 ]</span>
              <span className="text-emerald-600 font-bold">● STANDBY</span>
            </div>
            <p className="text-[11px] pl-3 text-[var(--nezha-ink-3)] font-mono">
              Operator credentials required to access cluster telemetry, billing and node administration.
            </p>
          </div>

          {/* Terminal Form */}
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 font-mono">
            <div>
              <label
                htmlFor="probe-username"
                className="block text-11 font-mono font-bold mb-1 tracking-wider text-[var(--nezha-accent-ink)] dark:text-[var(--nezha-accent)]"
              >
                [ USERNAME ] ❯
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-[var(--nezha-ink-3)]" />
                <input
                  id="probe-username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] placeholder-[var(--nezha-ink-3)] focus:outline-none focus:border-[var(--nezha-accent)] focus:ring-1 focus:ring-[var(--nezha-accent)] transition-colors"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="probe-password"
                className="block text-11 font-mono font-bold mb-1 tracking-wider text-[var(--nezha-accent-ink)] dark:text-[var(--nezha-accent)]"
              >
                [ PASSWORD ] ❯
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[var(--nezha-ink-3)]" />
                <input
                  id="probe-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2 text-xs font-mono rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] placeholder-[var(--nezha-ink-3)] focus:outline-none focus:border-[var(--nezha-accent)] focus:ring-1 focus:ring-[var(--nezha-accent)] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  className="absolute right-2.5 top-2.5 transition-colors cursor-pointer text-[var(--nezha-ink-3)] hover:text-[var(--nezha-ink)]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error Output */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-mono text-rose-600 dark:text-rose-400 rounded-none"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
                <span>[ERROR] {error}</span>
              </div>
            )}

            {/* Terminal Submit Button in Safety Orange */}
            <button
              type="submit"
              disabled={submitting || !username.trim() || !password}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-mono font-bold tracking-wider rounded-none transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] border border-[#141414]/30 bg-[var(--nezha-accent)] text-[#141414] hover:bg-[#E54D16] shadow-none"
            >
              <LogIn className="h-4 w-4" />
              <span>{submitting ? "AUTHENTICATING..." : "[ ↵ EXECUTE LOGIN (ENTER) ]"}</span>
            </button>

            {allowPublicView && onContinueAsGuest && (
              <button
                type="button"
                onClick={onContinueAsGuest}
                className="w-full text-center text-xs font-mono py-1.5 transition-colors cursor-pointer rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)]"
              >
                {guestButtonLabel ? `[ ⇥ ${guestButtonLabel} ]` : "[ ⇥ CONTINUE AS READ-ONLY GUEST ]"}
              </button>
            )}
          </form>

          {/* Terminal Window Footer */}
          <div
            className="border-t border-[var(--nezha-line)] px-3.5 py-2 text-[10px] font-mono flex items-center justify-between bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink-3)]"
          >
            <span>└─ [ HOST: {window.location.host} ]</span>
            <span className="text-[var(--nezha-accent-ink)] dark:text-[var(--nezha-accent)] font-semibold">
              初始密码见服务端启动日志
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

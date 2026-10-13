import React, { useState } from "react";
import { X, KeyRound, ShieldAlert, AlertCircle, Check, Eye, EyeOff } from "lucide-react";
import { ThemeMode } from "../types";

interface ChangePasswordModalProps {
  isOpen: boolean;
  /** When true the dialog cannot be dismissed (bootstrap password still in use). */
  forced?: boolean;
  onClose: () => void;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  theme?: ThemeMode;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  forced = false,
  onClose,
  onSubmit,
}) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (newPassword.length < 8) {
      setError("新密码至少需要 8 位字符");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    if (newPassword === currentPassword) {
      setError("新密码不能与当前密码相同");
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await onSubmit(currentPassword, newPassword);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error || "修改失败");
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      reset();
      onClose();
    }, 1200);
  };

  const inputClass = "w-full rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] px-3 py-2 text-xs font-mono transition-colors focus:outline-none focus:border-[var(--nezha-accent)] focus:ring-1 focus:ring-[var(--nezha-accent)]";

  const labelClass = "mb-1.5 block text-11 font-mono uppercase tracking-wider font-bold text-[var(--nezha-ink)]";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 font-mono">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={forced ? undefined : onClose}
      />

      <div
        className="relative w-full max-w-md rounded-none border-1.5 border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] shadow-2xl"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] px-5 py-3.5"
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-none border border-[var(--nezha-line)] ${
                forced ? "bg-[var(--nezha-accent)] text-[#141414]" : "bg-[var(--nezha-panel)] text-[var(--nezha-accent)]"
              }`}
            >
              {forced ? (
                <ShieldAlert className="h-4 w-4" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold tracking-tight text-[var(--nezha-ink)]">
                {forced ? "[ SECURITY · 请设置新密码 ]" : "[ AUTH · 修改管理密码 ]"}
              </h2>
              <p className="text-10 text-[var(--nezha-ink-3)] font-mono">
                {forced ? "当前使用服务端随机生成的临时凭证" : "修改后其他设备需重新登录"}
              </p>
            </div>
          </div>

          {!forced && (
            <button
              onClick={onClose}
              className="p-1 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] hover:bg-[var(--nezha-accent)] hover:text-[#141414] text-[var(--nezha-ink)] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5 font-mono">
          {forced && (
            <div className="flex items-start gap-2 rounded-none border border-[var(--nezha-accent)]/50 bg-[var(--nezha-accent-soft)] px-3 py-2.5">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--nezha-accent-ink)] dark:text-[var(--nezha-accent)]" />
              <p className="text-11 leading-relaxed text-[var(--nezha-ink)]">
                初始密码由服务端随机生成并打印在启动日志中。为保证集群控制安全，请立即设置你的密码。
              </p>
            </div>
          )}

          <div>
            <label className={labelClass}>[01] 当前管理密码</label>
            <input
              type={showPasswords ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="输入当前密码"
              className={inputClass}
              disabled={submitting || success}
            />
          </div>

          <div>
            <label className={labelClass}>[02] 新设密码</label>
            <input
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="至少 8 位字符"
              className={inputClass}
              disabled={submitting || success}
            />
          </div>

          <div>
            <label className={labelClass}>[03] 确认新密码</label>
            <input
              type={showPasswords ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="再次输入新密码"
              className={inputClass}
              disabled={submitting || success}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowPasswords((v) => !v)}
            className="flex items-center gap-1.5 text-11 font-mono text-[var(--nezha-ink-3)] hover:text-[var(--nezha-ink)] transition-colors cursor-pointer"
          >
            {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{showPasswords ? "隐藏密码" : "显示密码"}</span>
          </button>

          {error && (
            <div className="flex items-start gap-2 rounded-none border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-500 text-xs">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-none border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span>[OK] 密码已成功更新</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting || success || !currentPassword || !newPassword || !confirmPassword}
              className="flex flex-1 items-center justify-center gap-2 rounded-none bg-[var(--nezha-accent)] hover:bg-[#E54D16] px-4 py-2 text-xs font-mono font-bold text-[#141414] border border-[#141414]/30 transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer shadow-none"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>{submitting ? "提交中..." : "确认修改密码"}</span>
            </button>

            {!forced && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] text-[var(--nezha-ink)] px-4 py-2 text-xs font-mono font-bold transition-colors cursor-pointer"
              >
                取消
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

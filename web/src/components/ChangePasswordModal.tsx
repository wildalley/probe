import React, { useState } from "react";
import { X, KeyRound, ShieldAlert, AlertCircle, Check, Eye, EyeOff } from "lucide-react";

interface ChangePasswordModalProps {
  isOpen: boolean;
  /** When true the dialog cannot be dismissed (bootstrap password still in use). */
  forced?: boolean;
  onClose: () => void;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  theme: "blueprint" | "dark";
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  forced = false,
  onClose,
  onSubmit,
  theme,
}) => {
  const isBlueprint = theme === "blueprint";

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

  const inputClass = `w-full rounded-lg border px-3 py-2 text-xs font-mono transition-colors focus:outline-none ${
    isBlueprint
      ? "bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500"
      : "bg-zinc-900/80 border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-indigo-500"
  }`;

  const labelClass = `mb-1.5 block text-[11px] font-mono uppercase tracking-wider ${
    isBlueprint ? "text-slate-500" : "text-zinc-400"
  }`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 backdrop-blur-sm ${isBlueprint ? "bg-slate-900/30" : "bg-black/70"}`}
        onClick={forced ? undefined : onClose}
      />

      <div
        className={`relative w-full max-w-md rounded-2xl border shadow-2xl ${
          isBlueprint ? "bg-white border-slate-200" : "bg-zinc-950 border-zinc-800"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between border-b px-5 py-4 ${
            isBlueprint ? "border-slate-200" : "border-zinc-800"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                forced
                  ? "bg-amber-500/10 border-amber-500/30"
                  : isBlueprint
                  ? "bg-indigo-50 border-indigo-200"
                  : "bg-indigo-500/10 border-indigo-500/30"
              }`}
            >
              {forced ? (
                <ShieldAlert className="h-4.5 w-4.5 text-amber-500" />
              ) : (
                <KeyRound className="h-4.5 w-4.5 text-indigo-500" />
              )}
            </div>
            <div>
              <h2 className={`text-sm font-bold font-mono ${isBlueprint ? "text-slate-900" : "text-zinc-100"}`}>
                {forced ? "请修改初始密码" : "修改登录密码"}
              </h2>
              <p className={`text-[11px] font-mono ${isBlueprint ? "text-slate-500" : "text-zinc-400"}`}>
                {forced ? "当前使用系统生成的临时密码" : "修改后其他设备需重新登录"}
              </p>
            </div>
          </div>

          {!forced && (
            <button
              onClick={onClose}
              className={`rounded-lg p-1.5 transition-colors ${
                isBlueprint ? "text-slate-400 hover:bg-slate-100" : "text-zinc-500 hover:bg-zinc-800"
              }`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {forced && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <p className={`text-[11px] font-mono leading-relaxed ${isBlueprint ? "text-amber-700" : "text-amber-300"}`}>
                初始密码由服务端随机生成并打印在启动日志中。为保证集群安全，请立即设置你自己的密码。
              </p>
            </div>
          )}

          <div>
            <label className={labelClass}>当前密码</label>
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
            <label className={labelClass}>新密码</label>
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
            <label className={labelClass}>确认新密码</label>
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
            className={`flex items-center gap-1.5 text-[11px] font-mono transition-colors ${
              isBlueprint ? "text-slate-500 hover:text-slate-800" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{showPasswords ? "隐藏密码" : "显示密码"}</span>
          </button>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
              <span className={`text-[11px] font-mono ${isBlueprint ? "text-rose-700" : "text-rose-300"}`}>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span className={`text-[11px] font-mono ${isBlueprint ? "text-emerald-700" : "text-emerald-300"}`}>
                密码已更新
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting || success || !currentPassword || !newPassword || !confirmPassword}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-mono font-semibold text-white shadow-lg shadow-indigo-600/25 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>{submitting ? "提交中..." : "确认修改"}</span>
            </button>

            {!forced && (
              <button
                type="button"
                onClick={onClose}
                className={`rounded-lg border px-4 py-2.5 text-xs font-mono transition-colors ${
                  isBlueprint
                    ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
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

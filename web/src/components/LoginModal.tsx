import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button, Input } from "@heroui/react";
import { KeyRound, Lock, ShieldCheck, User, X } from "lucide-react";
import { cn } from "../lib/utils";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  theme?: "blueprint" | "dark";
}

/**
 * Admin sign-in. The dashboard itself stays public, so this only gates the
 * management console and the write endpoints behind it.
 */
export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  theme = "dark",
}) => {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isBlueprint = theme === "blueprint";

  // Clear the password whenever the dialog reopens so it is never left sitting
  // in component state after a close.
  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      setError("请输入用户名和密码");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }
      setPassword("");
      onSuccess();
    } catch {
      setError("无法连接服务端");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={cn(
          "relative w-full max-w-sm rounded-2xl border p-6 shadow-2xl",
          isBlueprint
            ? "border-slate-200 bg-white text-slate-800"
            : "border-zinc-800 bg-zinc-900 text-zinc-100"
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          onPress={onClose}
          aria-label="关闭"
          className="absolute right-3 top-3"
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/40 bg-gradient-to-br from-indigo-500/20 to-cyan-500/20">
            <ShieldCheck className="h-5 w-5 text-indigo-500" />
          </div>
          <div>
            <h3 className="font-sans text-base font-bold">管理员登录</h3>
            <p
              className={cn(
                "font-sans text-11",
                isBlueprint ? "text-slate-500" : "text-zinc-400"
              )}
            >
              管理后台需要身份验证
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3 font-sans text-xs">
          <div>
            <label
              className={cn(
                "mb-1 block font-medium",
                isBlueprint ? "text-slate-700" : "text-zinc-300"
              )}
            >
              用户名
            </label>
            <div className="relative">
              <User
                className={cn(
                  "pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2",
                  isBlueprint ? "text-slate-400" : "text-zinc-500"
                )}
              />
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                aria-label="用户名"
                className="w-full pl-9 font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label
              className={cn(
                "mb-1 block font-medium",
                isBlueprint ? "text-slate-700" : "text-zinc-300"
              )}
            >
              密码
            </label>
            <div className="relative">
              <Lock
                className={cn(
                  "pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2",
                  isBlueprint ? "text-slate-400" : "text-zinc-500"
                )}
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                autoComplete="current-password"
                aria-label="密码"
                className="w-full pl-9 font-mono text-xs"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-11 text-rose-500">
              {error}
            </p>
          )}

          <Button
            variant="primary"
            size="sm"
            fullWidth
            isDisabled={submitting}
            onPress={handleSubmit}
            className="gap-1.5 font-sans font-medium"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>{submitting ? "验证中..." : "登录"}</span>
          </Button>

          <p
            className={cn(
              "text-11 leading-relaxed",
              isBlueprint ? "text-slate-400" : "text-zinc-500"
            )}
          >
            首次启动时，服务端会在日志中打印随机生成的初始密码。也可通过
            <code className="mx-1 font-mono">PROBE_ADMIN_PASSWORD</code>
            环境变量预设。
          </p>
        </div>
      </motion.div>
    </div>
  );
};

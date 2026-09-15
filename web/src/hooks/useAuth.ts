import { useCallback, useEffect, useState } from "react";

export interface AuthState {
  /** Undefined while the initial status probe is in flight. */
  ready: boolean;
  authenticated: boolean;
  username: string | null;
  /** True when the account still uses its generated bootstrap password. */
  mustChangePassword: boolean;
  /** True when the server allows anonymous read-only dashboard views. */
  publicView: boolean;
}

const initialState: AuthState = {
  ready: false,
  authenticated: false,
  username: null,
  mustChangePassword: false,
  publicView: true,
};

/**
 * useAuth owns the dashboard session lifecycle. The session itself lives in an
 * HttpOnly cookie, so nothing sensitive is kept in JS or localStorage; this hook
 * only mirrors the server's view of it.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>(initialState);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/status", { credentials: "same-origin" });
      const data = await res.json();
      setState({
        ready: true,
        authenticated: Boolean(data.authenticated),
        username: data.username ?? null,
        mustChangePassword: Boolean(data.must_change_password),
        publicView: data.public_view !== false,
      });
    } catch {
      // Network failure: treat as logged out but keep the UI usable.
      setState((prev) => ({ ...prev, ready: true, authenticated: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (username: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/v1/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (res.status === 429) {
            return { ok: false, error: "失败次数过多，请稍后再试" };
          }
          return { ok: false, error: data.error === "invalid username or password" ? "用户名或密码错误" : data.error || "登录失败" };
        }

        setState({
          ready: true,
          authenticated: true,
          username: data.username ?? username,
          mustChangePassword: Boolean(data.must_change_password),
          publicView: state.publicView,
        });
        return { ok: true };
      } catch {
        return { ok: false, error: "无法连接服务端" };
      }
    },
    [state.publicView]
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      // Ignore: clear local state regardless so the UI does not appear stuck.
    }
    setState((prev) => ({
      ready: true,
      authenticated: false,
      username: null,
      mustChangePassword: false,
      publicView: prev.publicView,
    }));
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/v1/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (res.status === 401) return { ok: false, error: "当前密码不正确" };
          if (res.status === 400) return { ok: false, error: "新密码至少需要 8 位字符" };
          return { ok: false, error: data.error || "修改失败" };
        }

        setState((prev) => ({ ...prev, mustChangePassword: false }));
        return { ok: true };
      } catch {
        return { ok: false, error: "无法连接服务端" };
      }
    },
    []
  );

  return { ...state, login, logout, changePassword, refresh };
}

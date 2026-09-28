import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, clearSession, getAccessToken, getRefreshToken, setSession, ApiError } from "./api.js";

interface Membership {
  organisationId: string;
  organisationName: string;
  role: string;
}

interface AuthUser {
  id: string;
  email: string;
  status: string;
  displayName: string | null;
  memberships: Membership[];
}

interface Session {
  user: { id: string; email: string };
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Staff can belong to more than one organisation; every org-scoped
  // screen (scope grants, vacancies, assurance) acts on this one. Not
  // persisted across reloads on purpose — always start from a deliberate
  // choice rather than a silently stale one.
  activeOrgId: string | null;
  setActiveOrgId: (id: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    try {
      const me = await apiFetch<AuthUser>("/v1/auth/me");
      setUser(me);
      setActiveOrgId((current) => current ?? me.memberships[0]?.organisationId ?? null);
    } catch {
      clearSession();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (getAccessToken() || getRefreshToken()) {
      loadMe().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [loadMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await apiFetch<Session>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession(session.accessToken, session.refreshToken);
      await loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await apiFetch("/v1/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
      }
    } catch {
      // Best-effort server-side revoke — clear the local session either way.
    }
    clearSession();
    setUser(null);
    setActiveOrgId(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, activeOrgId, setActiveOrgId }),
    [user, loading, login, logout, activeOrgId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
export type { AuthUser, Membership };

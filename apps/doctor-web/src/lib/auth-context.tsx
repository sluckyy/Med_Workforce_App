import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, clearSession, getAccessToken, getRefreshToken, setSession, ApiError } from "./api.js";

interface Membership {
  organisationId: string;
  role: string;
}

interface AuthUser {
  id: string;
  email: string;
  status: string;
  mfaEnabled: boolean;
  displayName: string | null;
  practitionerId: string | null;
  memberships: Membership[];
}

interface Session {
  user: { id: string; email: string; practitionerId: string | null };
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const me = await apiFetch<AuthUser>("/v1/auth/me");
      setUser(me);
    } catch {
      clearSession();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // On load, only try /me if we have *some* token to work with — avoids
    // a pointless 401 round-trip for a visitor who was never logged in.
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

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const session = await apiFetch<Session>("/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, displayName }),
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
        await apiFetch("/v1/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      // Best-effort server-side revoke — clear the local session either way.
    }
    clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
export type { AuthUser };

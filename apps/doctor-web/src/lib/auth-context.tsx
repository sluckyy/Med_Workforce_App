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
  remainingBackupCodes?: number;
}

interface MfaChallenge {
  mfaRequired: true;
  mfaChallengeToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  // Resolves to an MfaChallenge when the account has MFA enabled — the
  // caller must then collect a code and call mfaLogin. No session exists
  // yet at that point.
  login: (email: string, password: string) => Promise<MfaChallenge | void>;
  mfaLogin: (mfaChallengeToken: string, code: string) => Promise<{ remainingBackupCodes?: number }>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
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
    async (email: string, password: string): Promise<MfaChallenge | void> => {
      const result = await apiFetch<Session | MfaChallenge>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if ("mfaRequired" in result) {
        return result;
      }
      setSession(result.accessToken, result.refreshToken);
      await loadMe();
    },
    [loadMe],
  );

  const mfaLogin = useCallback(
    async (mfaChallengeToken: string, code: string) => {
      const session = await apiFetch<Session>("/v1/auth/mfa/login", {
        method: "POST",
        body: JSON.stringify({ mfaChallengeToken, code }),
      });
      setSession(session.accessToken, session.refreshToken);
      await loadMe();
      return { remainingBackupCodes: session.remainingBackupCodes };
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
    <AuthContext.Provider value={{ user, loading, login, mfaLogin, register, logout, refreshUser: loadMe }}>
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

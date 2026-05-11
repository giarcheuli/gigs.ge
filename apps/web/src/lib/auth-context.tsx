'use client';

/**
 * Auth context for apps/web.
 *
 * Stores the access token in React state (in-memory — cleared on reload).
 * On mount, attempts a silent token refresh so the user stays logged in
 * across page reloads as long as their httpOnly refresh_token cookie is valid.
 *
 * The access token module (lib/api.ts) is kept in sync so the apiFetch
 * wrapper always has the latest token without needing the React context.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { setAccessToken, silentRefresh } from '@/lib/api';

export interface AuthUser {
  id: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  dateOfBirth: string;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  /** true while the initial silent-refresh check is in progress */
  loading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  /** Re-fetch /auth/me and update the user object (e.g. after OTP verification) */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, _setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /** Sync both React state and the module-level variable in one call. */
  const applyToken = useCallback((token: string | null) => {
    setAccessToken(token);
    _setAccessToken(token);
  }, []);

  const fetchMe = useCallback(async (token: string): Promise<AuthUser | null> => {
    try {
      const res = await fetch(`${BASE}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (res.ok) {
        const data = (await res.json()) as { user: AuthUser };
        return data.user;
      }
    } catch {
      // network error
    }
    return null;
  }, []);

  // Attempt silent refresh on mount to restore session after page reload.
  useEffect(() => {
    (async () => {
      const refreshed = await silentRefresh();
      if (refreshed) {
        const { getAccessToken } = await import('@/lib/api');
        const token = getAccessToken();
        if (token) {
          applyToken(token);
          const me = await fetchMe(token);
          setUser(me);
        }
      }
      setLoading(false);
    })();
  }, [applyToken, fetchMe]);

  const login = useCallback(
    (token: string, userObj: AuthUser) => {
      applyToken(token);
      setUser(userObj);
    },
    [applyToken],
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${BASE}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
    } catch {
      // ignore — clear state regardless
    }
    applyToken(null);
    setUser(null);
  }, [accessToken, applyToken]);

  const refreshUser = useCallback(async () => {
    if (!accessToken) return;
    const me = await fetchMe(accessToken);
    if (me) setUser(me);
  }, [accessToken, fetchMe]);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

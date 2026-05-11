'use client';

/**
 * Auth context — keeps the current user in React state across the whole app.
 *
 * On mount, AuthProvider attempts a silent token refresh so that a page reload
 * does not log the user out (the refresh token lives in an httpOnly cookie).
 *
 * login()  — called after a successful register or login API response.
 * logout() — calls the logout endpoint, clears state.
 * refreshUser() — re-fetches /auth/me to pick up profile changes.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { setAccessToken, silentRefresh, apiFetch } from './api';

export interface AuthUser {
  id: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  dateOfBirth: string | null;
  createdAt: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Attempt silent refresh on every page load. If it fails the user is
    // simply unauthenticated — no redirect here (pages handle that).
    silentRefresh()
      .then(async (token) => {
        if (!token) return;
        const res = await apiFetch('/auth/me');
        if (res.ok) {
          const body = (await res.json()) as { user: AuthUser };
          setUser(body.user);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function login(token: string, newUser: AuthUser) {
    setAccessToken(token);
    setUser(newUser);
  }

  async function logout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore network errors on logout
    }
    setAccessToken(null);
    setUser(null);
  }

  async function refreshUser() {
    const res = await apiFetch('/auth/me');
    if (res.ok) {
      const body = (await res.json()) as { user: AuthUser };
      setUser(body.user);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

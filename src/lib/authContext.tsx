import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api';

interface AuthContextValue {
  loading: boolean;
  authenticated: boolean;
  authEnabled: boolean;
  refresh: () => Promise<void>;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/session');
      if (res.ok) {
        const data = await res.json();
        setAuthEnabled(Boolean(data.authEnabled));
        setAuthenticated(Boolean(data.authenticated));
      } else if (res.status === 401) {
        setAuthEnabled(true);
        setAuthenticated(false);
      }
    } catch {
      // API not configured/reachable => local mode
      setAuthEnabled(false);
      setAuthenticated(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (password: string) => {
    const res = await apiFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || 'Login failed');
    }
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/logout', { method: 'POST' });
    } finally {
      await refresh();
    }
  }, [refresh]);

  const value = useMemo(() => ({ loading, authenticated, authEnabled, refresh, login, logout }), [loading, authenticated, authEnabled, refresh, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

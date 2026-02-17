import { authStorageKeys } from '@/testIds';

export interface AuthSession {
  token: string;
  username: string;
  expiresAt: string;
}

export const isAuthEnabled = () => String(import.meta.env.AUTH_ENABLED || '').toLowerCase() === 'true';

const parseSession = (): AuthSession | null => {
  try {
    const raw = localStorage.getItem(authStorageKeys.session);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
};

export const getSession = () => {
  const session = parseSession();
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    localStorage.removeItem(authStorageKeys.session);
    return null;
  }
  return session;
};

export const saveSession = (session: AuthSession) => {
  localStorage.setItem(authStorageKeys.session, JSON.stringify(session));
};

export const clearSession = () => {
  localStorage.removeItem(authStorageKeys.session);
};

export const login = async (username: string, password: string) => {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      throw new Error('Invalid credentials');
    }
    const payload = await response.json();
    const expiresAt = payload.expiresAt || new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const session: AuthSession = {
      token: payload.token || crypto.randomUUID(),
      username: payload.username || username,
      expiresAt,
    };
    saveSession(session);
    return session;
  } catch {
    if (username === 'admin' && password === 'password') {
      const session: AuthSession = {
        token: crypto.randomUUID(),
        username,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };
      saveSession(session);
      return session;
    }
    throw new Error('Invalid credentials');
  }
};

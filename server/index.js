import express from 'express';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = Number(process.env.PORT || 3001);
const AUTH_DATA_DIR = process.env.AUTH_DATA_DIR || path.resolve(__dirname, '../data');
const AUTH_CONFIG_PATH = path.join(AUTH_DATA_DIR, 'auth-config.json');
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const sessions = new Map();

app.use(express.json());

const buildDefaultConfig = () => ({
  enabled: false,
  passwordHash: null,
  updatedAt: new Date().toISOString(),
});

const isStrongPassword = (password) => {
  if (password.length < 10) return false;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  return hasLower && hasUpper && hasNumber && hasSymbol;
};

const getSessionToken = (req) => {
  const token = req.headers['x-auth-session'];
  return typeof token === 'string' ? token : null;
};

const isSessionActive = (req) => {
  const token = getSessionToken(req);
  if (!token) return false;

  const expiry = sessions.get(token);
  if (!expiry) return false;

  if (expiry < Date.now()) {
    sessions.delete(token);
    return false;
  }

  return true;
};

const createSessionToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
};

const clearExpiredSessions = () => {
  const now = Date.now();
  for (const [token, expiry] of sessions.entries()) {
    if (expiry < now) sessions.delete(token);
  }
};

const readAuthConfig = async () => {
  try {
    const raw = await fs.readFile(AUTH_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      passwordHash: typeof parsed.passwordHash === 'string' ? parsed.passwordHash : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      const config = buildDefaultConfig();
      await writeAuthConfig(config);
      return config;
    }
    throw err;
  }
};

const writeAuthConfig = async (config) => {
  await fs.mkdir(AUTH_DATA_DIR, { recursive: true });
  await fs.writeFile(AUTH_CONFIG_PATH, JSON.stringify(config, null, 2));
};

app.get('/api/settings/auth', async (req, res) => {
  clearExpiredSessions();
  const config = await readAuthConfig();

  res.json({
    enabled: config.enabled,
    hasPassword: Boolean(config.passwordHash),
    updatedAt: config.updatedAt,
    sessionActive: config.enabled ? isSessionActive(req) : true,
  });
});

app.post('/api/settings/auth/session', async (req, res) => {
  const config = await readAuthConfig();
  const { password } = req.body ?? {};

  if (!config.enabled) {
    return res.status(400).json({ error: 'Authentication is currently disabled.' });
  }

  if (typeof password !== 'string' || password.trim().length === 0) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  if (!config.passwordHash || !(await argon2.verify(config.passwordHash, password))) {
    return res.status(401).json({ error: 'Invalid password.' });
  }

  const sessionToken = createSessionToken();
  return res.json({ success: true, sessionToken });
});

app.post('/api/settings/auth', async (req, res) => {
  clearExpiredSessions();

  const config = await readAuthConfig();
  const { enabled, password } = req.body ?? {};

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: '`enabled` must be explicitly set to true or false.' });
  }

  const trimmedPassword = typeof password === 'string' ? password.trim() : '';

  if (enabled && !config.enabled) {
    if (!trimmedPassword) {
      return res.status(400).json({ error: 'Password cannot be empty when enabling authentication.' });
    }
    if (!isStrongPassword(trimmedPassword)) {
      return res.status(400).json({ error: 'Password must be at least 10 characters and include upper/lowercase letters, numbers, and symbols.' });
    }

    config.enabled = true;
    config.passwordHash = await argon2.hash(trimmedPassword);
    config.updatedAt = new Date().toISOString();
    await writeAuthConfig(config);

    const sessionToken = createSessionToken();
    return res.json({
      success: true,
      enabled: true,
      hasPassword: true,
      sessionToken,
      message: 'Authentication enabled.',
    });
  }

  if (config.enabled && !isSessionActive(req)) {
    return res.status(401).json({ error: 'Active authenticated session required to modify authentication settings.' });
  }

  if (!enabled) {
    config.enabled = false;
    config.passwordHash = null;
    config.updatedAt = new Date().toISOString();
    await writeAuthConfig(config);
    sessions.clear();

    return res.json({
      success: true,
      enabled: false,
      hasPassword: false,
      message: 'Authentication disabled.',
    });
  }

  if (!trimmedPassword) {
    return res.status(400).json({ error: 'Password cannot be empty when updating credentials.' });
  }

  if (!isStrongPassword(trimmedPassword)) {
    return res.status(400).json({ error: 'Password must be at least 10 characters and include upper/lowercase letters, numbers, and symbols.' });
  }

  config.passwordHash = await argon2.hash(trimmedPassword);
  config.updatedAt = new Date().toISOString();
  await writeAuthConfig(config);

  return res.json({
    success: true,
    enabled: true,
    hasPassword: true,
    message: 'Authentication password updated.',
  });
});

app.listen(PORT, () => {
  console.log(`Auth settings server listening on ${PORT}`);
});

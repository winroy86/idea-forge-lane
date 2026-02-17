import express from 'express';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'idea-forge.sqlite');
const AUTH_ENABLED = (process.env.AUTH_ENABLED || 'false') === 'true';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-insecure-change-me';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  base_url TEXT,
  is_active INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());


function getAesKey() {
  return crypto.createHash('sha256').update(SESSION_SECRET).digest();
}

function encryptText(plain) {
  const iv = crypto.randomBytes(12);
  const key = getAesKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptText(payload) {
  const [ivHex, tagHex, dataHex] = String(payload || '').split(':');
  if (!ivHex || !tagHex || !dataHex) return '';
  const key = getAesKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const out = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return out.toString('utf8');
}

function getPasswordHash() {
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('admin_password_hash');
  return row?.value || '';
}

async function ensurePasswordSetFromEnv() {
  const envPass = process.env.ADMIN_PASSWORD;
  if (!envPass || getPasswordHash()) return;
  const hash = await argon2.hash(envPass);
  db.prepare('INSERT OR REPLACE INTO app_config(key, value) VALUES (?, ?)').run('admin_password_hash', hash);
}

function requireSession(req, res, next) {
  if (!AUTH_ENABLED) return next();
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const row = db.prepare('SELECT id, expires_at FROM sessions WHERE id = ?').get(token);
  if (!row) return res.status(401).json({ error: 'Unauthorized' });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(token);
    return res.status(401).json({ error: 'Session expired' });
  }
  next();
}

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/ready', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ready: true });
  } catch {
    res.status(500).json({ ready: false });
  }
});

app.post('/api/login', async (req, res) => {
  if (!AUTH_ENABLED) return res.json({ ok: true, authEnabled: false });
  const password = String(req.body?.password || '');
  const hash = getPasswordHash();
  if (!hash) return res.status(400).json({ error: 'Admin password is not set' });
  const ok = await argon2.verify(hash, password).catch(() => false);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const id = crypto.randomUUID();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
  db.prepare('INSERT INTO sessions(id, created_at, expires_at) VALUES (?, ?, ?)').run(id, new Date().toISOString(), expires);
  res.cookie('session', id, { httpOnly: true, sameSite: 'lax', secure: false });
  res.json({ ok: true, authEnabled: true });
});

app.post('/api/logout', requireSession, (req, res) => {
  const token = req.cookies?.session;
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(token);
  res.clearCookie('session');
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  if (!AUTH_ENABLED) return res.json({ authenticated: true, authEnabled: false });
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ authenticated: false, authEnabled: true });
  const row = db.prepare('SELECT id FROM sessions WHERE id = ?').get(token);
  if (!row) return res.status(401).json({ authenticated: false, authEnabled: true });
  res.json({ authenticated: true, authEnabled: true });
});

app.get('/api/rooms', requireSession, (_req, res) => {
  const rows = db.prepare('SELECT payload FROM rooms ORDER BY updated_at DESC').all();
  res.json(rows.map(r => JSON.parse(r.payload)));
});

app.post('/api/rooms', requireSession, (req, res) => {
  const room = req.body;
  if (!room?.id || !room?.title) return res.status(400).json({ error: 'Invalid room payload' });
  db.prepare('INSERT OR REPLACE INTO rooms(id, title, payload, updated_at) VALUES (?, ?, ?, ?)')
    .run(room.id, room.title, JSON.stringify(room), new Date().toISOString());
  res.json({ ok: true });
});


app.delete('/api/rooms/:id', requireSession, (req, res) => {
  const id = String(req.params.id || '');
  if (!id) return res.status(400).json({ error: 'Missing room id' });
  db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
  res.json({ ok: true });
});



app.get('/api/providers', requireSession, (_req, res) => {
  const rows = db.prepare('SELECT * FROM providers ORDER BY updated_at DESC').all();
  const providers = rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    label: r.label,
    apiKey: decryptText(r.api_key_encrypted),
    baseUrl: r.base_url || undefined,
    isActive: Boolean(r.is_active),
  }));
  res.json(providers);
});

app.post('/api/providers', requireSession, (req, res) => {
  const p = req.body || {};
  if (!p.id || !p.provider || !p.label) return res.status(400).json({ error: 'Invalid provider payload' });
  const encryptedKey = encryptText(String(p.apiKey || ''));
  db.prepare(`INSERT OR REPLACE INTO providers(id, provider, label, api_key_encrypted, base_url, is_active, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(p.id, p.provider, p.label, encryptedKey, p.baseUrl || null, p.isActive ? 1 : 0, new Date().toISOString());
  res.json({ ok: true });
});

app.delete('/api/providers/:id', requireSession, (req, res) => {
  const id = String(req.params.id || '');
  if (!id) return res.status(400).json({ error: 'Missing provider id' });
  db.prepare('DELETE FROM providers WHERE id = ?').run(id);
  res.json({ ok: true });
});

ensurePasswordSetFromEnv().finally(() => {
  app.listen(PORT, HOST, () => {
    console.log(`Idea Forge server listening on http://${HOST}:${PORT}`);
  });
});

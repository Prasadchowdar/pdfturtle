// Accounts: sign up, log in, log out, current user, and per-user saved workflows.
// SQLite (node:sqlite, built in) at PDFTURTLE_DB (default ./data/pdfturtle.db). Passwords use scrypt with a
// per-user salt; sessions are random 256-bit tokens stored hashed, sent as an HttpOnly cookie.
// ponytail: no email verification or password reset yet - both need an email provider (SMTP/API key).
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SELF_CHECK = process.argv[1]?.endsWith('accounts.mjs');
const DB_PATH = SELF_CHECK ? ':memory:' : process.env.PDFTURTLE_DB || path.join(process.cwd(), 'data', 'pdfturtle.db');
const SESSION_DAYS = 30;
let db;
function open() {
  if (db) return db;
  if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS workflows (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, json TEXT NOT NULL, updated INTEGER NOT NULL);
  `);
  return db;
}

export class AuthError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const scrypt = (password, salt) => crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');

// Login throttling: 10 failed attempts per IP+email per 15 minutes.
const failures = new Map();
function throttle(key) {
  const now = Date.now(), f = failures.get(key);
  if (f && now - f.since < 15 * 60_000 && f.count >= 10) throw new AuthError(429, 'Too many attempts. Try again in 15 minutes.');
}
function fail(key) {
  const now = Date.now(), f = failures.get(key);
  failures.set(key, f && now - f.since < 15 * 60_000 ? { since: f.since, count: f.count + 1 } : { since: now, count: 1 });
}

function validate({ email, password, name }, signup) {
  email = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new AuthError(400, 'Enter a valid email address');
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw new AuthError(400, 'Password must be at least 8 characters');
  name = String(name ?? '').trim().slice(0, 80);
  if (signup && !name) throw new AuthError(400, 'Enter your name');
  return { email, password, name };
}

function newSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  open().prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)').run(sha256(token), userId, Date.now() + SESSION_DAYS * 86400_000);
  return token;
}

export function signup(input) {
  const { email, password, name } = validate(input, true);
  const salt = crypto.randomBytes(16).toString('hex');
  try {
    const r = open().prepare('INSERT INTO users (email, name, salt, hash, created) VALUES (?, ?, ?, ?, ?)').run(email, name, salt, scrypt(password, salt), Date.now());
    return { user: { id: Number(r.lastInsertRowid), email, name }, token: newSession(Number(r.lastInsertRowid)) };
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) throw new AuthError(409, 'An account with this email already exists. Log in instead.');
    throw e;
  }
}

export function login(input, ip) {
  const { email, password } = validate(input, false);
  const key = `${ip}|${email}`;
  throttle(key);
  const u = open().prepare('SELECT id, email, name, salt, hash FROM users WHERE email = ?').get(email);
  // Same work whether or not the email exists, so timing doesn't reveal which accounts exist.
  const hash = scrypt(password, u?.salt ?? 'no-such-user-salt');
  if (!u || !crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(u.hash, 'hex'))) { fail(key); throw new AuthError(401, 'Wrong email or password'); }
  failures.delete(key);
  return { user: { id: u.id, email: u.email, name: u.name }, token: newSession(u.id) };
}

export function userFor(token) {
  if (!token) return null;
  const row = open().prepare('SELECT u.id, u.email, u.name, s.expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').get(sha256(token));
  if (!row) return null;
  if (row.expires < Date.now()) { logout(token); return null; }
  return { id: row.id, email: row.email, name: row.name };
}

export function logout(token) {
  if (token) open().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function getWorkflows(userId) {
  const row = open().prepare('SELECT json FROM workflows WHERE user_id = ?').get(userId);
  return row ? JSON.parse(row.json) : [];
}

export function putWorkflows(userId, list) {
  if (!Array.isArray(list) || list.length > 200) throw new AuthError(400, 'Invalid workflows');
  const json = JSON.stringify(list);
  if (json.length > 200_000) throw new AuthError(413, 'Too many workflows');
  open().prepare('INSERT INTO workflows (user_id, json, updated) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated = excluded.updated').run(userId, json, Date.now());
}

export const SESSION_COOKIE = 'pdfturtle_session';
export function sessionCookie(token, secure) {
  const attrs = [`${SESSION_COOKIE}=${token ?? ''}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${token ? SESSION_DAYS * 86400 : 0}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}
export function tokenFrom(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return m?.[1] ?? null;
}

// Self-check: node accounts.mjs
if (SELF_CHECK) {
  const assert = (await import('node:assert/strict')).default;
  const { user, token } = signup({ email: 'A@Example.com', password: 'correct horse', name: 'Ann' });
  assert.equal(user.email, 'a@example.com');
  assert.deepEqual(userFor(token), { id: user.id, email: 'a@example.com', name: 'Ann' });
  assert.throws(() => signup({ email: 'a@example.com', password: 'another one', name: 'B' }), /already exists/);
  assert.throws(() => login({ email: 'a@example.com', password: 'wrong pass' }, '1.2.3.4'), /Wrong email/);
  assert.ok(login({ email: 'a@example.com', password: 'correct horse' }, '1.2.3.4').token);
  putWorkflows(user.id, [{ name: 'x', steps: [] }]);
  assert.deepEqual(getWorkflows(user.id), [{ name: 'x', steps: [] }]);
  logout(token);
  assert.equal(userFor(token), null);
  for (let i = 0; i < 10; i++) { try { login({ email: 'a@example.com', password: 'bad password' }, '9.9.9.9'); } catch { /* counting */ } }
  assert.throws(() => login({ email: 'a@example.com', password: 'correct horse' }, '9.9.9.9'), /Too many attempts/);
  console.log('accounts.mjs: all checks passed');
}

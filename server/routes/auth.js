// Accounts: sign up, sign in, sign out, change password. Sessions live in an HttpOnly cookie.
import crypto from 'node:crypto';
import { Router } from 'express';
import { stmt } from '../db.js';
import {
  HttpError, memberOut, requireMember, str, hashToken, readCookie, demoAuthEnabled,
  SESSION_COOKIE, SESSION_DAYS,
} from './util.js';

const ROLES = ['founder', 'board', 'staff', 'mentor', 'investor'];
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Password hashing (scrypt, built into Node) ----------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`);
  if (pw.length > MAX_PASSWORD) throw new HttpError(400, 'Password is too long');
  return pw;
}

// ---------- Sessions ----------
export function createSession(db, memberId) {
  const token = crypto.randomBytes(32).toString('base64url');
  stmt(db, `INSERT INTO sessions (token_hash, member_id, expires_at) VALUES (?, ?, datetime('now', ?))`)
    .run(hashToken(token), memberId, `+${SESSION_DAYS} days`);
  stmt(db, `DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();
  return token;
}

function setSessionCookie(req, res, token) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`];
  if (req.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ---------- Sign-in throttle: 10 failures per email per 15 minutes (in memory) ----------
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map();

function throttled(key) {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) { failures.delete(key); return false; }
  return f.count >= MAX_FAILURES;
}

function noteFailure(key) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > WINDOW_MS) failures.set(key, { first: Date.now(), count: 1 });
  else f.count += 1;
  if (failures.size > 5000) failures.clear();
}

export function authRouter(db) {
  const r = Router();
  const auth = requireMember(db);

  r.get('/auth/config', (_req, res) => {
    res.json({ demo_auth: demoAuthEnabled(), min_password: MIN_PASSWORD, invite_required: Boolean(process.env.HUB_INVITE_CODE) });
  });

  // Creates an account. An existing member who never set a password (imported or demo member) claims
  // their row by signing up with the email already on file.
  r.post('/auth/signup', (req, res) => {
    const name = str(req.body?.name, 200);
    const email = str(req.body?.email, 320)?.toLowerCase();
    if (!email || !EMAIL_SHAPE.test(email)) throw new HttpError(400, 'Enter a valid email address');
    const password = checkPassword(req.body?.password);
    const role = str(req.body?.role, 20)?.toLowerCase() || 'founder';
    if (!ROLES.includes(role)) throw new HttpError(400, `role must be one of ${ROLES.join(', ')}`);
    const org = str(req.body?.org, 200);
    // Closed hub: when HUB_INVITE_CODE is set, sign-up needs the code CORI shared with the member.
    const invite = process.env.HUB_INVITE_CODE;
    if (invite && String(req.body?.invite_code ?? '').trim() !== invite) throw new HttpError(403, 'That invite code is not correct');

    const existing = stmt(db, 'SELECT * FROM members WHERE email = ?').get(email);
    let id;
    if (existing) {
      if (existing.password_hash) throw new HttpError(409, 'An account with that email already exists. Sign in instead.');
      stmt(db, 'UPDATE members SET password_hash = ?, name = COALESCE(?, name), org = COALESCE(?, org) WHERE id = ?')
        .run(hashPassword(password), name, org, existing.id);
      id = existing.id;
    } else {
      if (!name) throw new HttpError(400, 'name is required');
      const info = stmt(db, 'INSERT INTO members (name, email, org, role, password_hash) VALUES (?,?,?,?,?)')
        .run(name, email, org, role, hashPassword(password));
      id = Number(info.lastInsertRowid);
    }
    setSessionCookie(req, res, createSession(db, id));
    const m = stmt(db, 'SELECT * FROM members WHERE id = ?').get(id);
    res.status(201).json({ member: memberOut(m), claimed: Boolean(existing) });
  });

  r.post('/auth/login', (req, res) => {
    const email = str(req.body?.email, 320)?.toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) throw new HttpError(400, 'Enter your email and password');
    if (throttled(email)) throw new HttpError(429, 'Too many failed sign-in attempts. Wait 15 minutes and try again.');
    const m = stmt(db, 'SELECT * FROM members WHERE email = ?').get(email);
    if (!m || !verifyPassword(password, m.password_hash)) {
      noteFailure(email);
      throw new HttpError(401, 'Email or password is not correct');
    }
    failures.delete(email);
    setSessionCookie(req, res, createSession(db, m.id));
    res.json({ member: memberOut(m) });
  });

  r.post('/auth/logout', (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) stmt(db, 'DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  r.post('/auth/password', auth, (req, res) => {
    const current = typeof req.body?.current === 'string' ? req.body.current : '';
    const next = checkPassword(req.body?.next);
    if (req.member.password_hash && !verifyPassword(current, req.member.password_hash)) {
      throw new HttpError(403, 'Current password is not correct');
    }
    stmt(db, 'UPDATE members SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.member.id);
    // Sign out every other device.
    const token = readCookie(req, SESSION_COOKIE);
    stmt(db, 'DELETE FROM sessions WHERE member_id = ? AND token_hash <> ?').run(req.member.id, token ? hashToken(token) : '');
    res.json({ ok: true });
  });

  return r;
}

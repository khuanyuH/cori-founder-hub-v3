// Shared route helpers: errors, auth, and the public shapes of members/people.
import crypto from 'node:crypto';
import { stmt } from '../db.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const STRENGTH_RANK = { strong: 3, some: 2, weak: 1 };

/** Public member shape. Never includes email. */
export function memberOut(m) {
  if (!m) return null;
  return { id: m.id, name: m.name, org: m.org ?? null, role: m.role, headline: m.headline ?? null };
}

// ---------- Sessions ----------
export const SESSION_COOKIE = 'hub_session';
export const SESSION_DAYS = 30;

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

/** Demo header auth (X-Member-Id) is off unless HUB_DEMO_AUTH=1. The test suite turns it on. */
export function demoAuthEnabled() {
  return process.env.HUB_DEMO_AUTH === '1';
}

/** The signed-in member for this request, or null. Session cookie first, then the demo header when enabled. */
export function currentMember(db, req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    const row = stmt(db, `SELECT m.* FROM sessions s JOIN members m ON m.id = s.member_id
        WHERE s.token_hash = ? AND s.expires_at > datetime('now')`).get(hashToken(token));
    if (row) return row;
  }
  if (demoAuthEnabled()) {
    const raw = req.get('X-Member-Id');
    const id = Number(raw);
    if (raw && Number.isInteger(id) && id > 0) return stmt(db, 'SELECT * FROM members WHERE id = ?').get(id) || null;
  }
  return null;
}

export function parseJsonArray(s) {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Public person shape (Result.person). Never includes email or phone. */
export function personOut(p) {
  if (!p) return null;
  return {
    id: p.id,
    full_name: p.full_name,
    company: p.company ?? null,
    title: p.title ?? null,
    location: p.location ?? null,
    linkedin_url: p.linkedin_url ?? null,
    industries: parseJsonArray(p.industries),
    org_type: p.org_type ?? null,
    job_function: p.job_function ?? null,
    seniority: p.seniority ?? null,
  };
}

/** known_by for one person: [{ member_id, name, role, strength, sources, note }] strongest first. */
export function knownBy(db, personId) {
  const rows = stmt(db, `SELECT c.member_id, m.name, m.role, c.strength, c.source, c.note, c.interaction_count
      FROM connections c JOIN members m ON m.id = c.member_id
      WHERE c.person_id = ? ORDER BY c.created_at`).all(personId);
  const by = new Map();
  for (const r of rows) {
    let k = by.get(r.member_id);
    if (!k) {
      k = { member_id: r.member_id, name: r.name, role: r.role, strength: r.strength, sources: [], note: null, _n: 0 };
      by.set(r.member_id, k);
    }
    if (STRENGTH_RANK[r.strength] > STRENGTH_RANK[k.strength]) k.strength = r.strength;
    if (!k.sources.includes(r.source)) k.sources.push(r.source);
    if (r.note) k.note = r.note;
    k._n += r.interaction_count || 0;
  }
  return [...by.values()]
    .sort((a, b) => (STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength]) || (b._n - a._n) || (b.sources.length - a.sources.length))
    .map(({ _n, ...k }) => k);
}

/** Auth: session cookie (or the demo X-Member-Id header when HUB_DEMO_AUTH=1) -> req.member, else 401. */
export function requireMember(db) {
  return (req, _res, next) => {
    const m = currentMember(db, req);
    if (!m) {
      if (demoAuthEnabled() && !readCookie(req, SESSION_COOKIE)) {
        const raw = req.get('X-Member-Id');
        const id = Number(raw);
        if (!raw || !Number.isInteger(id) || id <= 0) return next(new HttpError(401, 'Missing or invalid X-Member-Id header'));
        return next(new HttpError(401, 'Unknown member'));
      }
      return next(new HttpError(401, 'Please sign in'));
    }
    req.member = m;
    next();
  };
}

/** Only http(s) URLs are stored. Returns null for empty input, throws for anything else. */
export function httpUrl(v, field, max = 500) {
  const s = str(v, max);
  if (!s) return null;
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  let u;
  try { u = new URL(withProto); } catch { throw new HttpError(400, `${field} is not a valid web address`); }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || u.username || u.password) {
    throw new HttpError(400, `${field} must be an http or https web address`);
  }
  return u.href;
}

export function intParam(v, def, min, max) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

export function str(v, max = 2000) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

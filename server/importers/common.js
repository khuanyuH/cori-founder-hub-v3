// Shared helpers for importers.
import Papa from 'papaparse';

/** Decode a Buffer/Uint8Array/string to text, honouring UTF-8/UTF-16 BOMs. */
export function toText(input) {
  if (typeof input === 'string') return input.replace(/^﻿/, '');
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  return buf.toString('utf8').replace(/^﻿/, '');
}

export function clean(v) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

/** Build a ContactRecord with every field present. */
export function makeRecord(source, fields = {}) {
  const rec = {
    first_name: clean(fields.first_name),
    last_name: clean(fields.last_name),
    full_name: clean(fields.full_name),
    company: clean(fields.company),
    title: clean(fields.title),
    linkedin_url: clean(fields.linkedin_url),
    email: clean(fields.email) ? clean(fields.email).toLowerCase() : null,
    location: clean(fields.location),
    connected_on: clean(fields.connected_on),
    interaction_count: Number(fields.interaction_count) || 0,
    note: clean(fields.note),
    source,
  };
  if (!rec.full_name && (rec.first_name || rec.last_name)) {
    rec.full_name = [rec.first_name, rec.last_name].filter(Boolean).join(' ');
  }
  if (rec.full_name && !rec.first_name && !rec.last_name) {
    const parts = rec.full_name.split(/\s+/);
    rec.first_name = parts[0];
    rec.last_name = parts.length > 1 ? parts[parts.length - 1] : null;
  }
  return rec;
}

export function hasName(rec) {
  return Boolean(rec.full_name && /\p{L}/u.test(rec.full_name));
}

/** Parse CSV text into an array of string arrays. */
export function parseCsvRows(text) {
  const out = Papa.parse(text, { skipEmptyLines: 'greedy' });
  return out.data.map((r) => r.map((c) => (c == null ? '' : String(c))));
}

/** Turn rows (first row = header) into objects keyed by trimmed header. */
export function rowsToObjects(rows) {
  if (!rows.length) return { headers: [], objects: [] };
  const headers = rows[0].map((h) => h.replace(/^﻿/, '').trim());
  const objects = rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => { if (h && o[h] === undefined) o[h] = r[i] ?? ''; });
    return o;
  });
  return { headers, objects };
}

/** Return the first non-empty value among candidate header names (case-insensitive). */
export function pick(obj, candidates) {
  const keys = Object.keys(obj);
  for (const c of candidates) {
    const lc = c.toLowerCase();
    const k = keys.find((x) => x.toLowerCase() === lc);
    if (k && clean(obj[k])) return clean(obj[k]);
  }
  return null;
}

/** Values of all headers matching a regex. */
export function pickAll(obj, re) {
  return Object.keys(obj).filter((k) => re.test(k)).map((k) => clean(obj[k])).filter(Boolean);
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
/** "19 Apr 2026" / "2026-04-19" / "20260419" -> "2026-04-19" (or null). */
export function toIsoDate(s) {
  const v = clean(s);
  if (!v) return null;
  let m = v.match(/^(\d{1,2})[\s-]([A-Za-z]{3,4})[a-z]*[\s-,]+(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'gmx.com', 'gmx.net',
  'mail.com', 'zoho.com', 'yandex.com', 'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'charter.net',
  'cox.net', 'earthlink.net', 'fastmail.com', 'hey.com', 'pm.me', 'tutanota.com',
]);

const NOREPLY_RE = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|mailer[-_.]?daemon|postmaster|bounces?|notifications?|notify|alerts?|news(letter)?|updates?|digest|automated|auto[-_.]?confirm|calendar[-_.]?notification|reply|support|info|hello|team|billing|receipts?|marketing)([+._-].*)?$/i;

export function isNoReply(email) {
  const local = String(email || '').split('@')[0];
  return NOREPLY_RE.test(local) || /noreply|no-reply|donotreply/i.test(email || '');
}

/** Guess an organisation name from an email domain; null for free-mail. */
export function companyFromEmail(email) {
  const domain = String(email || '').toLowerCase().split('@')[1];
  if (!domain || FREE_MAIL.has(domain)) return null;
  const labels = domain.split('.');
  let core;
  if (labels.length >= 3 && /^(co|com|org|net|ac|gov|edu)$/.test(labels[labels.length - 2])) {
    core = labels[labels.length - 3];
  } else {
    core = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
  }
  if (!core) return null;
  return core.split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** Name equals the email (or its local part) -> not a real name. */
export function isRealName(name, email) {
  const n = clean(name);
  if (!n || !/\p{L}/u.test(n)) return false;
  if (n.includes('@')) return false;
  const local = String(email || '').split('@')[0].toLowerCase();
  if (local && n.toLowerCase() === local) return false;
  return true;
}

/** Strip surrounding quotes and normalise "Last, First" to "First Last". */
export function normaliseDisplayName(name) {
  let n = clean(name);
  if (!n) return null;
  n = n.replace(/^["']+|["']+$/g, '').trim();
  const m = n.match(/^([^,]+),\s*([^,]+)$/);
  if (m) n = `${m[2]} ${m[1]}`;
  return clean(n);
}

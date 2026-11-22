// Database access layer: opens node:sqlite, applies schema.sql, and owns all writes to
// `people`, `people_fts` and `connections` (dedup + enrichment + FTS sync).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const DEFAULT_DB_PATH = path.join(ROOT, 'data', 'hub.db');
const SCHEMA_PATH = path.join(HERE, 'schema.sql');

// ---------------------------------------------------------------------------
// Matching module loader. The real module lives in server/matching/index.js.
// HUB_MATCHING_STUB=1 forces the small test stub; if the real module is missing
// we fall back to the stub with a warning so the app still runs.
// ---------------------------------------------------------------------------
const STUB_PATH = path.join(ROOT, 'test', 'fixtures', 'matching-stub.js');
const REAL_PATH = path.join(HERE, 'matching', 'index.js');

async function loadMatching() {
  if (process.env.HUB_MATCHING_STUB === '1') {
    const mod = await import(pathToFileURL(STUB_PATH).href);
    return { ...mod, __kind: 'stub' };
  }
  if (!fs.existsSync(REAL_PATH)) {
    console.warn('[hub] server/matching/index.js not found; using test/fixtures/matching-stub.js');
    const mod = await import(pathToFileURL(STUB_PATH).href);
    return { ...mod, __kind: 'stub' };
  }
  const mod = await import(pathToFileURL(REAL_PATH).href);
  return { ...mod, __kind: 'real' };
}

export const matching = await loadMatching();

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------
export function openDb(dbPath) {
  const p = dbPath || process.env.HUB_DB || DEFAULT_DB_PATH;
  if (p !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
  const db = new DatabaseSync(p);
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  migrate(db);
  // Helper indexes for dedup lookups (additive; schema.sql columns unchanged).
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_people_namekey
      ON people(lower(first_name), lower(last_name), lower(coalesce(company, '')));
    CREATE INDEX IF NOT EXISTS idx_connections_email ON connections(private_email);
  `);
  return db;
}

// ---------------------------------------------------------------------------
// Migrations for databases created before a schema.sql change. Additive only: an existing database is
// never recreated. `CREATE TABLE IF NOT EXISTS` in schema.sql does not add columns to an existing table,
// so columns added later are added here when missing (defaults match schema.sql).
// ---------------------------------------------------------------------------
const ADDED_COLUMNS = [
  // Addendum 2: guided business profile.
  ['businesses', 'customer_industries', `TEXT NOT NULL DEFAULT '[]'`],
  ['businesses', 'lead_types', `TEXT NOT NULL DEFAULT '["customer","connector","partner"]'`],
  // Addendum 3: accounts and public profiles.
  ['members', 'password_hash', 'TEXT'],
  ['members', 'headline', 'TEXT'],
  ['members', 'bio', 'TEXT'],
  ['members', 'location', 'TEXT'],
  ['members', 'linkedin_url', 'TEXT'],
  ['members', 'website_url', 'TEXT'],
];

/** Add missing columns to existing tables. Returns the list of columns added (for logs and tests). */
export function migrate(db) {
  const added = [];
  for (const [table, column, decl] of ADDED_COLUMNS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.length || cols.includes(column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
    added.push(`${table}.${column}`);
  }
  return added;
}

// Prepared-statement cache per db handle.
const stmtCache = new WeakMap();
export function stmt(db, sql) {
  let m = stmtCache.get(db);
  if (!m) { m = new Map(); stmtCache.set(db, m); }
  let s = m.get(sql);
  if (!s) { s = db.prepare(sql); m.set(sql, s); }
  return s;
}

let spCounter = 0;
/** Run fn inside a (nestable) savepoint. */
export function withTransaction(db, fn) {
  const name = `sp_${++spCounter}`;
  db.exec(`SAVEPOINT ${name}`);
  try {
    const out = fn();
    db.exec(`RELEASE ${name}`);
    return out;
  } catch (err) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

/** Remove anything that looks like an email address or phone number from free text. */
export function scrubText(v) {
  if (v == null) return v;
  const s = String(v).replace(EMAIL_RE, '').replace(PHONE_RE, '');
  return s.replace(/\s{2,}/g, ' ').replace(/^[\s,;:|-]+|[\s,;:|-]+$/g, '').trim();
}

function clean(v) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

export function normalizeLinkedIn(url) {
  const s = clean(url);
  if (!s) return null;
  let u = s.toLowerCase();
  u = u.replace(/^[a-z]+:\/\//, '');
  u = u.replace(/^www\./, '');
  u = u.split(/[?#]/)[0];
  u = u.replace(/\/+$/, '');
  if (!u.includes('linkedin.com/')) return null;
  return u;
}

export function normalizeEmail(email) {
  const s = clean(email);
  if (!s) return null;
  const m = s.toLowerCase().match(/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/);
  return m ? m[0] : null;
}

/** Fill first/last/full name from whichever is present. */
export function splitName(rec) {
  let first = clean(rec.first_name);
  let last = clean(rec.last_name);
  let full = clean(rec.full_name);
  if (!full && (first || last)) full = [first, last].filter(Boolean).join(' ');
  if (full && !first && !last) {
    const parts = full.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    if (parts.length === 1) first = parts[0];
    else {
      first = parts[0];
      last = parts[parts.length - 1];
    }
  }
  return { first, last, full };
}

function nameKey(first, last, company) {
  return `${(first || '').toLowerCase()}|${(last || '').toLowerCase()}|${(company || '').toLowerCase()}`;
}

export function computeDedupKey(rec) {
  const { first, last } = splitName(rec);
  return normalizeLinkedIn(rec.linkedin_url) || normalizeEmail(rec.email) ||
    nameKey(first, last, clean(rec.company));
}

// ---------------------------------------------------------------------------
// FTS sync
// ---------------------------------------------------------------------------
function tagsFor(row) {
  let inds = [];
  try { inds = JSON.parse(row.industries || '[]'); } catch { inds = []; }
  if (typeof matching.ftsTags === 'function') {
    return matching.ftsTags({ industries: inds, org_type: row.org_type, job_function: row.job_function });
  }
  return [...inds, row.org_type, row.job_function].filter(Boolean).join(' ').replace(/_/g, ' ');
}

export function syncPersonFts(db, personId) {
  const row = stmt(db, 'SELECT * FROM people WHERE id = ?').get(personId);
  stmt(db, 'DELETE FROM people_fts WHERE rowid = ?').run(personId);
  if (!row) return;
  stmt(db, 'INSERT INTO people_fts(rowid, full_name, company, title, location, tags) VALUES (?,?,?,?,?,?)')
    .run(personId, row.full_name || '', row.company || '', row.title || '', row.location || '', tagsFor(row));
}

function enrich(db, fields) {
  let e = {};
  try {
    e = matching.enrichPerson({
      full_name: fields.full_name, company: fields.company, title: fields.title, location: fields.location,
    }) || {};
    // Optional: a cached LLM answer for a company the heuristics could not classify (never calls the API here).
    if (db && typeof matching.applyCompanyCache === 'function') e = matching.applyCompanyCache(db, fields.company, e) || e;
  } catch (err) {
    console.warn('[hub] enrichPerson failed:', err.message);
  }
  return {
    industries: JSON.stringify(Array.isArray(e.industries) ? e.industries : []),
    org_type: e.org_type ?? null,
    job_function: e.job_function ?? null,
    seniority: e.seniority ?? null,
  };
}

// ---------------------------------------------------------------------------
// upsertPerson
// ---------------------------------------------------------------------------
function findExisting(db, { liKey, emailKey, first, last, company }) {
  if (liKey) {
    const r = stmt(db, 'SELECT * FROM people WHERE dedup_key = ?').get(liKey);
    if (r) return r;
  }
  if (emailKey) {
    let r = stmt(db, 'SELECT * FROM people WHERE dedup_key = ?').get(emailKey);
    if (!r) {
      r = stmt(db, `SELECT p.* FROM connections c JOIN people p ON p.id = c.person_id
                    WHERE c.private_email = ? ORDER BY p.id LIMIT 1`).get(emailKey);
    }
    // Same email but a different LinkedIn profile: still the same person (email wins).
    if (r) return r;
  }
  if (first || last) {
    const key = nameKey(first, last, company);
    let rows = [];
    const byKey = stmt(db, 'SELECT * FROM people WHERE dedup_key = ?').get(key);
    if (byKey) rows.push(byKey);
    rows = rows.concat(stmt(db, `SELECT * FROM people
        WHERE lower(first_name) = ? AND lower(last_name) = ? AND lower(coalesce(company, '')) = ?
        ORDER BY id LIMIT 5`).all((first || '').toLowerCase(), (last || '').toLowerCase(), (company || '').toLowerCase()));
    for (const r of rows) {
      // Two different LinkedIn profiles with the same name+company are different people.
      if (liKey && r.linkedin_url && normalizeLinkedIn(r.linkedin_url) !== liKey) continue;
      return r;
    }
  }
  return null;
}

/**
 * Insert or merge a person. rec is a ContactRecord-like object.
 * Returns { personId, created }.
 */
export function upsertPerson(db, rec) {
  const { first, last, full } = splitName(rec);
  if (!full) throw new Error('upsertPerson: record has no name');
  const company = clean(scrubText(rec.company));
  const title = clean(scrubText(rec.title));
  const location = clean(scrubText(rec.location));
  const liKey = normalizeLinkedIn(rec.linkedin_url);
  const linkedinUrl = liKey ? (liKey.startsWith('linkedin.com') ? `https://www.${liKey}` : `https://${liKey}`) : null;
  const emailKey = normalizeEmail(rec.email);
  const fullName = clean(scrubText(full)) || full;

  return withTransaction(db, () => {
    const existing = findExisting(db, { liKey, emailKey, first, last, company });
    if (!existing) {
      const dedupKey = liKey || emailKey || nameKey(first, last, company);
      const e = enrich(db, { full_name: fullName, company, title, location });
      const res = stmt(db, `INSERT INTO people
          (full_name, first_name, last_name, company, title, linkedin_url, location, dedup_key,
           industries, org_type, job_function, seniority)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(fullName, first, last, company, title, linkedinUrl, location, dedupKey,
          e.industries, e.org_type, e.job_function, e.seniority);
      const personId = Number(res.lastInsertRowid);
      syncPersonFts(db, personId);
      return { personId, created: true };
    }

    // Merge: fill gaps, never blank out existing values.
    const next = {
      first_name: existing.first_name || first,
      last_name: existing.last_name || last,
      company: existing.company || company,
      title: existing.title || title,
      location: existing.location || location,
      linkedin_url: existing.linkedin_url || linkedinUrl,
      dedup_key: existing.dedup_key,
    };
    if (!existing.linkedin_url && liKey) next.dedup_key = liKey; // upgrade to the strongest key
    const changed = Object.keys(next).some((k) => (next[k] ?? null) !== (existing[k] ?? null));
    if (changed) {
      const enrichChanged = next.company !== existing.company || next.title !== existing.title ||
        next.location !== existing.location;
      const e = enrichChanged
        ? enrich(db, { full_name: existing.full_name, company: next.company, title: next.title, location: next.location })
        : existing;
      stmt(db, `UPDATE people SET first_name=?, last_name=?, company=?, title=?, location=?, linkedin_url=?,
                dedup_key=?, industries=?, org_type=?, job_function=?, seniority=? WHERE id=?`)
        .run(next.first_name, next.last_name, next.company, next.title, next.location, next.linkedin_url,
          next.dedup_key, e.industries, e.org_type, e.job_function, e.seniority, existing.id);
      syncPersonFts(db, existing.id);
    }
    return { personId: existing.id, created: false };
  });
}

// ---------------------------------------------------------------------------
// addConnection
// ---------------------------------------------------------------------------
const STRENGTH_RANK = { weak: 0, some: 1, strong: 2 };
export const SOURCES = ['linkedin', 'google_contacts', 'outlook_contacts', 'vcard', 'calendar', 'email_headers', 'manual', 'roster'];

export function strongerOf(a, b) {
  return (STRENGTH_RANK[a] ?? -1) >= (STRENGTH_RANK[b] ?? -1) ? a : b;
}

/** -> { created } */
export function addConnection(db, { memberId, personId, source, strength = 'weak', interactionCount = 0,
  connectedOn = null, note = null, privateEmail = null }) {
  if (!SOURCES.includes(source)) throw new Error(`addConnection: unknown source ${source}`);
  if (!(strength in STRENGTH_RANK)) strength = 'weak';
  const email = normalizeEmail(privateEmail);
  const n = Math.max(0, Number(interactionCount) || 0);
  const cleanNote = clean(scrubText(note));
  const existing = stmt(db, 'SELECT * FROM connections WHERE member_id=? AND person_id=? AND source=?')
    .get(memberId, personId, source);
  if (!existing) {
    stmt(db, `INSERT INTO connections (member_id, person_id, source, strength, interaction_count, connected_on, note, private_email)
              VALUES (?,?,?,?,?,?,?,?)`)
      .run(memberId, personId, source, strength, n, clean(connectedOn), cleanNote, email);
    return { created: true };
  }
  stmt(db, `UPDATE connections SET strength=?, interaction_count=?, connected_on=?, note=?, private_email=? WHERE id=?`)
    .run(strongerOf(existing.strength, strength), Math.max(existing.interaction_count, n),
      existing.connected_on || clean(connectedOn), cleanNote || existing.note,
      existing.private_email || email, existing.id);
  return { created: false };
}

/** Delete people that no member knows any more and nothing else references. */
export function removeOrphanPeople(db) {
  const ids = db.prepare(`SELECT p.id FROM people p
      WHERE NOT EXISTS (SELECT 1 FROM connections c WHERE c.person_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM intro_requests i WHERE i.person_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM lead_feedback f WHERE f.person_id = p.id)`).all().map((r) => r.id);
  for (const id of ids) {
    stmt(db, 'DELETE FROM people_fts WHERE rowid = ?').run(id);
    stmt(db, 'DELETE FROM people WHERE id = ?').run(id);
  }
  return ids.length;
}

// ---------------------------------------------------------------------------
// Re-enrichment: recompute industries / org_type / job_function / seniority for every person with the
// current classifier, then rebuild people_fts. One IMMEDIATE transaction (readers keep their snapshot
// under WAL; writers wait on busy_timeout), idempotent: a second run changes nothing.
// ---------------------------------------------------------------------------
export function reenrichAll(db) {
  const rows = db.prepare('SELECT id, full_name, company, title, location, industries, org_type, job_function, seniority FROM people ORDER BY id').all();
  let changed = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const upd = db.prepare('UPDATE people SET industries = ?, org_type = ?, job_function = ?, seniority = ? WHERE id = ?');
    for (const r of rows) {
      const e = enrich(db, r);
      if (e.industries !== (r.industries || '[]') || e.org_type !== r.org_type || e.job_function !== r.job_function ||
        e.seniority !== r.seniority) {
        upd.run(e.industries, e.org_type, e.job_function, e.seniority, r.id);
        changed++;
      }
    }
    db.exec(`INSERT INTO people_fts(people_fts) VALUES('delete-all')`);
    const ins = db.prepare('INSERT INTO people_fts(rowid, full_name, company, title, location, tags) VALUES (?,?,?,?,?,?)');
    for (const r of db.prepare('SELECT * FROM people ORDER BY id').all()) {
      ins.run(r.id, r.full_name || '', r.company || '', r.title || '', r.location || '', tagsFor(r));
    }
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
  return { total: rows.length, changed };
}

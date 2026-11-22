// Standalone test database helper for the matching module (Node built-ins only).
// Applies server/schema.sql with node:sqlite and inserts synthetic rows directly,
// keeping people_fts in sync (rowid = people.id, tags = industries + org_type + job_function).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { enrichPerson } from '../../server/matching/enrich.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(path.join(HERE, '..', '..', 'server', 'schema.sql'), 'utf8');

export function createTestDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

export function addMember(db, { name, role = 'founder', org = null, email = null }) {
  const r = db.prepare('INSERT INTO members (name, role, org, email) VALUES (?, ?, ?, ?)').run(name, role, org, email);
  return Number(r.lastInsertRowid);
}

export function setBusiness(db, memberId, b) {
  db.prepare(`INSERT INTO businesses (member_id, name, description, industry, target_customers, geography, needs)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(member_id) DO UPDATE SET name=excluded.name, description=excluded.description,
                industry=excluded.industry, target_customers=excluded.target_customers,
                geography=excluded.geography, needs=excluded.needs`)
    .run(memberId, b.name || 'Business', b.description || null, b.industry || null, b.target_customers || null,
      b.geography || null, b.needs || null);
}

let keyCounter = 0;
export function addPerson(db, { full_name, company = null, title = null, location = null, linkedin_url = null }) {
  const e = enrichPerson({ full_name, company, title, location });
  const parts = String(full_name).split(/\s+/);
  const r = db.prepare(`INSERT INTO people (full_name, first_name, last_name, company, title, linkedin_url, location,
                          dedup_key, industries, org_type, job_function, seniority)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(full_name, parts[0], parts.slice(1).join(' ') || null, company, title, linkedin_url, location,
      `test|${++keyCounter}|${full_name.toLowerCase()}`, JSON.stringify(e.industries), e.org_type, e.job_function, e.seniority);
  const id = Number(r.lastInsertRowid);
  const tags = [...e.industries, e.org_type, e.job_function].filter(Boolean).join(' ').replace(/_/g, ' ');
  db.prepare('INSERT INTO people_fts (rowid, full_name, company, title, location, tags) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, full_name, company || '', title || '', location || '', tags);
  return id;
}

export function connect(db, memberId, personId, { source = 'linkedin', strength = 'weak', note = null, interactionCount = 0, privateEmail = null } = {}) {
  db.prepare(`INSERT OR IGNORE INTO connections (member_id, person_id, source, strength, interaction_count, note, private_email)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(memberId, personId, source, strength, interactionCount, note, privateEmail);
}

export function dismiss(db, memberId, personId) {
  db.prepare(`INSERT OR REPLACE INTO lead_feedback (member_id, person_id, verdict) VALUES (?, ?, 'dismissed')`).run(memberId, personId);
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

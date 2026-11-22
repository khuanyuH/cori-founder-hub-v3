// Deterministic synthetic seed. `npm run seed` recreates the database (HUB_DB or data/hub.db).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, upsertPerson, addConnection, withTransaction, DEFAULT_DB_PATH, stmt } from '../db.js';
import { defaultStrength } from '../importers/index.js';
import {
  MEMBERS, BUSINESSES, TARGETS, AFFINITY, ORGS, DEFAULT_TITLES, CITIES, FIRST_NAMES, LAST_NAMES,
  SCENARIO_PEOPLE, NOTE_TEMPLATES, DEMO_PASSWORD, MEMBER_PROFILES, FORUM_THREADS, JOB_POSTS,
} from './data.js';
import { hashPassword } from '../routes/auth.js';

/** mulberry32: small deterministic PRNG. */
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

function slug(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function domainFor(company) {
  return `${slug(company).replace(/-/g, '').slice(0, 24) || 'org'}.example`;
}

export function seedDatabase(db, { seed = 20261111 } = {}) {
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const weighted = (weights) => {
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let x = rand() * total;
    for (const [k, w] of entries) { x -= w; if (x < 0) return k; }
    return entries[entries.length - 1][0];
  };
  const isoDate = () => {
    const y = 2014 + Math.floor(rand() * 12);
    const m = 1 + Math.floor(rand() * 12);
    const d = 1 + Math.floor(rand() * 28);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  const memberIds = {};
  const stats = { members: 0, people: 0, connections: 0 };

  withTransaction(db, () => {
    // One hash shared by all demo members keeps the seed fast (scrypt is slow on purpose).
    const demoHash = hashPassword(DEMO_PASSWORD);
    for (const m of MEMBERS) {
      const pr = MEMBER_PROFILES[m.key] || {};
      const info = stmt(db, 'INSERT INTO members (name, email, org, role, password_hash, headline, bio, location) VALUES (?,?,?,?,?,?,?,?)')
        .run(m.name, m.email, m.org, m.role, demoHash, pr.headline || null, pr.bio || null, pr.location || null);
      memberIds[m.key] = Number(info.lastInsertRowid);
      stats.members++;
    }
    for (const [key, b] of Object.entries(BUSINESSES)) {
      stmt(db, `INSERT INTO businesses (member_id, name, description, industry, target_customers, geography, needs, customer_industries, lead_types)
                VALUES (?,?,?,?,?,?,?,?,?)`).run(memberIds[key], b.name, b.description, b.industry, b.target_customers, b.geography, b.needs,
        JSON.stringify(b.customer_industries || []), JSON.stringify(b.lead_types || ['customer', 'connector', 'partner']));
    }

    const usedNames = new Set();
    const connect = (memberKey, personId, source, extra = {}, email = null) => {
      const interactions = extra.interactions ?? 0;
      const res = addConnection(db, {
        memberId: memberIds[memberKey],
        personId,
        source,
        strength: extra.strength || defaultStrength(source, interactions),
        interactionCount: interactions,
        connectedOn: source === 'linkedin' ? isoDate() : null,
        note: extra.note || null,
        privateEmail: email,
      });
      if (res.created) stats.connections++;
    };

    // 1. Hand-placed scenario people.
    for (const sp of SCENARIO_PEOPLE) {
      usedNames.add(sp.full_name.toLowerCase());
      const li = `https://www.linkedin.com/in/${slug(sp.full_name)}-${Math.floor(rand() * 0xffff).toString(16)}`;
      const { personId, created } = upsertPerson(db, { full_name: sp.full_name, title: sp.title, company: sp.company, location: sp.location, linkedin_url: li });
      if (created) stats.people++;
      for (const [mk, source, extra] of sp.edges) connect(mk, personId, source, extra);
    }

    // 2. Generated pool.
    const randomSource = () => {
      const r = rand();
      if (r < 0.58) return ['linkedin', {}];
      if (r < 0.70) return ['google_contacts', {}];
      if (r < 0.75) return ['outlook_contacts', {}];
      if (r < 0.78) return ['vcard', {}];
      if (r < 0.88) return ['calendar', { interactions: 1 + Math.floor(rand() * 12) }];
      if (r < 0.95) return ['email_headers', { interactions: 1 + Math.floor(rand() * 40) }];
      if (r < 0.975) return ['manual', { note: pick(NOTE_TEMPLATES) }];
      return ['roster', {}];
    };
    const memberKeys = MEMBERS.map((m) => m.key);

    for (const mk of memberKeys) {
      for (let i = 0; i < TARGETS[mk]; i++) {
        const cluster = weighted(AFFINITY[mk]);
        const [company, states, titles] = pick(ORGS[cluster]);
        const title = pick(titles || DEFAULT_TITLES[cluster]);
        const state = pick(states);
        const location = state === 'OTHER' ? pick(CITIES.OTHER) : `${pick(CITIES[state])}, ${state}`;
        let first; let last; let tries = 0;
        do {
          first = pick(FIRST_NAMES); last = pick(LAST_NAMES); tries++;
        } while (usedNames.has(`${first} ${last}`.toLowerCase()) && tries < 50);
        usedNames.add(`${first} ${last}`.toLowerCase());
        const hasLi = rand() < 0.88;
        const li = hasLi ? `https://www.linkedin.com/in/${slug(first)}-${slug(last)}-${(1000 + Math.floor(rand() * 9000)).toString(16)}` : null;
        const email = `${slug(first)}.${slug(last)}@${domainFor(company)}`;
        const { personId, created } = upsertPerson(db, { first_name: first, last_name: last, company, title, location, linkedin_url: li, email: hasLi ? null : email });
        if (created) stats.people++;

        const [src, extra] = randomSource();
        connect(mk, personId, src, extra, src === 'linkedin' || src === 'roster' ? null : email);
        if (rand() < 0.2) {
          const [src2, extra2] = randomSource();
          if (src2 !== src) connect(mk, personId, src2, extra2, src2 === 'linkedin' || src2 === 'roster' ? null : email);
        }
        // Overlap: some people are known by 2-3 members, preferring members with affinity for the cluster.
        const extraCount = rand() < 0.15 ? (rand() < 0.22 ? 2 : 1) : 0;
        const others = memberKeys.filter((k) => k !== mk && AFFINITY[k][cluster]);
        const fallback = memberKeys.filter((k) => k !== mk);
        const chosen = new Set();
        for (let j = 0; j < extraCount; j++) {
          const pool = others.length ? others : fallback;
          const w = Object.fromEntries(pool.filter((k) => !chosen.has(k)).map((k) => [k, AFFINITY[k][cluster] || 1]));
          if (!Object.keys(w).length) break;
          const ok = weighted(w);
          chosen.add(ok);
          const [s3, e3] = randomSource();
          connect(ok, personId, s3, e3, s3 === 'linkedin' || s3 === 'roster' ? null : email);
        }
      }
    }

    // 3. A little activity so the UI has something to show.
    const pid = (name) => stmt(db, 'SELECT id FROM people WHERE full_name = ?').get(name)?.id;
    const intro = (req, intr, person, msg, status) => {
      const p = pid(person);
      if (!p) return;
      stmt(db, 'INSERT INTO intro_requests (requester_id, introducer_id, person_id, message, status) VALUES (?,?,?,?,?)')
        .run(memberIds[req], memberIds[intr], p, msg, status);
    };
    intro('luis', 'grace', 'Gunnar Thorsby', 'Would love 20 minutes with Gunnar about piloting soil sensors at the next field day.', 'pending');
    intro('priya', 'eleanor', 'Marguerite Okonkwo-Hale', 'Hoping to learn how Highland Valley runs telehealth today.', 'accepted');
    intro('marcus', 'grace', 'Delphine Arceneaux', 'Exploring a short-term credential pilot with Cedar Valley.', 'done');
    const saved = pid('Marguerite Okonkwo-Hale');
    if (saved) stmt(db, `INSERT OR IGNORE INTO lead_feedback (member_id, person_id, verdict) VALUES (?, ?, 'saved')`).run(memberIds.priya, saved);

    // 4. Forum threads, job posts and a few saved searches.
    const ago = (hours) => `-${Math.round(hours * 60)} minutes`;
    for (const [authorKey, category, title, body, hoursAgo, voters, comments] of FORUM_THREADS) {
      const postId = Number(stmt(db, `INSERT INTO forum_posts (author_id, category, title, body, created_at) VALUES (?,?,?,?, datetime('now', ?))`)
        .run(memberIds[authorKey], category, title, body, ago(hoursAgo)).lastInsertRowid);
      for (const v of new Set([authorKey, ...voters])) {
        stmt(db, `INSERT OR IGNORE INTO forum_votes (member_id, target_type, target_id) VALUES (?, 'post', ?)`).run(memberIds[v], postId);
      }
      const ids = {};
      comments.forEach(([key, cAuthor, parentKey, cBody], i) => {
        const hours = Math.max(0.2, hoursAgo * (1 - (i + 1) / (comments.length + 1)));
        ids[key] = Number(stmt(db, `INSERT INTO forum_comments (post_id, parent_id, author_id, body, created_at) VALUES (?,?,?,?, datetime('now', ?))`)
          .run(postId, parentKey ? ids[parentKey] : null, memberIds[cAuthor], cBody, ago(hours)).lastInsertRowid);
        stmt(db, `INSERT OR IGNORE INTO forum_votes (member_id, target_type, target_id) VALUES (?, 'comment', ?)`).run(memberIds[cAuthor], ids[key]);
        if (rand() < 0.6) stmt(db, `INSERT OR IGNORE INTO forum_votes (member_id, target_type, target_id) VALUES (?, 'comment', ?)`).run(memberIds[authorKey], ids[key]);
      });
    }
    for (const [posterKey, title, company, location, workplace, type, fn, smin, smax, equity, description, applyUrl, daysAgo] of JOB_POSTS) {
      const biz = BUSINESSES[posterKey];
      stmt(db, `INSERT INTO jobs (poster_id, title, company, company_blurb, location, workplace, employment_type, job_function,
          salary_min, salary_max, equity, description, apply_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now', ?))`)
        .run(memberIds[posterKey], title, company, biz?.description || null, location, workplace, type, fn, smin, smax, equity, description, applyUrl, ago(daysAgo * 24));
    }
    for (const [mk, query, mode] of [['dana', 'dental association leaders in New England', 'leads'], ['dana', 'fractional CFO', 'talent'], ['luis', 'farm cooperatives in Wisconsin', 'leads']]) {
      stmt(db, 'INSERT OR IGNORE INTO saved_searches (member_id, query, mode) VALUES (?,?,?)').run(memberIds[mk], query, mode);
    }
  });

  stats.people = stmt(db, 'SELECT COUNT(*) AS n FROM people').get().n;
  return { memberIds, stats };
}

function removeDbFiles(p) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try { fs.rmSync(p + suffix, { force: true }); } catch { /* ignore */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dbPath = process.env.HUB_DB || DEFAULT_DB_PATH;
  removeDbFiles(dbPath);
  const db = openDb(dbPath);
  const t0 = Date.now();
  const { memberIds, stats } = seedDatabase(db);
  const perMember = db.prepare(`SELECT m.id, m.name, m.role, COUNT(DISTINCT c.person_id) AS n
      FROM members m LEFT JOIN connections c ON c.member_id = m.id GROUP BY m.id ORDER BY m.id`).all();
  db.close();
  console.log(`Seeded ${dbPath} in ${Date.now() - t0} ms: ${stats.members} members, ${stats.people} people, ${stats.connections} connections.`);
  for (const r of perMember) console.log(`  #${r.id} ${r.name} (${r.role}): ${r.n} people`);
  console.log(`BrightChair founder: #${memberIds.dana}; board member who knows the NH Dental Society director: #${memberIds.eleanor}`);
}

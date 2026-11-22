// Members, current member ("me"), and business profile routes.
import { Router } from 'express';
import { stmt, matching } from '../db.js';
import { HttpError, memberOut, requireMember, str, parseJsonArray, demoAuthEnabled, currentMember, httpUrl } from './util.js';

export const ROLES = ['founder', 'board', 'staff', 'mentor', 'investor'];

export const LEAD_TYPES = ['customer', 'connector', 'partner', 'investor', 'talent'];
const DEFAULT_LEAD_TYPES = ['customer', 'connector', 'partner'];
const MAX_CUSTOMER_INDUSTRIES = 12;

function businessOut(b) {
  if (!b) return null;
  const leadTypes = parseJsonArray(b.lead_types);
  return {
    id: b.id, member_id: b.member_id, name: b.name, description: b.description ?? null,
    industry: b.industry ?? null, target_customers: b.target_customers ?? null,
    geography: b.geography ?? null, needs: b.needs ?? null,
    customer_industries: parseJsonArray(b.customer_industries).filter((x) => typeof x === 'string'),
    lead_types: b.lead_types == null ? [...DEFAULT_LEAD_TYPES] : leadTypes.filter((x) => typeof x === 'string'),
    updated_at: b.updated_at,
  };
}

/** Member with profile fields. Never includes email or password_hash. */
export function profileOut(m) {
  if (!m) return null;
  return {
    ...memberOut(m), bio: m.bio ?? null, location: m.location ?? null,
    linkedin_url: m.linkedin_url ?? null, website_url: m.website_url ?? null, joined_at: m.created_at,
  };
}

/** Buyer-type ids the founder may pick (from the matching taxonomy). */
function pickableIds() {
  if (typeof matching.buyerTypes === 'function') return new Set(matching.buyerTypes().map((t) => t.id));
  return null; // matching module without a taxonomy: accept any well-formed id
}

/** Validates customer_industries / lead_types. Returns undefined when the field is absent (keep the stored value). */
function parseIdList(v, field, allowed, { max, allowEmpty }) {
  if (v === undefined) return undefined;
  if (v === null) return allowEmpty ? [] : undefined;
  if (!Array.isArray(v)) throw new HttpError(400, `${field} must be an array`);
  const out = [];
  for (const raw of v) {
    if (typeof raw !== 'string' || !/^[a-z0-9_]{1,40}$/.test(raw)) throw new HttpError(400, `${field} contains an invalid id`);
    if (allowed && !allowed.has(raw)) throw new HttpError(400, `Unknown ${field === 'lead_types' ? 'lead type' : 'buyer type'}: ${raw}`);
    if (!out.includes(raw)) out.push(raw);
  }
  if (out.length > max) throw new HttpError(400, `${field} can hold at most ${max} entries`);
  if (!allowEmpty && !out.length) throw new HttpError(400, 'Pick at least one kind of lead');
  return out;
}

function businessInput(body = {}) {
  return {
    name: str(body.name, 200),
    description: str(body.description, 4000),
    industry: str(body.industry, 500),
    target_customers: str(body.target_customers, 1000),
    geography: str(body.geography, 500),
    needs: str(body.needs, 1000),
    customer_industries: parseIdList(body.customer_industries, 'customer_industries', pickableIds(), { max: MAX_CUSTOMER_INDUSTRIES, allowEmpty: true }),
    lead_types: parseIdList(body.lead_types, 'lead_types', new Set(LEAD_TYPES), { max: LEAD_TYPES.length, allowEmpty: false }),
  };
}

/** { personas, suggested_customers, needs_input, message? } for a business (works with the test stub too). */
export function analyze(business) {
  if (typeof matching.analyzeBusiness === 'function') {
    const a = matching.analyzeBusiness(business);
    const out = { personas: a.personas || [], suggested_customers: a.suggested_customers || [], needs_input: Boolean(a.needs_input) };
    if (a.message) out.message = a.message;
    return out;
  }
  return { personas: matching.explainBusiness(business) || [], suggested_customers: [], needs_input: false };
}

export function memberStats(db, memberId) {
  const connections = stmt(db, 'SELECT COUNT(DISTINCT person_id) AS n FROM connections WHERE member_id = ?').get(memberId).n;
  const by_source = {};
  for (const r of stmt(db, 'SELECT source, COUNT(*) AS n FROM connections WHERE member_id = ? GROUP BY source ORDER BY source').all(memberId)) {
    by_source[r.source] = r.n;
  }
  const pool_people = stmt(db, 'SELECT COUNT(DISTINCT person_id) AS n FROM connections').get().n;
  const pool_members = stmt(db, 'SELECT COUNT(DISTINCT member_id) AS n FROM connections').get().n;
  return { connections, by_source, pool_people, pool_members };
}

export function membersRouter(db) {
  const r = Router();
  const auth = requireMember(db);

  // Member directory. Signed-in members only (open in demo mode, where it doubles as the member picker).
  r.get('/members', (req, res) => {
    if (!demoAuthEnabled() && !currentMember(db, req)) throw new HttpError(401, 'Please sign in');
    const rows = stmt(db, `SELECT m.id, m.name, m.org, m.role, m.headline,
        (SELECT COUNT(DISTINCT person_id) FROM connections c WHERE c.member_id = m.id) AS connection_count
        FROM members m ORDER BY m.id`).all();
    res.json(rows.map((m) => ({ ...memberOut(m), connection_count: m.connection_count })));
  });

  // Demo-only shortcut (HUB_DEMO_AUTH=1). Real accounts are created with POST /auth/signup.
  r.post('/members', (req, res) => {
    if (!demoAuthEnabled()) throw new HttpError(403, 'Create an account with the sign-up form');
    const name = str(req.body?.name, 200);
    if (!name) throw new HttpError(400, 'name is required');
    const email = str(req.body?.email, 320)?.toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'email is not valid');
    const role = str(req.body?.role, 20)?.toLowerCase() || 'founder';
    if (!ROLES.includes(role)) throw new HttpError(400, `role must be one of ${ROLES.join(', ')}`);
    if (email && stmt(db, 'SELECT 1 FROM members WHERE email = ?').get(email)) {
      throw new HttpError(409, 'A member with that email already exists');
    }
    const info = stmt(db, 'INSERT INTO members (name, email, org, role) VALUES (?,?,?,?)')
      .run(name, email, str(req.body?.org, 200), role);
    const m = stmt(db, 'SELECT * FROM members WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json({ ...memberOut(m), connection_count: 0 });
  });

  r.get('/me', auth, (req, res) => {
    const b = stmt(db, 'SELECT * FROM businesses WHERE member_id = ?').get(req.member.id);
    res.json({
      member: profileOut(req.member), business: businessOut(b), stats: memberStats(db, req.member.id),
      has_password: Boolean(req.member.password_hash),
    });
  });

  // Edit your own account profile. Omitted fields keep their value; null or "" clears optional ones.
  r.patch('/me', auth, (req, res) => {
    const body = req.body || {};
    const cur = req.member;
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    const name = has('name') ? str(body.name, 200) : cur.name;
    if (!name) throw new HttpError(400, 'name is required');
    const role = has('role') ? (str(body.role, 20)?.toLowerCase() || '') : cur.role;
    if (!ROLES.includes(role)) throw new HttpError(400, `role must be one of ${ROLES.join(', ')}`);
    const next = {
      name, role,
      org: has('org') ? str(body.org, 200) : cur.org,
      headline: has('headline') ? str(body.headline, 160) : cur.headline,
      bio: has('bio') ? str(body.bio, 2000) : cur.bio,
      location: has('location') ? str(body.location, 120) : cur.location,
      linkedin_url: has('linkedin_url') ? httpUrl(body.linkedin_url, 'LinkedIn link') : cur.linkedin_url,
      website_url: has('website_url') ? httpUrl(body.website_url, 'Website') : cur.website_url,
    };
    if (next.linkedin_url && !/(^|\.)linkedin\.com$/i.test(new URL(next.linkedin_url).hostname)) {
      throw new HttpError(400, 'LinkedIn link must be a linkedin.com address');
    }
    stmt(db, `UPDATE members SET name=?, role=?, org=?, headline=?, bio=?, location=?, linkedin_url=?, website_url=? WHERE id=?`)
      .run(next.name, next.role, next.org, next.headline, next.bio, next.location, next.linkedin_url, next.website_url, cur.id);
    res.json({ member: profileOut(stmt(db, 'SELECT * FROM members WHERE id = ?').get(cur.id)) });
  });

  // Public (members-only) profile of any member, with their recent forum posts and open jobs.
  r.get('/members/:id', auth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid member id');
    const m = stmt(db, 'SELECT * FROM members WHERE id = ?').get(id);
    if (!m) throw new HttpError(404, 'Member not found');
    const b = stmt(db, 'SELECT name, description, geography, needs FROM businesses WHERE member_id = ?').get(id);
    const posts = stmt(db, `SELECT p.id, p.title, p.category, p.created_at,
        (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id AND c.deleted = 0) AS comment_count,
        (SELECT COUNT(*) FROM forum_votes v WHERE v.target_type = 'post' AND v.target_id = p.id) AS score
        FROM forum_posts p WHERE p.author_id = ? ORDER BY p.id DESC LIMIT 10`).all(id);
    const jobs = stmt(db, `SELECT id, title, company, location, workplace, employment_type, job_function, created_at
        FROM jobs WHERE poster_id = ? AND status = 'open' ORDER BY id DESC LIMIT 10`).all(id);
    res.json({
      member: profileOut(m),
      business: b ? { name: b.name, description: b.description ?? null, geography: b.geography ?? null, needs: b.needs ?? null } : null,
      stats: {
        connections: stmt(db, 'SELECT COUNT(DISTINCT person_id) AS n FROM connections WHERE member_id = ?').get(id).n,
        posts: stmt(db, 'SELECT COUNT(*) AS n FROM forum_posts WHERE author_id = ?').get(id).n,
        comments: stmt(db, 'SELECT COUNT(*) AS n FROM forum_comments WHERE author_id = ? AND deleted = 0').get(id).n,
        intros_made: stmt(db, `SELECT COUNT(*) AS n FROM intro_requests WHERE introducer_id = ? AND status IN ('accepted','done')`).get(id).n,
      },
      posts, jobs,
    });
  });

  r.get('/taxonomy', (_req, res) => {
    res.json(typeof matching.buyerTypes === 'function' ? matching.buyerTypes() : []);
  });

  r.put('/business', auth, (req, res) => {
    const b = businessInput(req.body);
    if (!b.name) throw new HttpError(400, 'name is required');
    const existing = stmt(db, 'SELECT * FROM businesses WHERE member_id = ?').get(req.member.id);
    // Omitted fields keep their stored value (older clients do not send them); new rows get the schema defaults.
    const ci = b.customer_industries !== undefined ? JSON.stringify(b.customer_industries)
      : (existing ? existing.customer_industries : '[]');
    const lt = b.lead_types !== undefined ? JSON.stringify(b.lead_types)
      : (existing ? existing.lead_types : JSON.stringify(DEFAULT_LEAD_TYPES));
    stmt(db, `INSERT INTO businesses (member_id, name, description, industry, target_customers, geography, needs,
                customer_industries, lead_types, updated_at)
              VALUES (?,?,?,?,?,?,?,?,?, datetime('now'))
              ON CONFLICT(member_id) DO UPDATE SET name=excluded.name, description=excluded.description,
                industry=excluded.industry, target_customers=excluded.target_customers,
                geography=excluded.geography, needs=excluded.needs, customer_industries=excluded.customer_industries,
                lead_types=excluded.lead_types, updated_at=excluded.updated_at`)
      .run(req.member.id, b.name, b.description, b.industry, b.target_customers, b.geography, b.needs, ci, lt);
    const row = stmt(db, 'SELECT * FROM businesses WHERE member_id = ?').get(req.member.id);
    const business = businessOut(row);
    res.json({ business, ...analyze(business) });
  });

  r.post('/business/preview', auth, (req, res) => {
    const b = businessInput(req.body);
    res.json(analyze({ ...b, customer_industries: b.customer_industries || [], lead_types: b.lead_types }));
  });

  return r;
}

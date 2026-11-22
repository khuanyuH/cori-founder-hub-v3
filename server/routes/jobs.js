// Jobs board: members post openings at their firms. Applying happens on the company's own site (apply_url).
import { Router } from 'express';
import { stmt } from '../db.js';
import { HttpError, requireMember, memberOut, intParam, str, httpUrl } from './util.js';

export const JOB_OPTIONS = {
  workplace: [
    { id: 'onsite', label: 'On site' }, { id: 'hybrid', label: 'Hybrid' }, { id: 'remote', label: 'Remote' },
  ],
  employment_type: [
    { id: 'full_time', label: 'Full time' }, { id: 'part_time', label: 'Part time' }, { id: 'contract', label: 'Contract' },
    { id: 'fractional', label: 'Fractional' }, { id: 'internship', label: 'Internship' },
  ],
  job_function: [
    { id: 'engineering', label: 'Engineering' }, { id: 'product', label: 'Product' }, { id: 'design', label: 'Design' },
    { id: 'sales', label: 'Sales' }, { id: 'marketing', label: 'Marketing' }, { id: 'operations', label: 'Operations' },
    { id: 'finance', label: 'Finance' }, { id: 'customer', label: 'Customer success' }, { id: 'people', label: 'People and HR' },
    { id: 'other', label: 'Other' },
  ],
};
const ids = (k) => JOB_OPTIONS[k].map((o) => o.id);

const JOB_SELECT = `SELECT j.*, m.name AS p_name, m.role AS p_role, m.org AS p_org, m.headline AS p_headline,
    EXISTS (SELECT 1 FROM saved_jobs s WHERE s.job_id = j.id AND s.member_id = ?) AS saved
  FROM jobs j JOIN members m ON m.id = j.poster_id`;

function jobOut(row, memberId, { full = false } = {}) {
  const text = String(row.description || '').replace(/\s+/g, ' ').trim();
  return {
    id: row.id, title: row.title, company: row.company, company_url: row.company_url ?? null,
    company_blurb: row.company_blurb ?? null, location: row.location ?? null, workplace: row.workplace,
    employment_type: row.employment_type, job_function: row.job_function,
    salary_min: row.salary_min ?? null, salary_max: row.salary_max ?? null, equity: row.equity ?? null,
    ...(full ? { description: row.description } : { excerpt: text.length > 200 ? `${text.slice(0, 200).replace(/\s+\S*$/, '')}…` : text }),
    apply_url: row.apply_url, status: row.status, created_at: row.created_at, updated_at: row.updated_at ?? null,
    poster: memberOut({ id: row.poster_id, name: row.p_name, role: row.p_role, org: row.p_org, headline: row.p_headline }),
    saved: Boolean(row.saved), mine: row.poster_id === memberId,
  };
}

function money(v, field) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new HttpError(400, `${field} must be a yearly amount in US dollars`);
  return Math.round(n);
}

function pickOption(v, key, def) {
  const s = str(v, 20) || def;
  if (!ids(key).includes(s)) throw new HttpError(400, `${key} must be one of ${ids(key).join(', ')}`);
  return s;
}

/** Validates a full job. `base` supplies stored values for a partial update. */
function jobInput(body = {}, base = {}) {
  const get = (k) => (Object.prototype.hasOwnProperty.call(body, k) ? body[k] : base[k]);
  const title = str(get('title'), 160);
  if (!title) throw new HttpError(400, 'Job title is required');
  const company = str(get('company'), 160);
  if (!company) throw new HttpError(400, 'Company name is required');
  const description = str(get('description'), 12000);
  if (!description || description.length < 30) throw new HttpError(400, 'Describe the job in at least a few sentences');
  const applyUrl = httpUrl(get('apply_url'), 'Application link', 1000);
  if (!applyUrl) throw new HttpError(400, 'Add the link where people apply');
  const salaryMin = money(get('salary_min'), 'Minimum salary');
  const salaryMax = money(get('salary_max'), 'Maximum salary');
  if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) throw new HttpError(400, 'Maximum salary is below the minimum');
  return {
    title, company, description, apply_url: applyUrl,
    company_url: httpUrl(get('company_url'), 'Company website'),
    company_blurb: str(get('company_blurb'), 1200),
    location: str(get('location'), 160),
    workplace: pickOption(get('workplace'), 'workplace', 'onsite'),
    employment_type: pickOption(get('employment_type'), 'employment_type', 'full_time'),
    job_function: pickOption(get('job_function'), 'job_function', 'other'),
    salary_min: salaryMin, salary_max: salaryMax,
    equity: str(get('equity'), 80),
  };
}

function idParam(v) {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid job id');
  return id;
}

export function jobsRouter(db) {
  const r = Router();
  const auth = requireMember(db);

  r.get('/jobs/options', (_req, res) => res.json(JOB_OPTIONS));

  r.get('/jobs', auth, (req, res) => {
    const where = [];
    const args = [req.member.id];
    const mine = req.query.mine === '1';
    const savedOnly = req.query.saved === '1';
    if (mine) { where.push('j.poster_id = ?'); args.push(req.member.id); } else where.push(`j.status = 'open'`);
    if (savedOnly) { where.push('EXISTS (SELECT 1 FROM saved_jobs s WHERE s.job_id = j.id AND s.member_id = ?)'); args.push(req.member.id); }
    for (const key of ['workplace', 'employment_type', 'job_function']) {
      const v = str(req.query[key], 20);
      if (!v) continue;
      if (!ids(key).includes(v)) throw new HttpError(400, `Unknown ${key}`);
      where.push(`j.${key} = ?`); args.push(v);
    }
    const q = str(req.query.q, 200);
    if (q) {
      for (const word of q.split(/\s+/).slice(0, 6)) {
        const like = `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        where.push(`(j.title LIKE ? ESCAPE '\\' OR j.company LIKE ? ESCAPE '\\' OR j.location LIKE ? ESCAPE '\\' OR j.description LIKE ? ESCAPE '\\')`);
        args.push(like, like, like, like);
      }
    }
    const limit = intParam(req.query.limit, 50, 1, 100);
    const offset = intParam(req.query.offset, 0, 0, 100000);
    const rows = db.prepare(`${JOB_SELECT} WHERE ${where.join(' AND ')} ORDER BY j.id DESC`).all(...args);
    const open = stmt(db, `SELECT COUNT(*) AS jobs, COUNT(DISTINCT lower(company)) AS companies FROM jobs WHERE status = 'open'`).get();
    res.json({
      total: rows.length, items: rows.slice(offset, offset + limit).map((j) => jobOut(j, req.member.id)),
      open_jobs: open.jobs, open_companies: open.companies,
    });
  });

  r.post('/jobs', auth, (req, res) => {
    const j = jobInput(req.body);
    const info = stmt(db, `INSERT INTO jobs (poster_id, title, company, company_url, company_blurb, location, workplace, employment_type,
        job_function, salary_min, salary_max, equity, description, apply_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(req.member.id, j.title, j.company, j.company_url, j.company_blurb, j.location, j.workplace, j.employment_type,
        j.job_function, j.salary_min, j.salary_max, j.equity, j.description, j.apply_url);
    res.status(201).json(jobOut(db.prepare(`${JOB_SELECT} WHERE j.id = ?`).get(req.member.id, Number(info.lastInsertRowid)), req.member.id, { full: true }));
  });

  r.get('/jobs/:id', auth, (req, res) => {
    const row = db.prepare(`${JOB_SELECT} WHERE j.id = ?`).get(req.member.id, idParam(req.params.id));
    if (!row) throw new HttpError(404, 'Job not found');
    res.json(jobOut(row, req.member.id, { full: true }));
  });

  r.patch('/jobs/:id', auth, (req, res) => {
    const id = idParam(req.params.id);
    const row = stmt(db, 'SELECT * FROM jobs WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'Job not found');
    if (row.poster_id !== req.member.id) throw new HttpError(403, 'Only the member who posted this job can change it');
    const j = jobInput(req.body, row);
    const status = req.body?.status === undefined ? row.status : str(req.body.status, 10);
    if (status !== 'open' && status !== 'closed') throw new HttpError(400, 'status must be open or closed');
    stmt(db, `UPDATE jobs SET title=?, company=?, company_url=?, company_blurb=?, location=?, workplace=?, employment_type=?,
        job_function=?, salary_min=?, salary_max=?, equity=?, description=?, apply_url=?, status=?, updated_at=datetime('now') WHERE id=?`)
      .run(j.title, j.company, j.company_url, j.company_blurb, j.location, j.workplace, j.employment_type,
        j.job_function, j.salary_min, j.salary_max, j.equity, j.description, j.apply_url, status, id);
    res.json(jobOut(db.prepare(`${JOB_SELECT} WHERE j.id = ?`).get(req.member.id, id), req.member.id, { full: true }));
  });

  r.delete('/jobs/:id', auth, (req, res) => {
    const id = idParam(req.params.id);
    const row = stmt(db, 'SELECT poster_id FROM jobs WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'Job not found');
    if (row.poster_id !== req.member.id && req.member.role !== 'staff') throw new HttpError(403, 'Only the poster or CORI staff can delete this job');
    stmt(db, 'DELETE FROM jobs WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  r.post('/jobs/:id/save', auth, (req, res) => {
    const id = idParam(req.params.id);
    if (!stmt(db, 'SELECT 1 FROM jobs WHERE id = ?').get(id)) throw new HttpError(404, 'Job not found');
    if (req.body?.saved === false) stmt(db, 'DELETE FROM saved_jobs WHERE member_id = ? AND job_id = ?').run(req.member.id, id);
    else stmt(db, 'INSERT OR IGNORE INTO saved_jobs (member_id, job_id) VALUES (?,?)').run(req.member.id, id);
    res.json({ saved: req.body?.saved !== false });
  });

  return r;
}

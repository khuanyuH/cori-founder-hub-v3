// Composes all /api routes.
import express, { Router } from 'express';
import { membersRouter } from './members.js';
import { importsRouter } from './imports.js';
import { networkRouter } from './network.js';
import { leadsRouter } from './leads.js';
import { introsRouter } from './intros.js';
import { authRouter } from './auth.js';
import { searchesRouter } from './searches.js';
import { forumRouter } from './forum.js';
import { jobsRouter } from './jobs.js';
import { HttpError } from './util.js';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const PRIVATE_KEYS = new Set(['email', 'private_email', 'phone', 'phone_number', 'emails', 'phones', 'password_hash', 'password']);
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/**
 * Scrub one string. Web addresses keep their digits: a long number in a link (a LinkedIn profile id,
 * a job-board posting id) is not a phone number. Email addresses are removed everywhere.
 */
function scrubString(s) {
  let out = '';
  let last = 0;
  for (const m of s.matchAll(URL_RE)) {
    out += s.slice(last, m.index).replace(EMAIL_RE, '[hidden]').replace(PHONE_RE, '[hidden]');
    out += m[0].replace(EMAIL_RE, '[hidden]');
    last = m.index + m[0].length;
  }
  return out + s.slice(last).replace(EMAIL_RE, '[hidden]').replace(PHONE_RE, '[hidden]');
}

/**
 * Defence in depth for the privacy rule: drop email/phone keys and blank out anything that
 * looks like an email address or phone number in every JSON response.
 */
export function scrubForResponse(value) {
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(scrubForResponse);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (PRIVATE_KEYS.has(k)) continue;
      out[k] = scrubForResponse(v);
    }
    return out;
  }
  return value;
}

export function apiRouter(db) {
  const r = Router();
  r.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body) => json(scrubForResponse(body));
    next();
  });
  r.use(express.json({ limit: '5mb' }));
  r.get('/health', (_req, res) => res.json({ ok: true }));
  r.use(authRouter(db));
  r.use(membersRouter(db));
  r.use(searchesRouter(db));
  r.use(forumRouter(db));
  r.use(jobsRouter(db));
  r.use(importsRouter(db));
  r.use(networkRouter(db));
  r.use(leadsRouter(db));
  r.use(introsRouter(db));
  r.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
  // eslint-disable-next-line no-unused-vars
  r.use((err, _req, res, _next) => {
    let status = err.status || err.statusCode || 500;
    if (err.type === 'entity.parse.failed') status = 400;
    if (status >= 500) console.error('[hub]', err);
    const message = status >= 500 ? 'Internal server error' : (err.message || 'Request failed');
    res.status(status).json({ error: message });
  });
  return r;
}

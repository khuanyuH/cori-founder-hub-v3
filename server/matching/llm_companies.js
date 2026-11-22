// Optional LLM classification of companies that the built-in table and the generic cues miss.
//
// - Off the hot path: imports and searches never call it. `npm run reenrich` calls it (batched) only when
//   ANTHROPIC_API_KEY is set, then applies the cached answers while recomputing every person.
// - Sends company names ONLY (never person names, titles, emails, notes or URLs). Company strings that look
//   like they contain a person ("Professor Jane Doe, History Department", "Dr. Smith and Associates") are skipped.
// - Answers are cached in `company_classifications` (created here with CREATE TABLE IF NOT EXISTS), including
//   "unknown" answers, so a company is asked about once.

import { INDUSTRIES } from './taxonomy.js';
import { llmAvailable, llmModel, callClaude, extractJson } from './llm.js';
import { companyKey } from './companies.js';

const ORG_TYPES = new Set(['company', 'association', 'government', 'nonprofit', 'education', 'healthcare_provider', 'investor', 'other']);
const INDUSTRY_IDS = new Set(INDUSTRIES.map((i) => i.id));
const PERSONISH = /\b(professor|prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?|mx\.?|lab of|office of (senator|representative|congress(wo)?man)|for congress|for senate|for mayor)\b/i;

export function ensureCompanyCache(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS company_classifications (
    company_key TEXT PRIMARY KEY,
    company     TEXT NOT NULL,
    industries  TEXT NOT NULL DEFAULT '[]',
    org_type    TEXT,
    model       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

function hasCacheTable(db) {
  try {
    return Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'company_classifications'`).get());
  } catch { return false; }
}

/** Cached classification for one company, or null (also null when the table does not exist). */
export function cachedCompanyClass(db, company) {
  const key = companyKey(company);
  if (!key || !hasCacheTable(db)) return null;
  const row = db.prepare('SELECT industries, org_type FROM company_classifications WHERE company_key = ?').get(key);
  if (!row) return null;
  let industries = [];
  try { industries = JSON.parse(row.industries || '[]'); } catch { industries = []; }
  industries = (Array.isArray(industries) ? industries : []).filter((id) => INDUSTRY_IDS.has(id)).slice(0, 3);
  const org_type = ORG_TYPES.has(row.org_type) ? row.org_type : null;
  if (!industries.length && !org_type) return null;
  return { industries, org_type };
}

/**
 * Merge a cached LLM answer into a heuristic result, only where the heuristics found nothing.
 * Never overrides a heuristic industry; org_type only replaces 'company'/'other'.
 */
export function applyCompanyCache(db, company, enriched) {
  if (!enriched || !company) return enriched;
  if (enriched.industries && enriched.industries.length) return enriched;
  const hit = cachedCompanyClass(db, company);
  if (!hit) return enriched;
  const out = { ...enriched, industries: hit.industries.length ? hit.industries : enriched.industries };
  if (hit.org_type && ['company', 'other', null, undefined].includes(enriched.org_type)) out.org_type = hit.org_type;
  return out;
}

const SYSTEM = 'You classify organisations by name for a professional-network tool. For each company name, give up to 2 industry ids ' +
  `from this list: ${[...INDUSTRY_IDS].join(', ')}; and one org_type from: ${[...ORG_TYPES].join(', ')}. ` +
  'org_type "association" means ONLY a trade or professional membership association that reaches an industry\'s businesses or ' +
  'practitioners (e.g. a state dental society, a bankers association, a farm bureau, a chamber of commerce). Student clubs, campus ' +
  'groups, alumni associations, sports leagues, unions, historical/arts/advocacy societies, legal aid and charities are NOT associations ' +
  '(use education, nonprofit, company or other). "investor" means venture, private equity, hedge fund or asset manager. ' +
  'If you do not recognise the organisation, return industries [] and org_type null. Never guess. ' +
  'Reply with JSON only: {"results":[{"i":number,"industries":[string],"org_type":string|null}]}';

/**
 * Ask the model about companies not yet cached. Batched; company names only.
 * @returns {Promise<{ asked: number, stored: number, batches: number, failed: number }>}
 */
export async function classifyCompaniesWithLlm(db, companies, { batchSize = 40, maxBatches = 25 } = {}) {
  const stats = { asked: 0, stored: 0, batches: 0, failed: 0 };
  if (!llmAvailable()) return stats;
  ensureCompanyCache(db);
  const seen = new Set();
  const todo = [];
  const has = db.prepare('SELECT 1 FROM company_classifications WHERE company_key = ?');
  for (const raw of companies) {
    const name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const key = companyKey(name);
    if (!key || key.length < 2 || seen.has(key) || PERSONISH.test(name)) continue;
    seen.add(key);
    if (has.get(key)) continue;
    todo.push({ key, name });
  }
  const insert = db.prepare(`INSERT OR REPLACE INTO company_classifications (company_key, company, industries, org_type, model)
                             VALUES (?, ?, ?, ?, ?)`);
  for (let b = 0; b < todo.length && stats.batches < maxBatches; b += batchSize) {
    const batch = todo.slice(b, b + batchSize);
    stats.batches++;
    stats.asked += batch.length;
    let results;
    try {
      const text = await callClaude({
        system: SYSTEM,
        user: JSON.stringify({ companies: batch.map((x, i) => ({ i, name: x.name })) }),
        maxTokens: 4000,
        timeoutMs: 30000,
      });
      const parsed = extractJson(text);
      results = Array.isArray(parsed.results) ? parsed.results : null;
    } catch {
      results = null;
    }
    if (!results) { stats.failed++; continue; }
    const byI = new Map();
    for (const r of results) {
      const i = Number(r && r.i);
      if (!Number.isInteger(i) || i < 0 || i >= batch.length) continue;
      const industries = (Array.isArray(r.industries) ? r.industries : []).filter((id) => INDUSTRY_IDS.has(id)).slice(0, 2);
      const org_type = ORG_TYPES.has(r.org_type) ? r.org_type : null;
      byI.set(i, { industries, org_type });
    }
    for (let i = 0; i < batch.length; i++) {
      const r = byI.get(i) || { industries: [], org_type: null }; // remember "unknown" so it is not asked again
      insert.run(batch[i].key, batch[i].name, JSON.stringify(r.industries), r.org_type, llmModel());
      stats.stored++;
    }
  }
  return stats;
}

// Pool search: candidate retrieval (FTS5 BM25 + structured), scoring, reasons, known_by.
//
// Strategies (selectable for the eval; 'full' is the shipped default):
//   'fts'    A: plain FTS5 keyword OR-query over every column, ranked by BM25 only.
//   'expand' B: taxonomy query expansion + structured boosts (industry, seniority, geography,
//              network). No connector awareness, no vendor detection.
//   'full'   C: B + connector-aware role fit (associations, regulators, distributors, GPOs...),
//              vendor-vs-buyer separation, persona lead types (used by suggestLeads).

import { BY_ID, SERVICE_IDS, GOVERNMENT_IDS, normalize } from './taxonomy.js';
import { parseQuery, industryExpansion, STOPWORDS } from './query.js';
import { locationState, stateName } from './geo.js';
import { analyzeOrg, isConnectorKind, connectorLink, EARLY_LABELS } from './enrich.js';
import { llmAvailable, llmRerank } from './llm.js';

const STRENGTH = { strong: 1, some: 0.7, weak: 0.45 };
const STRENGTH_RANK = { strong: 3, some: 2, weak: 1 };
const SENIORITY_FIT = { owner: 1, c_level: 1, vp: 0.92, director: 0.9, manager: 0.82, ic: 0.55, unknown: 0.55 };
const SENIOR_LEVELS = new Set(['owner', 'c_level', 'vp', 'director']);
const EDUCATION_IDS = new Set(['higher_education', 'k12_education', 'childcare', 'libraries', 'workforce_development']);
// Students, interns, incoming hires, trainees and volunteers: far down for every lead type except talent.
const EARLY_FIT = 0.2;
const VENTURE_QUERY = /\b(venture|vcs?|angels?|seed|pre-?seed|early[- ]stage|startups?)\b/i;
// For a venture ask: how well each investor style fits (a buyout or hedge fund is a weaker first call).
const STYLE_FIT = { venture: 1, growth: 0.9, other: 0.85, pe: 0.75, am: 0.65, hedge: 0.6, bank: 0.5, trading: 0.4 };
// How many customers one relationship can reach, by connector kind (associations and buying groups reach the most).
const STRONG_LINKS = new Set(['remit', 'title_remit', 'industry', 'connector_phrase', 'sector_remit', 'sector_phrase', 'sector_channel']);
const REACH = { association: 1, gpo: 1, extension: 1, cooperative: 0.95, distributor: 0.95, lender: 0.9, regulator: 0.88,
  economic_development: 0.85, government: 0.82, chamber: 0.8 };

// ---------------------------------------------------------------------------
// FTS helpers

function ftsToken(t) {
  const clean = normalize(t).trim();
  return clean ? `"${clean}"` : null;
}

function ftsOr(terms) {
  const toks = [...new Set(terms.map(ftsToken).filter(Boolean))];
  return toks.length ? toks.join(' OR ') : null;
}

function runFts(db, expr, limit, weights = '0, 2, 2, 0.5, 1') {
  if (!expr) return [];
  try {
    return db.prepare(
      `SELECT rowid AS id, bm25(people_fts, ${weights}) AS s FROM people_fts WHERE people_fts MATCH ? ORDER BY s LIMIT ?`,
    ).all(expr, limit);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Loading rows

function loadPeople(db, ids) {
  if (!ids.length) return new Map();
  const rows = db.prepare(
    `SELECT id, full_name, company, title, location, linkedin_url, industries, org_type, job_function, seniority
       FROM people WHERE id IN (SELECT value FROM json_each(?))`,
  ).all(JSON.stringify(ids));
  const map = new Map();
  for (const r of rows) {
    let inds = [];
    try { inds = JSON.parse(r.industries || '[]'); } catch { inds = []; }
    map.set(r.id, { ...r, industries: Array.isArray(inds) ? inds : [] });
  }
  return map;
}

function loadKnownBy(db, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const rows = db.prepare(
    `SELECT c.person_id, c.member_id, m.name, m.role, c.source, c.strength, c.interaction_count, c.note
       FROM connections c JOIN members m ON m.id = c.member_id
      WHERE c.person_id IN (SELECT value FROM json_each(?))`,
  ).all(JSON.stringify(ids));
  for (const r of rows) {
    let byMember = map.get(r.person_id);
    if (!byMember) { byMember = new Map(); map.set(r.person_id, byMember); }
    let k = byMember.get(r.member_id);
    if (!k) {
      k = { member_id: r.member_id, name: r.name, role: r.role, strength: r.strength, sources: [], note: null, _ic: 0 };
      byMember.set(r.member_id, k);
    }
    if ((STRENGTH_RANK[r.strength] || 0) > (STRENGTH_RANK[k.strength] || 0)) k.strength = r.strength;
    if (!k.sources.includes(r.source)) k.sources.push(r.source);
    if (!k.note && r.note) k.note = r.note;
    k._ic += r.interaction_count || 0;
  }
  const out = new Map();
  for (const [pid, byMember] of map) {
    out.set(pid, [...byMember.values()]
      .sort((a, b) => (STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength]) || (b._ic - a._ic) || (a.member_id - b.member_id))
      .map(({ _ic, ...k }) => k));
  }
  return out;
}

function loadDismissed(db, memberId) {
  if (memberId == null) return new Set();
  try {
    return new Set(db.prepare(`SELECT person_id FROM lead_feedback WHERE member_id = ? AND verdict = 'dismissed'`)
      .all(memberId).map((r) => r.person_id));
  } catch { return new Set(); }
}

// ---------------------------------------------------------------------------
// Candidate retrieval

function retrieve(db, intent, strategy, mode) {
  const bm = new Map();
  const addFts = (rows) => {
    if (!rows.length) return;
    const best = Math.min(...rows.map((r) => r.s));
    for (const r of rows) {
      const v = best < 0 ? r.s / best : 0;
      if (!bm.has(r.id) || bm.get(r.id) < v) bm.set(r.id, v);
    }
  };
  const ids = new Set();

  if (strategy === 'fts') {
    const words = normalize(intent.raw).trim().split(' ').filter((w) => w.length > 1 && !STOPWORDS.has(w));
    const rows = runFts(db, ftsOr(words), 200, '1, 1, 1, 1, 1');
    addFts(rows);
    rows.forEach((r) => ids.add(r.id));
    return { ids: [...ids], bm };
  }

  // Free terms + industry expansion over company/title/tags (names excluded unless 'any' or a name-like query).
  const expanded = industryExpansion(intent);
  const terms = [...expanded, ...intent.terms, ...intent.kindTerms, ...(mode === 'talent' ? intent.roleTerms : [])];
  const orExpr = ftsOr(terms);
  if (orExpr) {
    const rows = runFts(db, `{company title tags} : (${orExpr})`, 400);
    addFts(rows);
    rows.forEach((r) => ids.add(r.id));
  }
  const nameLike = !intent.industries.length && !intent.functions.length && !intent.orgIntent.length && intent.terms.length;
  if ((mode === 'any' || nameLike) && intent.terms.length) {
    const rows = runFts(db, `{full_name} : (${ftsOr(intent.terms)})`, 50, '3, 0, 0, 0, 0');
    rows.forEach((r) => { ids.add(r.id); if (!bm.has(r.id)) bm.set(r.id, 0.9); });
  }
  // Structured: everyone tagged with a query industry.
  for (const x of intent.industries) {
    for (const r of db.prepare(`SELECT id FROM people WHERE industries LIKE ? LIMIT 3000`).all(`%"${x.id}"%`)) ids.add(r.id);
  }
  // Structured: org kind without industry ("associations in New England").
  if (!intent.industries.length && intent.orgIntent.length) {
    const types = new Set();
    for (const k of intent.orgIntent) {
      if (k === 'investor') types.add('investor');
      else if (k === 'government' || k === 'regulator' || k === 'economic_development') types.add('government');
      else types.add('association');
    }
    if (intent.orgIntent.includes('economic_development')) types.add('association');
    for (const r of db.prepare(`SELECT id FROM people WHERE org_type IN (SELECT value FROM json_each(?)) LIMIT 3000`)
      .all(JSON.stringify([...types]))) ids.add(r.id);
  }
  // Structured: distributors/wholesalers when the query asks for them.
  if (intent.orgIntent.includes('distributor')) {
    for (const r of db.prepare(`SELECT id FROM people WHERE industries LIKE '%"wholesale_distribution"%' LIMIT 3000`).all()) ids.add(r.id);
  }
  // Structured: talent by job function.
  if (mode === 'talent' && intent.functions.length) {
    for (const r of db.prepare(`SELECT id FROM people WHERE job_function IN (SELECT value FROM json_each(?)) LIMIT 3000`)
      .all(JSON.stringify(intent.functions))) ids.add(r.id);
  }
  return { ids: [...ids], bm };
}

// ---------------------------------------------------------------------------
// Scoring

function industryMatch(p, intent, an, noRelated = false) {
  let best = 0; let bestId = null; let related = false;
  let nameText = null;
  for (const x of intent.industries) {
    const idx = p.industries.indexOf(x.id);
    if (idx >= 0) {
      let v = x.weight * (idx === 0 ? 1 : 0.85);
      // "federal government" is a broad tag (Congress, the Army, courts): a query for "USDA Rural Development"
      // should favour people whose organisation or title actually names it.
      if (x.id === 'federal_government') {
        if (nameText === null) nameText = normalize(`${p.company || ''} ${p.title || ''}`);
        if (!x.hits.some((h) => nameText.includes(` ${h} `))) v *= 0.5;
      }
      if (v > best) { best = v; bestId = x.id; related = false; }
    } else if (!noRelated) {
      const ind = BY_ID[x.id];
      const rel = ind && p.industries.some((pi) => ind.related.includes(pi) || (BY_ID[pi] && BY_ID[pi].related.includes(x.id)));
      if (rel && 0.3 * x.weight > best) { best = 0.3 * x.weight; bestId = x.id; related = true; }
    }
  }
  void an;
  return { score: best, id: bestId, related };
}

function kindMatchesIntent(kind, orgIntent) {
  if (!orgIntent.length) return false;
  if (orgIntent.includes(kind)) return true;
  if (kind === 'regulator' && orgIntent.includes('government')) return true;
  if (kind === 'government' && orgIntent.includes('regulator')) return true;
  if (kind === 'cooperative' && orgIntent.includes('association')) return true;
  if (kind === 'chamber' && orgIntent.includes('association')) return true;
  if (kind === 'extension' && (orgIntent.includes('cooperative') || orgIntent.includes('government'))) return true;
  if (kind === 'economic_development' && orgIntent.includes('government')) return true;
  if (kind === 'gpo' && orgIntent.includes('distributor')) return true;
  return false;
}

function effectiveKind(p, an, intent, ctx) {
  let kind = an.kind;
  // When the founder sells TO government (e.g. broadband to towns), a town is a customer, not a connector.
  const govCustomer = (ctx.customerIndustries || intent.industries.map((x) => x.id)).some((id) => GOVERNMENT_IDS.has(id));
  if (kind === 'government' && govCustomer && p.industries.some((id) => GOVERNMENT_IDS.has(id) || id === 'libraries' || id === 'k12_education')) {
    kind = 'provider';
  }
  return kind;
}

function roleFitFull(p, kind, an, intent, leadType, mode, ctx = {}) {
  const fit = roleFitCore(p, kind, an, intent, leadType, mode, ctx);
  return an.early && mode !== 'any' ? fit * EARLY_FIT : fit;
}

function roleFitCore(p, kind, an, intent, leadType, mode, ctx = {}) {
  const sen = SENIORITY_FIT[p.seniority] ?? 0.55;
  const clinicalBuyer = p.job_function === 'clinical' && (p.org_type === 'healthcare_provider') ? 0.75 : 0;
  // Front-line individual roles (caregiver, technician, assistant...) rarely decide purchases.
  let buyer = an.frontLine ? Math.min(0.35, Math.max(sen, clinicalBuyer)) : Math.max(sen, clinicalBuyer);
  // A dental school is education, not a dental office: half credit as a buyer for a non-education market.
  if (p.org_type === 'education' && intent.industries.length && !intent.industries.some((x) => EDUCATION_IDS.has(x.id))) buyer *= 0.5;
  const conn = isConnectorKind(kind);
  const lt = leadType || (intent.orgIntent.includes('investor') && !intent.connectorIntent ? 'investor'
    : intent.connectorIntent ? 'connector' : null);
  if (mode === 'any') return conn && intent.connectorIntent ? 1 : 0.9;
  switch (lt) {
    case 'connector': {
      if (!conn) return (an.vendor ? 0.15 : (kind === 'multi_site' ? 0.5 : 0.25)) * (an.frontLine ? 0.4 : 1);
      const m = kindMatchesIntent(kind, intent.orgIntent) || !intent.orgIntent.length ? 1 : 0.75;
      return m * (REACH[kind] ?? 0.85) * (0.7 + 0.3 * sen);
    }
    case 'customer':
      if (an.vendor) return 0.12;
      // For a confirmed buyer type, a front-line role (attendant, cashier, technician...) is not the buyer.
      if (ctx.onlyIndustries && an.frontLine) return 0.1;
      if (kind === 'investor') return 0.1;
      if (kind === 'multi_site') return 1;
      if (conn) return 0.45;
      return buyer;
    case 'partner': {
      // A partnership needs someone who can sign one: business development, a founder/owner, or leadership.
      // Front-line staff (caregiver, technician, assistant...) are not partnership contacts at all.
      const role = an.partnerRole || SENIOR_LEVELS.has(p.seniority) ? 1 : p.seniority === 'manager' && !an.frontLine ? 0.6 : an.frontLine ? 0.05 : 0.25;
      // A partner must specialise in the founder's customers: a generalist consultancy or agency is not a partner
      // just because it is a consultancy.
      if (!servesCustomers(p, an, ctx.customerIndustries)) return 0.06 * role;
      if (an.vendor) return 0.95 * role;
      if (kind === 'distributor') return 0.7 * role;
      return (conn ? 0.35 : 0.3) * role;
    }
    case 'investor': {
      if (kind !== 'investor') return 0.08;
      // Associates and principals source deals: seniority matters less here than for buyers.
      const style = VENTURE_QUERY.test(intent.raw) ? (STYLE_FIT[an.investorStyle] ?? 0.85) : 1;
      return (0.85 + 0.15 * sen) * style;
    }
    default:
      if (an.vendor) return 0.3;
      if (kind === 'investor') return 0.35;
      if (kind === 'multi_site') return 1;
      if (conn) return 0.95 * (REACH[kind] ?? 0.85) * (0.75 + 0.25 * sen);
      return buyer;
  }
}

/** True when the person's organisation is in, or specialises in, one of the founder's customer industries. */
function servesCustomers(p, an, customerIndustries) {
  if (!customerIndustries || !customerIndustries.length) return true;
  const cust = new Set(customerIndustries);
  const near = (id) => cust.has(id) || customerIndustries.some((c) => BY_ID[c] && BY_ID[c].related.includes(id) && !SERVICE_IDS.has(id));
  if (an.serves.some(near)) return true;
  return p.industries.some((id) => !SERVICE_IDS.has(id) && near(id));
}

function roleFitExpand(p) {
  // B: structured boosts only (seniority / org type), no connector or vendor logic.
  const sen = SENIORITY_FIT[p.seniority] ?? 0.55;
  return p.org_type === 'other' ? sen * 0.8 : sen;
}

function talentScore(p, intent) {
  const title = normalize(p.title);
  // A title hit ("CFO") is strong evidence; a matching function alone ("Financial Advisor" for CFO) is weak.
  let fn = intent.functions.includes(p.job_function) ? 0.3 : 0;
  const termHits = intent.roleTerms.filter((t) => title.includes(` ${t} `));
  if (termHits.length) fn = Math.max(fn, 0.55) + 0.3;
  if (intent.fractional && /\b(fractional|interim|part time|consultant|advisor|freelance)\b/.test(title)) fn += 0.15;
  const sen = SENIORITY_FIT[p.seniority] ?? 0.55;
  return { score: Math.min(1, fn) * (0.8 + 0.2 * sen), termHits };
}

// Reviewed after the real-data import: a flatter blend (0.88/0.08/0.04, ~8% spread) changed nothing in the
// eval or on real data except lowering the motivating case, so the original weights are kept (eval/run.js
// prints both). Weak-vs-best spread is ~14%: ties nudge, relevance decides.
export const NET_WEIGHTS = { base: 0.78, strength: 0.17, multi: 0.05 };
let NET_BASE = NET_WEIGHTS.base; let NET_STRENGTH = NET_WEIGHTS.strength; let NET_MULTI = NET_WEIGHTS.multi;
/** For the eval only: compare score blends. */
export function _setNetworkWeights(w) {
  NET_BASE = w ? w.base : NET_WEIGHTS.base; NET_STRENGTH = w ? w.strength : NET_WEIGHTS.strength; NET_MULTI = w ? w.multi : NET_WEIGHTS.multi;
}

function networkFactor(known, memberId) {
  const others = known.filter((k) => k.member_id !== memberId);
  if (!others.length) return { f: 0.8, others, strongest: null };
  const strongest = others[0];
  const s = STRENGTH[strongest.strength] ?? 0.45;
  const n = others.length;
  // Ties nudge and break ties; they must not let a weakly relevant strong tie beat a clearly relevant weak tie.
  // A strong tie or several introducers lift a lead by up to ~14% over a single weak tie.
  return { f: Math.min(1, NET_BASE + NET_STRENGTH * s + NET_MULTI * Math.min(1, (n - 1) / 2)), others, strongest };
}

// ---------------------------------------------------------------------------
// Reasons

function leadWord(p) { return SENIOR_LEVELS.has(p.seniority) ? 'Leads' : 'Works at'; }
function article(word) { return /^[aeiou]/i.test(word) ? 'an' : 'a'; }

function targetIndustryFor(p, im, an, ctx) {
  const cust = ctx && ctx.customerIndustries ? ctx.customerIndustries.find((id) => p.industries.includes(id)) : null;
  if (cust) return BY_ID[cust];
  if (im.id && !im.related && im.id !== 'wholesale_distribution') return BY_ID[im.id];
  const own = an.serves.find((id) => BY_ID[id] && id !== 'wholesale_distribution') ||
    p.industries.find((id) => !SERVICE_IDS.has(id) && id !== 'wholesale_distribution');
  return own ? BY_ID[own] : (im.id ? BY_ID[im.id] : null);
}

function roleReason(p, kind, an, im, ctx, link = null) {
  // A government connector names the remit that links it to the founder's buyers.
  if (link && link.id && (kind === 'government' || kind === 'regulator')) {
    const li = BY_ID[link.id];
    return `${leadWord(p)} a public body whose remit covers ${li.customers} ("${link.phrase}")`;
  }
  const ind = targetIndustryFor(p, im, an, ctx);
  const adj = ind ? ind.adj : '';
  // Say "reaches many dental offices" only when the person's own industry IS the founder's customer industry;
  // otherwise describe who they really reach ("a manufacturing association reaches many manufacturers").
  const ownMarket = ind && ctx.customerIndustries && !ctx.customerIndustries.includes(ind.id) ? ind.customers : null;
  const reachNoun = ownMarket || ctx.customersNoun || (ind ? ind.customers : 'customers');
  const lw = leadWord(p);
  const a = (phrase) => `${article(phrase)} ${phrase}`;
  const withAdj = (noun) => (adj ? `${adj} ${noun}` : noun);
  switch (kind) {
    case 'association':
      return `${lw} ${a(withAdj('association'))}: reaches many ${reachNoun}`;
    case 'regulator':
      return `${lw} ${a(withAdj('licensing or regulatory board'))}: in contact with every licensed ${ind ? ind.customer : 'organisation'}`;
    case 'government':
      return `Works in government${adj ? ` (${adj})` : ''}: can open doors to many ${ctx.customersNoun || reachNoun}`;
    case 'extension':
      return `Cooperative extension: works directly with many ${reachNoun}`;
    case 'distributor':
      return `${lw} ${a(withAdj('distributor or supplier'))}: sells into many ${ctx.customersNoun || reachNoun}`;
    case 'gpo':
      return `${lw} a group purchasing organisation: buys on behalf of many ${reachNoun}`;
    case 'multi_site':
      return `${lw} a multi-site group of ${ind ? ind.customers : 'sites'}: one decision can cover many locations`;
    case 'lender':
      return `${lw} ${a(withAdj('lender'))}: finances many ${reachNoun}`;
    case 'chamber':
      return `${lw} a chamber of commerce: reaches many local businesses`;
    case 'economic_development':
      return `${lw} an economic development organisation: connects to many ${ctx.customersNoun || 'local employers and towns'}`;
    case 'cooperative':
      return `${lw} a member-owned cooperative: reaches many ${ctx.customersNoun || 'member households and businesses'}`;
    case 'investor': {
      const inds = p.industries.filter((i) => i !== 'investment').map((i) => BY_ID[i] && BY_ID[i].label).filter(Boolean);
      return `Investor${inds.length ? ` (${inds.join(', ')})` : ''}`;
    }
    case 'vendor':
      return `Sells to ${ind ? ind.customers : 'this market'}: more likely a partner than a buyer`;
    default: {
      if (!ind) return null;
      const role = { owner: 'Owner or decision-maker', c_level: 'Executive', vp: 'Senior leader', director: 'Director', manager: 'Manager' }[p.seniority]
        || (p.job_function === 'clinical' && p.org_type === 'healthcare_provider' ? 'Clinician' : 'Works');
      if (p.org_type === 'education' && !EDUCATION_IDS.has(ind.id)) {
        return role === 'Works' ? `Works at ${article(ind.adj)} ${ind.adj} school or program` : `${role} at ${article(ind.adj)} ${ind.adj} school or program`;
      }
      return role === 'Works' ? `Works at ${article(ind.customer)} ${ind.customer}` : `${role} at ${article(ind.customer)} ${ind.customer}`;
    }
  }
}

function geoInfo(p, intent) {
  if (!intent.geo.states.size) return { factor: 1, reason: null };
  const st = locationState(p.location);
  if (!st) return { factor: 0.85, reason: null };
  if (intent.geo.states.has(st)) {
    const label = intent.geo.labels.find((l) => l.length > 2 && l.toLowerCase() !== stateName(st).toLowerCase());
    return { factor: 1, reason: `Based in ${stateName(st)}${label ? ` (in ${label})` : ''}` };
  }
  return { factor: 0.72, reason: null };
}

// ---------------------------------------------------------------------------
// Public-ish core

/**
 * Rank the pool for one intent. Used by search() and suggestLeads().
 * opts: { query, mode, memberId, limit, strategy, leadType, extraGeo, customersNoun, customerIndustries, minScore }
 */
export function rankPool(db, opts) {
  const mode = opts.mode || 'leads';
  const strategy = opts.strategy || 'full';
  const intent = parseQuery(opts.query, mode);
  if (opts.extraGeo && opts.extraGeo.states && opts.extraGeo.states.size && !intent.geo.states.size) {
    intent.geo = opts.extraGeo;
  }
  // A customer persona for a confirmed buyer type counts only that buyer industry: words in the persona query that name
  // another industry ("agency" in "home health agency director") and neighbouring industries never make a customer.
  const only = strategy === 'full' && opts.onlyIndustries && opts.onlyIndustries.length ? new Set(opts.onlyIndustries) : null;
  if (only) {
    intent.industries = intent.industries.filter((x) => only.has(x.id));
    for (const id of only) if (BY_ID[id] && !intent.industries.some((x) => x.id === id)) intent.industries.push({ id, weight: 1, hits: [] });
    for (const x of intent.industries) x.weight = 1;
  }
  const memberId = opts.memberId ?? null;
  const { ids, bm } = retrieve(db, intent, strategy, mode);
  // Connector personas also retrieve organisations named by the buyers' remit and connector phrases
  // ("Vermont Public Utility Commission" for a "public utilities commission" query).
  if (strategy === 'full' && opts.leadType === 'connector' && opts.customerIndustries && opts.customerIndustries.length) {
    const phrases = [];
    for (const id of [...opts.customerIndustries, ...(opts.sectorIndustries || [])]) {
      const ind = BY_ID[id];
      if (ind) phrases.push(...ind.remit, ...ind.connectorPhrases);
    }
    const expr = ftsOr(phrases.filter((x) => x.includes(' ')));
    if (expr) {
      const seen = new Set(ids);
      for (const r of runFts(db, `{company title} : (${expr})`, 400)) if (!seen.has(r.id)) { ids.push(r.id); seen.add(r.id); }
    }
  }
  if (!ids.length) return [];
  const people = loadPeople(db, ids);
  const knownMap = loadKnownBy(db, ids);
  const dismissed = mode === 'leads' ? loadDismissed(db, memberId) : new Set();
  const ctx = { customersNoun: opts.customersNoun || null, customerIndustries: opts.customerIndustries || null, onlyIndustries: only };
  const minScore = opts.minScore ?? (mode === 'talent' ? 0.3 : 0.12);
  const out = [];

  for (const id of ids) {
    const p = people.get(id);
    if (!p) continue;
    const known = knownMap.get(id) || [];
    if (!known.length) continue; // nobody in the hub can introduce
    if (dismissed.has(id)) continue;
    const text = bm.get(id) || 0;
    const net = networkFactor(known, memberId);
    const mine = memberId != null && known.some((k) => k.member_id === memberId);
    const reasons = [];
    let score;

    if (strategy === 'fts') {
      score = text;
      if (score <= 0) continue;
      reasons.push('Keyword match on profile text');
    } else {
      const an = analyzeOrg(p);
      const kind = strategy === 'full' ? effectiveKind(p, an, intent, ctx) : null;
      // Connector personas: only connector organisations with a positive link to the founder's buyer industry.
      let link = null;
      if (strategy === 'full' && opts.leadType === 'connector' && ctx.customerIndustries && ctx.customerIndustries.length) {
        link = connectorLink(p, an, kind, ctx.customerIndustries, { geoStates: intent.geo.states, sector: opts.sectorIndustries || [] });
        if (!link) continue;
      }
      const im = industryMatch(p, intent, an, Boolean(only));
      let topical;
      // A keyword hit without the industry (e.g. "former dentist" in a software engineer's title) counts for little,
      // and for a confirmed buyer type it counts for nothing.
      if (intent.industries.length) topical = im.score ? 0.75 * im.score + 0.25 * text : (only ? 0 : 0.15 * text);
      else if (intent.orgIntent.length && strategy === 'full') topical = kindMatchesIntent(kind, intent.orgIntent) ? 0.7 + 0.3 * text : 0.4 * text;
      else topical = text;
      // A connector with a named link to the buyers (remit, own industry, connector phrase) is relevant by construction;
      // a link by organisation kind alone (a chamber for small businesses) is weaker.
      if (link && link.id) topical = Math.max(topical, (STRONG_LINKS.has(link.via) ? 0.6 : 0.45) + 0.2 * text);

      let fit;
      let talent = null;
      if (mode === 'talent') {
        talent = talentScore(p, intent);
        const indPart = intent.industries.length ? 0.7 + 0.3 * im.score : 1;
        topical = intent.functions.length || intent.roleTerms.length ? Math.max(talent.score, 0.5 * text) * indPart : text;
        fit = 1;
      } else if (strategy === 'full') {
        fit = roleFitFull(p, kind, an, intent, opts.leadType, mode, ctx);
      } else {
        fit = mode === 'any' ? 1 : roleFitExpand(p);
      }
      const geo = geoInfo(p, intent);
      const base = topical * fit;
      if (base < minScore) continue;
      score = base * geo.factor * net.f;

      // Reasons (honest and specific)
      if (mode === 'talent') {
        const fnLabel = p.job_function && p.job_function !== 'other' ? p.job_function.replace('_', ' ') : null;
        if (talent.termHits.length) reasons.push(`Title matches "${talent.termHits.join('", "')}"`);
        else if (fnLabel && intent.functions.includes(p.job_function)) reasons.push(`Works in ${fnLabel}`);
        if (SENIOR_LEVELS.has(p.seniority)) reasons.push(`Senior role (${p.seniority.replace('_', '-')})`);
      } else if (strategy === 'full') {
        const rr = (im.score > 0 || kindMatchesIntent(kind, intent.orgIntent) || (link && link.id)) ? roleReason(p, kind, an, im, ctx, link) : null;
        if (rr) reasons.push(rr);
        else if (text > 0) reasons.push(`Matches your search terms in title or company`);
      } else {
        if (im.id) reasons.push(`${im.related ? 'Related industry' : 'Industry'}: ${BY_ID[im.id].label}`);
        else if (text > 0) reasons.push('Matches your search terms in title or company');
      }
      if (geo.reason) reasons.push(geo.reason);
      // Honest flag for students, interns, incoming hires, trainees and volunteers.
      if (strategy === 'full' || mode === 'talent') {
        const an2 = analyzeOrg(p);
        if (an2.early) {
          if (mode === 'talent') reasons.push(`Early career (${an2.early})`);
          else reasons.unshift(EARLY_LABELS[an2.early]);
        }
      }
    }

    if (net.others.length >= 2) reasons.push(`Known by ${net.others.length} hub members`);
    if (net.strongest && net.strongest.strength === 'strong') reasons.push(`Strong tie: ${net.strongest.name} knows them well`);
    if (mine) reasons.push('Already in your own network');

    out.push({
      person: {
        id: p.id, full_name: p.full_name, company: p.company, title: p.title, location: p.location,
        linkedin_url: p.linkedin_url, industries: p.industries, org_type: p.org_type,
        job_function: p.job_function, seniority: p.seniority,
      },
      score: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)),
      reasons,
      known_by: known,
      _mine: mine,
    });
  }
  out.sort((a, b) => (a._mine - b._mine) || (b.score - a.score) || (a.person.id - b.person.id));
  return out;
}

function strip(r) { const { _mine, ...rest } = r; return rest; }

// Search results: the k-th person from the same organisation is scored ORG_DECAY^k. One warm intro per firm
// is usually enough, and 25 people from one firm should not push every other firm off the page.
const ORG_DECAY = 0.85;
export function diversifyByOrg(ranked, upTo = Infinity) {
  const pass = (list) => {
    const seen = new Map();
    const pool = list.map((r) => ({ r, base: r.score, key: normalize(r.person.company).trim() }));
    const out = [];
    // Greedy only as far as the caller will look; the tail keeps its order.
    while (pool.length && out.length < upTo) {
      let best = 0; let bestV = -1;
      for (let i = 0; i < pool.length; i++) {
        if (pool[i].base <= bestV) break; // sorted by base score: nothing later can win
        const v = pool[i].base * (pool[i].key ? ORG_DECAY ** (seen.get(pool[i].key) || 0) : 1);
        if (v > bestV) { bestV = v; best = i; }
      }
      const [it] = pool.splice(best, 1);
      if (it.key) seen.set(it.key, (seen.get(it.key) || 0) + 1);
      out.push({ ...it.r, score: Math.round(bestV * 1000) / 1000 });
    }
    return [...out, ...pool.map((x) => x.r)];
  };
  // Own-network people stay below everyone else.
  return [...pass(ranked.filter((r) => !r._mine)), ...pass(ranked.filter((r) => r._mine))];
}

/**
 * Plain-language search over the pooled network.
 * @returns {Promise<Result[]>}
 */
export async function search(db, { query, mode = 'leads', memberId, limit = 25, strategy = 'full', llm = true, orgDiversity = true } = {}) {
  if (!query || !String(query).trim()) return [];
  const m = ['leads', 'talent', 'any'].includes(mode) ? mode : 'leads';
  const lim = Math.max(1, Math.min(200, Number(limit) || 25));
  let ranked = rankPool(db, { query, mode: m, memberId, strategy });
  if (strategy === 'full' && orgDiversity) ranked = diversifyByOrg(ranked, Math.max(lim, 40));
  if (llm && strategy === 'full' && llmAvailable() && ranked.length > 1) {
    ranked = await llmRerank({ context: `Search query: ${query} (mode: ${m})`, results: ranked, topN: 40, stateOf: locationState });
  }
  return ranked.slice(0, lim).map(strip);
}

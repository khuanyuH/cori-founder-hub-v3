// Minimal stand-in for server/matching/index.js, used only when HUB_MATCHING_STUB=1
// (or when the real module is missing). Same exports and shapes as the contract; naive logic.

const RULES = [
  [/dental|dentist|orthodont|hygien/i, 'dental'],
  [/hospital|clinic|health|medical|physician|nurse/i, 'healthcare'],
  [/farm|agri|ag |crop|dairy|grower|extension/i, 'agriculture'],
  [/college|school|university|education|workforce/i, 'education'],
  [/bank|credit union|lend|cdfi/i, 'banking'],
  [/venture|capital|fund|angel|invest/i, 'investing'],
  [/software|tech|saas|digital/i, 'software'],
];

export function enrichPerson({ full_name, company, title, location } = {}) {
  const text = `${company || ''} ${title || ''}`;
  const industries = [...new Set(RULES.filter(([re]) => re.test(text)).map(([, id]) => id))];
  let org_type = 'company';
  if (/association|society|council|federation|alliance|chamber/i.test(company || '')) org_type = 'association';
  else if (/department|state of|county|office of|usda|agency/i.test(company || '')) org_type = 'government';
  else if (/college|university|school/i.test(company || '')) org_type = 'education';
  else if (/hospital|clinic|health center|medical center/i.test(company || '')) org_type = 'healthcare_provider';
  else if (/ventures|capital|fund|partners/i.test(company || '')) org_type = 'investor';
  let job_function = 'other';
  if (/sales|business development/i.test(title || '')) job_function = 'sales';
  else if (/marketing/i.test(title || '')) job_function = 'marketing';
  else if (/cfo|finance|controller|accountant/i.test(title || '')) job_function = 'finance';
  else if (/engineer|developer|\bcto\b/i.test(title || '')) job_function = 'engineering';
  else if (/ceo|president|founder|owner|executive director/i.test(title || '')) job_function = 'executive';
  else if (/operations|manager/i.test(title || '')) job_function = 'operations';
  let seniority = 'unknown';
  if (/owner|founder/i.test(title || '')) seniority = 'owner';
  else if (/\bc[efto]o\b|chief|president/i.test(title || '')) seniority = 'c_level';
  else if (/\bvp\b|vice president/i.test(title || '')) seniority = 'vp';
  else if (/director/i.test(title || '')) seniority = 'director';
  else if (/manager|head/i.test(title || '')) seniority = 'manager';
  else if (title) seniority = 'ic';
  void full_name; void location;
  return { industries, org_type, job_function, seniority };
}

const RANK = { strong: 3, some: 2, weak: 1 };

function knownBy(db, personId) {
  const rows = db.prepare(`SELECT c.member_id, m.name, m.role, c.strength, c.source, c.note
     FROM connections c JOIN members m ON m.id = c.member_id WHERE c.person_id = ?`).all(personId);
  const by = new Map();
  for (const r of rows) {
    let k = by.get(r.member_id);
    if (!k) { k = { member_id: r.member_id, name: r.name, role: r.role, strength: r.strength, sources: [], note: null }; by.set(r.member_id, k); }
    if (RANK[r.strength] > RANK[k.strength]) k.strength = r.strength;
    if (!k.sources.includes(r.source)) k.sources.push(r.source);
    if (r.note) k.note = r.note;
  }
  return [...by.values()].sort((a, b) => RANK[b.strength] - RANK[a.strength]);
}

function personOut(p) {
  return {
    id: p.id, full_name: p.full_name, company: p.company, title: p.title, location: p.location,
    linkedin_url: p.linkedin_url, industries: JSON.parse(p.industries || '[]'), org_type: p.org_type,
    job_function: p.job_function, seniority: p.seniority,
  };
}

const STOP = new Set(['in', 'the', 'of', 'and', 'for', 'a', 'an', 'to', 'at', 'with', 'new', 'leaders', 'people']);

export async function search(db, { query, mode = 'leads', memberId, limit = 25 } = {}) {
  void mode;
  const terms = String(query || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((t) => !STOP.has(t)) || [];
  if (!terms.length) return [];
  const match = terms.map((t) => `"${t}"*`).join(' OR ');
  const dismissed = new Set(db.prepare(`SELECT person_id FROM lead_feedback WHERE member_id = ? AND verdict = 'dismissed'`)
    .all(memberId ?? -1).map((r) => r.person_id));
  const rows = db.prepare(`SELECT p.*, bm25(people_fts) AS rank FROM people_fts JOIN people p ON p.id = people_fts.rowid
     WHERE people_fts MATCH ? ORDER BY rank LIMIT ?`).all(match, limit * 4);
  const out = [];
  for (const p of rows) {
    if (dismissed.has(p.id)) continue;
    const kb = knownBy(db, p.id);
    if (!kb.length) continue;
    const own = kb.some((k) => k.member_id === memberId);
    const others = kb.filter((k) => k.member_id !== memberId);
    const reasons = [`Matches "${terms.join(' ')}"`];
    if (own && !others.length) reasons.push('Already in your own network');
    const score = Math.max(0, Math.min(1, 0.5 + 0.1 * others.length - (own && !others.length ? 0.4 : 0)));
    out.push({ person: personOut(p), score, reasons, known_by: kb });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

export function explainBusiness(business = {}) {
  const tc = business.target_customers || business.industry || 'customers';
  const personas = [
    { id: 'customer', label: `Buyers: ${tc}`, lead_type: 'customer', why: 'Direct customers', queries: [tc] },
    { id: 'connector', label: `Associations for ${business.industry || tc}`, lead_type: 'connector', why: 'Reach many customers', queries: [`${business.industry || tc} association`] },
  ];
  if (business.needs) personas.push({ id: 'talent', label: business.needs, lead_type: 'talent', why: 'Stated need', queries: [business.needs] });
  return personas;
}

export async function suggestLeads(db, { memberId, limit = 30 } = {}) {
  const business = db.prepare('SELECT * FROM businesses WHERE member_id = ?').get(memberId);
  const personas = explainBusiness(business || {});
  const leads = [];
  const seen = new Set();
  for (const persona of personas) {
    for (const q of persona.queries) {
      for (const r of await search(db, { query: q, memberId, limit: Math.ceil(limit / personas.length) })) {
        if (seen.has(r.person.id)) continue;
        seen.add(r.person.id);
        leads.push({ ...r, persona: persona.id, lead_type: persona.lead_type });
      }
    }
  }
  return { personas, leads: leads.slice(0, limit) };
}

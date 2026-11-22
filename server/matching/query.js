// Turns a plain-language query into a structured intent.
import { INDUSTRIES, BY_ID, SERVICE_IDS, GOVERNMENT_IDS, normalize, matchIndustry, WEAK_QUERY_TERMS } from './taxonomy.js';
import { parseGeo } from './geo.js';

export const STOPWORDS = new Set(('a an the of in at for and or to with who that which people person persons contacts contact ' +
  'someone anyone somebody me my our us we i you find show list get give near around based from on by into ' +
  'any all some more most best top good great new local small large big than like such as is are be can could would ' +
  'should will want need looking look know knows work works working job jobs etc via per about across within ' +
  'help helps sell sells selling sold buy buys offer offers provide provides product products service services ' +
  'company companies business businesses customer customers client clients org orgs organization organizations organisation ' +
  'organisations they them their it its this these those other others also only just very really one two three').split(/\s+/));

// Words that express which KIND of organisation the user wants (connectors).
const ORG_INTENT = [
  ['association', /\b(farm bureaus?|associations?|assoc|societ(y|ies)|trade groups?|trade associations?|professional associations?|federations?|alliances?|coalitions?|leagues?|councils?|guilds?)\b/],
  ['chamber', /\bchambers?( of commerce)?\b/],
  ['cooperative', /\b(cooperatives?|co-?ops?)\b/],
  ['extension', /\bextension\b/],
  ['distributor', /\b(distributors?|distribution|wholesalers?|wholesale|suppliers?|supply|dealers?|food hubs?|brokers?)\b/],
  ['regulator', /\b(regulators?|regulatory|licensing|licensure|examiners|board of)\b/],
  ['government', /\b(government|agency|agencies|officials?|state office|public sector|departments? of)\b/],
  ['economic_development', /\b(economic development|planning commissions?|regional planning|development corporations?|sbdc)\b/],
  ['investor', /\b(investors?|vcs?|venture|angels?|funders?|seed funds?|impact funds?|capital)\b/],
  ['gpo', /\b(gpos?|group purchasing|buying groups?|dsos?|service organi[sz]ations?|support organi[sz]ations?)\b/],
  ['lender', /\b(lenders?|lending|farm credit|cdfis?|loan funds?)\b/],
];
const CONNECTOR_WORD = /\b(connectors?|channels?|gatekeepers?|intermediar(y|ies)|networks? of|reach many)\b/;
const SENIOR_WORD = /\b(leaders?|leadership|executives?|execs?|decision[- ]makers?|heads?|directors?|owners?|founders?|ceos?|presidents?|chiefs?|principals?|managing|senior)\b/;

const FUNCTION_WORDS = [
  ['finance', ['cfo', 'finance', 'financial', 'controller', 'comptroller', 'accountant', 'accounting', 'bookkeeper', 'bookkeeping', 'treasurer', 'fp and a']],
  ['marketing', ['cmo', 'marketing', 'marketer', 'brand', 'growth', 'communications', 'pr', 'content', 'social media']],
  ['sales', ['sales', 'seller', 'business development', 'bd', 'account executive', 'partnerships', 'revenue']],
  ['engineering', ['cto', 'engineer', 'engineers', 'engineering', 'developer', 'developers', 'programmer', 'technical', 'devops', 'data scientist', 'software engineer', 'it']],
  ['product', ['product manager', 'product', 'designer', 'ux', 'design']],
  ['legal', ['lawyer', 'attorney', 'counsel', 'legal', 'general counsel']],
  ['hr', ['hr', 'recruiter', 'human resources', 'talent', 'people ops', 'people operations']],
  ['operations', ['coo', 'operations', 'ops', 'logistics', 'supply chain', 'office manager']],
  ['clinical', ['nurse', 'physician', 'clinician', 'medical director']],
  ['executive', ['ceo', 'executive', 'general manager', 'chief executive']],
];
const FUNCTION_VOCAB = new Set(FUNCTION_WORDS.flatMap(([, w]) => w));
// Title synonyms for common role asks, so "CFO" also finds "VP Finance" and "Controller".
const ROLE_SYNONYMS = {
  cfo: ['cfo', 'chief financial officer', 'vp finance', 'vice president finance', 'vice president of finance', 'finance director', 'director of finance', 'controller', 'head of finance'],
  cto: ['cto', 'chief technology officer', 'vp engineering', 'vice president of engineering', 'head of engineering', 'engineering director'],
  coo: ['coo', 'chief operating officer', 'vp operations', 'vice president of operations', 'head of operations', 'director of operations'],
  cmo: ['cmo', 'chief marketing officer', 'vp marketing', 'head of marketing', 'marketing director', 'director of marketing'],
  marketing: ['marketing', 'cmo', 'growth', 'brand'],
  sales: ['sales', 'business development', 'account executive', 'revenue'],
  hr: ['hr', 'human resources', 'people operations', 'talent'],
  engineer: ['engineer', 'developer', 'engineering'],
  developer: ['developer', 'engineer', 'programmer'],
};

function phraseIn(norm, phrase) { return norm.includes(` ${phrase} `); }

/**
 * @returns {{
 *   raw: string, mode: string, industries: {id:string, weight:number, hits:string[]}[],
 *   geo: {states:Set<string>, labels:string[]}, orgIntent: string[], connectorIntent: boolean,
 *   seniorIntent: boolean, functions: string[], roleTerms: string[], terms: string[], fractional: boolean
 * }}
 */
export function parseQuery(query, mode = 'leads') {
  const raw = String(query || '').slice(0, 2000);
  const geo = parseGeo(raw);
  let norm = normalize(raw);
  for (const g of geo.consumed) norm = norm.split(` ${g} `).join(' ');
  const lower = norm;

  // Industries
  let industries = [];
  for (const ind of INDUSTRIES) {
    let hits = matchIndustry(ind, norm);
    if (!hits.length) continue;
    if (mode === 'talent') hits = hits.filter((h) => !FUNCTION_VOCAB.has(h));
    const strong = hits.filter((h) => !WEAK_QUERY_TERMS.has(h));
    if (!strong.length) continue;
    industries.push({ id: ind.id, weight: 1, hits: [...new Set(hits)] });
  }
  // Words that name an org kind are not industries by themselves.
  industries = industries.filter((x) => !(x.id === 'wholesale_distribution') &&
    !(x.id === 'investment' && /\b(investors?|venture|angels?|vcs?)\b/.test(lower) && industries.length > 1));
  const hasCore = industries.some((x) => !SERVICE_IDS.has(x.id) && !GOVERNMENT_IDS.has(x.id));
  for (const x of industries) {
    // "software" in "dental software", or "department of" in "department of agriculture", is secondary.
    if (SERVICE_IDS.has(x.id) && hasCore) x.weight = 0.4;
    if (GOVERNMENT_IDS.has(x.id) && hasCore) x.weight = 0.35;
  }
  // A query term inside a more specific industry phrase ("community college" vs "college") is fine to keep.

  // Org-kind intent
  const orgIntent = [];
  for (const [kind, re] of ORG_INTENT) if (re.test(lower)) orgIntent.push(kind);
  // "economic development" is also an industry; keep both. "capital" alone is too vague unless investor words exist.
  if (orgIntent.includes('investor') && !/\b(investors?|vcs?|venture|angels?|funders?|funds?)\b/.test(lower)) {
    orgIntent.splice(orgIntent.indexOf('investor'), 1);
  }
  const connectorIntent = CONNECTOR_WORD.test(lower) || orgIntent.some((k) => k !== 'investor');

  // Functions (talent) and role terms
  const functions = [];
  const roleTerms = [];
  for (const [fn, words] of FUNCTION_WORDS) {
    for (const w of words) {
      if (phraseIn(norm, w)) { if (!functions.includes(fn)) functions.push(fn); roleTerms.push(...(ROLE_SYNONYMS[w] || [w])); }
    }
  }
  const fractional = /\b(fractional|part[- ]time|interim|freelance|contract)\b/.test(lower);

  // Remaining free terms for BM25
  const consumed = new Set();
  for (const x of industries) for (const h of x.hits) h.split(' ').forEach((w) => consumed.add(w));
  const terms = [];
  const kindTerms = [];
  for (const w of norm.trim().split(' ')) {
    if (!w || w.length < 2 || STOPWORDS.has(w) || consumed.has(w)) continue;
    if (SENIOR_WORD.test(w)) continue;
    if (/^\d+$/.test(w)) continue;
    let intentWord = false;
    for (const [, re] of ORG_INTENT) if (re.test(w)) intentWord = true;
    if (intentWord && w.length > 3 && !kindTerms.includes(w)) kindTerms.push(w);
    if (intentWord || CONNECTOR_WORD.test(w)) continue;
    if (!terms.includes(w)) terms.push(w);
  }

  return {
    raw, mode, industries, geo, orgIntent, connectorIntent,
    seniorIntent: SENIOR_WORD.test(lower), functions, roleTerms: [...new Set(roleTerms)], terms, kindTerms, fractional,
  };
}

/** Expanded FTS terms for an intent's industries (phrases), capped. */
export function industryExpansion(intent, maxPerIndustry = 14) {
  const out = [];
  for (const x of intent.industries) {
    const ind = BY_ID[x.id];
    const own = new Set(x.hits);
    const extra = ind.terms.filter((t) => !own.has(t) && !WEAK_QUERY_TERMS.has(t));
    for (const t of [...own, ...extra].slice(0, maxPerIndustry)) out.push(t);
    out.push(ind.id.replace(/_/g, ' '));
  }
  return [...new Set(out)];
}

export { FUNCTION_WORDS };

// Who buys? Infers customer industries from a founder's own words, conservatively.
//
// Only nouns that NAME a buyer (taxonomy buyerTerms: "dairy farmers", "newsrooms", "insurers") can create a
// customer industry, and each inference carries the phrase that justifies it. Words that describe the
// technology or the founder's own category ("satellite", "AI", "collagen", "robots", "SaaS", "remediation")
// are never buyer terms, so they never create customers.
//
// Evidence, strongest first:
//   target    the founder's own "who buys" text (target_customers): any buyer term or strong industry term
//   statement an explicit buyer statement in the description: "for X", "helps X", "sells to X", "used by X",
//             "built for X", "X use it to ..."; the buyer term must sit inside X
//   compound  "<buyer> software/app/platform/marketplace" ("dental practice software", "farm management app")
//   plural    a plural buyer noun elsewhere in the description ("tells farmers when to irrigate")
//   implied   a very small table of products whose buyer is unambiguous ("concrete admixtures" -> concrete producers)
// The founder's background ("founded by two former nurses") is removed before matching.
//
// Sense checks (a wrong-sense customer is worse than asking the founder):
//   - "builder" names a building contractor only with a home/building modifier or construction context; product builders
//     ("resume builder", "website builder") are excluded in the taxonomy.
//   - "contractor(s)" means building contractors only with construction context; "independent contractors" are
//     independent workers (small-business owners and freelancers).
//   - Terms marked '^' in the taxonomy ("manufacturing") count only as the object of an explicit buyer statement.
//   - Shared heads are distributed: "mental health and social services professionals" names two buyers.

import { INDUSTRIES, BY_ID, SERVICE_IDS, normalize, matchIndustry, WEAK_QUERY_TERMS } from './taxonomy.js';

const WEIGHT = { target: 1, statement: 1, compound: 0.8, plural: 0.6, implied: 0.6 };
// Lead types or channels, never inferred as customer industries from text (a founder can still pick distributors).
const NOT_INFERRED = new Set(['investment', 'wholesale_distribution']);

// Trigger phrases whose object (the words after them) names who buys. Normalized text, single spaces.
const OBJECT_TRIGGERS = [
  'sells to', 'sell to', 'selling to', 'sold to', 'sold through', 'sells through', 'distributed through', 'marketed to', 'offered to',
  'licensed to', 'available to', 'used by', 'trusted by', 'adopted by', 'deployed by', 'chosen by', 'purchased by', 'bought by',
  'loved by', 'relied on by', 'built for', 'designed for', 'made for', 'created for', 'tailored to', 'tailored for', 'aimed at',
  'targeted at', 'targeting', 'focused on', 'specifically for', 'for', 'helps', 'help', 'helping', 'enables', 'enabling', 'empowers',
  'lets', 'allows', 'gives', 'saves', 'serves', 'serving', 'supports', 'equips', 'connects', 'connecting', 'tells', 'alerts',
  'notifies', 'shows', 'guides', 'trains', 'teaches', 'pays', 'protects', 'insures', 'partners with',
];
const TRIGGER_RE = new RegExp(` (${OBJECT_TRIGGERS.sort((a, b) => b.length - a.length).map((t) => t.replace(/ /g, ' ')).join('|')}) `, 'g');
// Words that end a buyer object ("for farmers when ...", "helps nonprofits track ...").
const STOP = new Set(['that', 'which', 'who', 'whom', 'whose', 'when', 'where', 'while', 'so', 'because', 'to', 'by', 'from', 'using',
  'via', 'without', 'if', 'but', 'than', 'as', 'like', 'before', 'after', 'during', 'until', 'unless', 'whether', 'track', 'find',
  'get', 'make', 'manage', 'run', 'cut', 'save', 'spot', 'see', 'know', 'reach', 'fill', 'book', 'build', 'file', 'keep',
  'sold', 'sells', 'selling', 'used', 'built', 'designed', 'made', 'helps', 'helping', 'lets', 'want', 'wants', 'need', 'needs']);
// "<subject> use it to ...": the subject names the buyer.
const SUBJECT_RE = / (use|uses|rely on|relies on|depend on|depends on|pay for|pays for|subscribe to|subscribes to|buy|buys|license|licenses) /g;
const SUBJECT_STOP = new Set(['that', 'which', 'who', 'where', 'when', 'our', 'the', 'we', 'it', 'they', 'and', 'or', 'a', 'an', 'so']);
// "<buyer> software" style compounds.
const PRODUCT_RE = / (software|saas|app|apps|platform|tool|tools|crm|erp|marketplace|portal|dashboard|operating system|scheduling software|management software|management app|management system|point of sale|pos) /g;

// "providing X with ...", "equipping X with ...": X names the buyer.
const WITH_RE = / (providing|provides|provide|equipping|equips|equip|supplying|supplies|supply|arming|arms) ((?:[a-z0-9]+ ){1,12}?)with /g;

// Coordinated modifiers that share one head noun: "mental health and social services professionals".
const SHARED_HEADS = 'professionals|providers|agencies|organizations|organisations|practices|clinics|teams|workers|companies|firms|businesses|' +
  'owners|operators|centers|centres|programs|departments|leaders|managers|producers|contractors|facilities|offices|stores|shops|plants|' +
  'utilities|schools|districts|groups|services';
const SHARED_RE = new RegExp(` ([a-z0-9]+(?: [a-z0-9]+)?) and ([a-z0-9]+(?: [a-z0-9]+)?) (${SHARED_HEADS}) `, 'g');
function distributeSharedHeads(norm) {
  const fn = (w) => STOP.has(w) || LEAD_WORDS.has(w);
  return norm.replace(SHARED_RE, (m, a, b, head) => {
    let aw = a.split(' ');
    let prefix = '';
    // "for dental and medical practices": keep "for" in front, distribute over "dental".
    if (aw.length === 2 && fn(aw[0])) { prefix = `${aw[0]} `; aw = aw.slice(1); }
    // "nursing homes and assisted living facilities": the first part is already a noun phrase.
    if (/s$/.test(aw[aw.length - 1]) || aw.some(fn)) return m;
    if (b.split(' ').some(fn)) return m;
    return ` ${prefix}${aw.join(' ')} ${head} and ${b} ${head} `;
  });
}

const LEAD_WORDS = new Set(['for', 'with', 'of', 'the', 'a', 'an', 'our', 'their', 'its', 'and', 'or', 'in', 'on', 'at', 'all', 'many', 'most',
  ...OBJECT_TRIGGERS.filter((t) => !t.includes(' '))]);

// Building-sense context for "builder(s)" and "contractor(s)".
const CONSTRUCTION_CONTEXT = / (construction|constructions|home construction|homebuilding|home building|building trades|building materials|building permits|new homes|homes|houses|housing|remodel|remodeling|remodels|renovation|renovations|jobsite|jobsites|job site|job sites|home improvement|roofing|roofers|plumbing|hvac|electrical|excavation|concrete|framing|carpentry|drywall|lumber|permits|blueprints|subcontractors|general contractors|general contractor|homebuilders|home builders|architects|commercial buildings|infrastructure projects|real estate development) /;
const BUILDER_MODIFIER = / (home|homes|custom|house|local|residential|commercial|modular|general|spec|luxury|vetted|production|volume|multifamily) $/;

// Products whose buyer is unambiguous. Kept deliberately tiny; each entry carries its own evidence phrase.
const IMPLIED = [
  { re: / concrete (admixtures?|additives?|admixture products?|accelerators?|plasticizers?|superplasticizers?) /, id: 'construction' },
];

function senseOk(h, clauseNorm, docNorm) {
  if (h.id === 'construction' && (h.term === 'builder' || h.term === 'contractor' || h.term === 'subcontractor')) {
    if (CONSTRUCTION_CONTEXT.test(docNorm)) return true;
    if (h.term === 'builder' && BUILDER_MODIFIER.test(clauseNorm.slice(0, h.start))) return true;
    return false;
  }
  return true;
}

// The founder's own background or backers is not a buyer statement.
const BACKGROUND_RE = /\b(?:founded|built|started|created|run|led|backed|funded|owned|staffed|developed|designed) by\b(?:(?!\bfor\b|\bto\b|\bused\b)[^,.;:!?])*/gi;
const BACKGROUND2_RE = /\b(?:our|the|its|two|three|both)\s+(?:co-?)?founders?\b|\bco-?founders?\b|\b(?:former|retired|ex-)[^,.;:!?]*/gi;

function clauses(text) {
  return String(text || '')
    .replace(BACKGROUND_RE, ' ')
    .replace(BACKGROUND2_RE, ' ')
    .split(/[.;!?\n()[\]]+|:\s|\s[-–—]\s/)
    .map((raw) => ({ raw, norm: distributeSharedHeads(normalize(raw)) }))
    .filter((c) => c.norm.trim());
}

/** All buyer-term hits in a normalized clause, longest match wins where hits overlap. */
function buyerHits(norm, { strongTerms = false } = {}) {
  const hits = [];
  for (const ind of INDUSTRIES) {
    if (NOT_INFERRED.has(ind.id)) continue;
    const text = ind._bex ? norm.replace(ind._bex, (m) => ' '.repeat(m.length)) : norm;
    for (const b of ind._buyers) {
      b.re.lastIndex = 0;
      let m;
      while ((m = b.re.exec(text))) {
        const matched = m[0].trim();
        const singularLast = b.term.split(' ').pop();
        const matchedLast = matched.split(' ').pop();
        const plural = b.mass || /s$/.test(singularLast) || matchedLast !== singularLast;
        hits.push({ id: ind.id, term: b.term, start: m.index + 1, end: m.index + m[0].length - 1, words: b.words, plural, matched, statementOnly: b.statementOnly });
        b.re.lastIndex = m.index + m[0].length - 1;
      }
    }
    // In the founder's own "who buys" text, ordinary (strong) industry terms count too.
    if (strongTerms && !SERVICE_IDS.has(ind.id)) {
      for (const h of matchIndustry(ind, text)) {
        if (WEAK_QUERY_TERMS.has(h)) continue;
        const at = text.indexOf(` ${h} `);
        if (at >= 0) hits.push({ id: ind.id, term: h, start: at + 1, end: at + 1 + h.length, words: h.split(' ').length - 0.5, plural: true, matched: h });
      }
    }
  }
  // Grade bands ("grades 4-12", "K-8") name K-12 schools.
  const g = / (grades? (?:k|pre ?k|\d{1,2})(?: (?:to|through|thru|and))? ?(?:\d{1,2})?|k (?:5|6|8|12)) /.exec(norm);
  if (g) hits.push({ id: 'k12_education', term: g[1], start: g.index + 1, end: g.index + 1 + g[1].length, words: 3, plural: true, matched: g[1] });
  hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || b.words - a.words);
  const kept = [];
  for (const h of hits) {
    if (kept.some((k) => h.start < k.end && k.start < h.end)) continue;
    kept.push(h);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** Map normalized words back to the founder's original wording when possible. */
function rawPhrase(raw, normPhrase) {
  const words = normPhrase.trim().split(' ').filter(Boolean);
  if (!words.length) return normPhrase.trim();
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(words.map(esc).join('[^A-Za-z0-9]+'), 'i');
  const m = re.exec(raw);
  if (m) return m[0];
  // Shared heads were distributed ("mental health professionals and social services professionals"): quote the
  // founder's own span from the first to the last word instead.
  if (words.length > 1) {
    const m2 = new RegExp(`\\b${esc(words[0])}\\b[^.;!?]{0,120}?\\b${esc(words[words.length - 1])}\\b`, 'i').exec(raw);
    if (m2) return m2[0];
  }
  return normPhrase.trim();
}

function objectSpan(norm, from) {
  // Words after a trigger, up to a stop word or 10 words.
  const rest = norm.slice(from).trim().split(' ');
  const out = [];
  for (const w of rest) {
    if (!w) continue;
    if (out.length && STOP.has(w)) break;
    out.push(w);
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * Infer customer industries from a business profile's own words.
 * @param {{ description?, target_customers?, name? }} business
 * @returns {{ id, label, evidence, score, kind }[]} best first; evidence is a short quote of the founder's words.
 */
export function inferBuyers(business) {
  const b = business || {};
  const found = new Map(); // id -> { score, evidence, kind, pos }
  let pos = 0;
  const add = (id, kind, evidence) => {
    pos++;
    const w = WEIGHT[kind];
    const cur = found.get(id);
    if (!cur) found.set(id, { id, score: w, evidence, kind, pos });
    else {
      cur.score += w * 0.5;
      if (w > WEIGHT[cur.kind]) { cur.kind = kind; cur.evidence = evidence; }
    }
  };

  const docNorm = normalize(`${b.description || ''} ${b.target_customers || ''}`);

  // 1. The founder's own "who buys" text.
  for (const c of clauses(b.target_customers)) {
    // "Towns that want municipal fiber": what follows a relative pronoun describes the buyer's need, not the buyer.
    const norm = c.norm.split(/ (?:that|which|who|where|whose) /)[0] + ' ';
    // Quote the whole list item ("small farms"), not just the matched noun ("farms").
    const items = c.raw.split(/,|;|\band\b|&/i).map((x) => x.split(/\b(?:that|which|who|where|whose)\b/i)[0].trim()).filter(Boolean);
    for (const h of buyerHits(norm, { strongTerms: true })) {
      if (!senseOk(h, norm, docNorm)) continue;
      const item = items.find((x) => normalize(x).includes(` ${h.matched} `));
      add(h.id, 'target', item && item.length <= 60 ? item : rawPhrase(c.raw, h.matched));
    }
  }

  // 2. The description: explicit buyer statements, product compounds, plural buyer nouns.
  for (const c of clauses(b.description)) {
    const norm = c.norm;
    for (const imp of IMPLIED) {
      const im = imp.re.exec(norm);
      if (im) add(imp.id, 'implied', rawPhrase(c.raw, im[0]));
    }
    const hits = buyerHits(norm).filter((h) => senseOk(h, norm, docNorm));
    if (!hits.length) continue;
    const used = new Set();
    // "providing mental health professionals with ...": the words between the verb and "with" name the buyer.
    WITH_RE.lastIndex = 0;
    let w;
    while ((w = WITH_RE.exec(norm))) {
      const objStart = w.index + w[1].length + 1;
      const objEnd = objStart + 1 + w[2].length;
      for (const h of hits) {
        if (!used.has(h) && h.start >= objStart && h.end <= objEnd) {
          add(h.id, 'statement', rawPhrase(c.raw, `${w[1]} ${norm.slice(objStart, h.end).trim()}`));
          used.add(h);
        }
      }
      WITH_RE.lastIndex = w.index + w[0].length - 1;
    }
    // Object triggers: "for dairy farmers", "sold through veterinarians".
    TRIGGER_RE.lastIndex = 0;
    let m;
    while ((m = TRIGGER_RE.exec(norm))) {
      const trigger = m[1];
      const objStart = m.index + m[0].length - 1;
      const words = objectSpan(norm, objStart);
      const objEnd = objStart + 1 + words.join(' ').length;
      for (const h of hits) {
        if (!used.has(h) && h.start >= objStart && h.end <= objEnd + 1) {
          const phrase = `${trigger} ${norm.slice(objStart, h.end).trim()}`;
          add(h.id, 'statement', rawPhrase(c.raw, phrase));
          used.add(h);
        }
      }
      TRIGGER_RE.lastIndex = m.index + m[0].length - 1;
    }
    // Subjects: "educators use it to", "dairy farmers use".
    SUBJECT_RE.lastIndex = 0;
    while ((m = SUBJECT_RE.exec(norm))) {
      const before = norm.slice(0, m.index).trim().split(' ');
      const subj = [];
      for (let i = before.length - 1; i >= 0 && subj.length < 5; i--) {
        if (SUBJECT_STOP.has(before[i])) break;
        subj.unshift(before[i]);
      }
      if (!subj.length) continue;
      const subjText = subj.join(' ');
      const subjStart = norm.lastIndexOf(` ${subjText} `, m.index) + 1;
      for (const h of hits) {
        if (!used.has(h) && h.start >= subjStart && h.end <= m.index + 1) {
          add(h.id, 'statement', rawPhrase(c.raw, `${norm.slice(h.start, h.end)} ${m[1]}`));
          used.add(h);
        }
      }
      SUBJECT_RE.lastIndex = m.index + m[0].length - 1;
    }
    // Compounds: "lawn-care scheduling SaaS", "dental practice software".
    PRODUCT_RE.lastIndex = 0;
    while ((m = PRODUCT_RE.exec(norm))) {
      const before = norm.slice(0, m.index + 1);
      const words = before.trim().split(' ');
      const window = words.slice(-3).join(' ');
      const wStart = before.lastIndexOf(window);
      for (const h of hits) {
        if (!used.has(h) && !h.statementOnly && h.start >= wStart && h.end <= m.index + 1) {
          add(h.id, 'compound', rawPhrase(c.raw, `${norm.slice(h.start, m.index + m[0].length - 1)}`));
          used.add(h);
        }
      }
      PRODUCT_RE.lastIndex = m.index + m[0].length - 1;
    }
    // Plural buyer nouns anywhere else in the clause.
    for (const h of hits) {
      if (used.has(h) || !h.plural || h.statementOnly) continue;
      const prev = norm.slice(0, h.start).trim().split(' ').pop();
      add(h.id, 'plural', rawPhrase(c.raw, `${prev && !STOP.has(prev) ? `${prev} ` : ''}${h.matched}`));
    }
  }

  const list = [...found.values()].sort((a, b2) => b2.score - a.score || a.pos - b2.pos);
  return list.map((x) => ({ id: x.id, label: BY_ID[x.id].label, evidence: x.evidence, score: Math.round(x.score * 100) / 100, kind: x.kind }));
}

/** Suggestions confident enough to drive personas without confirmation (best first, at most 3). */
export function confidentBuyers(suggestions) {
  if (!suggestions.length) return [];
  const top = suggestions[0].score;
  return suggestions.filter((s) => s.score >= Math.max(0.6, top * 0.4)).slice(0, 3);
}

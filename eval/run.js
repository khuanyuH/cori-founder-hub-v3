// node eval/run.js [--seed N] [--verbose]
// Compares ranking strategies on the synthetic labelled benchmark in eval/data.js.
import { PROFILES, buildPool } from './data.js';
import { createTestDb, addMember, addPerson, connect, setBusiness, rng } from '../test/matching/helpers.js';
import { search, suggestLeads } from '../server/matching/index.js';
import { analyzeOrg } from '../server/matching/enrich.js';
import { _setNetworkWeights, NET_WEIGHTS } from '../server/matching/search.js';

process.env.HUB_LLM = 'off'; // the benchmark measures the heuristics only

const args = process.argv.slice(2);
const seedArg = args.indexOf('--seed');
const SEEDS = seedArg >= 0 ? [Number(args[seedArg + 1])] : [7, 11, 23];
const VERBOSE = args.includes('--verbose');

const STRATEGIES = [
  { id: 'A', label: 'A  plain FTS keyword on profile text', run: (db, ctx) => search(db, { query: ctx.text, memberId: ctx.founder, strategy: 'fts', limit: 60 }) },
  { id: 'B', label: 'B  taxonomy expansion + structured boosts', run: (db, ctx) => search(db, { query: ctx.text, memberId: ctx.founder, strategy: 'expand', limit: 60 }) },
  { id: 'B+P', label: 'B+P  B scoring run over personas', run: async (db, ctx) => (await suggestLeads(db, { memberId: ctx.founder, strategy: 'expand', limit: 60 })).leads },
  { id: 'C-nodiv', label: 'C-nodiv  connector-aware personas, no diversification', run: async (db, ctx) => (await suggestLeads(db, { memberId: ctx.founder, strategy: 'full', diversify: false, limit: 60 })).leads },
  { id: 'C', label: 'C  connector-aware personas + diversification (default)', run: async (db, ctx) => (await suggestLeads(db, { memberId: ctx.founder, limit: 60 })).leads },
];

function buildDb(profile, seed, { realworld = false } = {}) {
  const { people } = buildPool(profile, { seed, realworld });
  const db = createTestDb();
  const rand = rng(seed * 7 + 3);
  const founder = addMember(db, { name: 'Founder', role: 'founder' });
  const others = [
    addMember(db, { name: 'Board Member A', role: 'board' }),
    addMember(db, { name: 'Board Member B', role: 'board' }),
    addMember(db, { name: 'CORI Staff', role: 'staff' }),
    addMember(db, { name: 'Mentor', role: 'mentor' }),
  ];
  setBusiness(db, founder, profile.business);
  const labels = new Map();
  let motivatingId = null;
  const strengths = ['weak', 'weak', 'weak', 'some', 'some', 'strong'];
  for (const p of people) {
    const id = addPerson(db, p);
    labels.set(id, p);
    if (p.motivating) motivatingId = id;
    const n = rand() < 0.7 ? 1 : rand() < 0.75 ? 2 : 3;
    const knowers = [...others].sort(() => rand() - 0.5).slice(0, n);
    if (rand() < 0.1) knowers.push(founder);
    for (const m of knowers) connect(db, m, id, { strength: strengths[Math.floor(rand() * strengths.length)] });
    if (p.motivating) connect(db, others[0], id, { source: 'google_contacts', strength: 'some' }); // the board member
  }
  const b = profile.business;
  const text = [b.description, b.industry, b.target_customers, b.geography].filter(Boolean).join('. ');
  return { db, labels, founder, text, motivatingId };
}

function metrics(results, labels) {
  const ids = results.map((r) => r.person.id);
  const rel = (id) => Boolean(labels.get(id) && labels.get(id).label);
  const totalRel = [...labels.values()].filter((p) => p.label).length;
  const top10 = ids.slice(0, 10);
  const top30 = ids.slice(0, 30);
  const p10 = top10.filter(rel).length / 10;
  const r30 = top30.filter(rel).length / totalRel;
  const conn5 = ids.slice(0, 5).some((id) => labels.get(id) && labels.get(id).label === 'connector');
  const distractorsTop10 = top10.filter((id) => labels.get(id) && labels.get(id).group === 'distractor').length;
  return { p10, r30, conn5, distractorsTop10 };
}

const pct = (x) => `${(x * 100).toFixed(0)}%`.padStart(5);
const totals = Object.fromEntries(STRATEGIES.map((s) => [s.id, { p10: 0, r30: 0, conn5: 0, d10: 0, n: 0 }]));
const perProfile = {};
const motivating = [];

for (const seed of SEEDS) {
  for (const profile of PROFILES) {
    const ctx = buildDb(profile, seed);
    for (const s of STRATEGIES) {
      const res = await s.run(ctx.db, ctx);
      const m = metrics(res, ctx.labels);
      const key = `${profile.key}|${s.id}`;
      perProfile[key] = perProfile[key] || { p10: 0, r30: 0, conn5: 0, d10: 0, n: 0 };
      for (const agg of [perProfile[key], totals[s.id]]) {
        agg.p10 += m.p10; agg.r30 += m.r30; agg.conn5 += m.conn5 ? 1 : 0; agg.d10 += m.distractorsTop10; agg.n += 1;
      }
      if (profile.key === 'dental' && ctx.motivatingId) {
        const rank = res.findIndex((r) => r.person.id === ctx.motivatingId);
        motivating.push({ seed, strategy: s.id, rank: rank < 0 ? null : rank + 1, reason: rank >= 0 ? res[rank].reasons[0] : null });
      }
      if (VERBOSE && s.id === 'C' && seed === SEEDS[0]) {
        console.log(`\n--- ${profile.key} / C top 15 ---`);
        res.slice(0, 15).forEach((r, i) => {
          const l = ctx.labels.get(r.person.id);
          console.log(`${String(i + 1).padStart(2)} ${(l.label || '-').padEnd(9)} ${r.score.toFixed(3)} ${r.person.title} @ ${r.person.company} [${r.lead_type}] ${analyzeOrg(r.person).kind} | ${r.reasons[0] || ''}`);
        });
        const missed = [...ctx.labels.entries()].filter(([id, p]) => p.label && !res.slice(0, 30).some((r) => r.person.id === id));
        console.log(`missed in top30 (${missed.length}): ${missed.slice(0, 12).map(([, p]) => `${p.title} @ ${p.company}`).join(' ; ')}`);
      }
    }
  }
}

console.log(`\nSynthetic benchmark: ${PROFILES.length} profiles x ${SEEDS.length} seeds (seeds ${SEEDS.join(', ')}), ~400 people per pool, ~30 true leads each.`);
console.log('P@10 = precision in top 10; R@30 = share of all true leads found in top 30; Conn@5 = runs with a connector in the top 5; Dist@10 = hard distractors in top 10 (mean).\n');
const header = `${'profile'.padEnd(11)}${STRATEGIES.map((s) => s.id.padEnd(22)).join('')}`;
console.log(header);
console.log(`${''.padEnd(11)}${STRATEGIES.map(() => 'P@10  R@30  Conn@5  '.padEnd(22)).join('')}`);
for (const profile of PROFILES) {
  let line = profile.key.padEnd(11);
  for (const s of STRATEGIES) {
    const a = perProfile[`${profile.key}|${s.id}`];
    line += `${pct(a.p10 / a.n)} ${pct(a.r30 / a.n)} ${`${a.conn5}/${a.n}`.padStart(5)}   `.padEnd(22);
  }
  console.log(line);
}
let line = 'MEAN'.padEnd(11);
for (const s of STRATEGIES) {
  const a = totals[s.id];
  line += `${pct(a.p10 / a.n)} ${pct(a.r30 / a.n)} ${pct(a.conn5 / a.n)}   `.padEnd(22);
}
console.log(line);
line = 'Dist@10'.padEnd(11);
for (const s of STRATEGIES) line += `${(totals[s.id].d10 / totals[s.id].n).toFixed(2)}`.padEnd(22);
console.log(line);
console.log('');
for (const s of STRATEGIES) console.log(s.label);
console.log('\nMotivating case (dental): rank of the New Hampshire Dental Society director');
for (const s of STRATEGIES) {
  const ranks = motivating.filter((m) => m.strategy === s.id).map((m) => m.rank ?? 'not found');
  console.log(`  ${s.id.padEnd(8)} ranks per seed: ${ranks.join(', ')}`);
}
const c = motivating.find((m) => m.strategy === 'C');
if (c) console.log(`  C reason: "${c.reason}"`);

// ---------------------------------------------------------------------------
// Real-world-style hard cases (eval/data.js REALWORLD), appended to the same pools. Default strategy C.
const rw = { leads: 0, found30: 0, dist10: 0, dist30: 0, early30: 0, falseConn30: 0, runs: 0, examples: new Map() };
for (const seed of SEEDS) {
  for (const profile of PROFILES) {
    const ctx = buildDb(profile, seed, { realworld: true });
    const res = (await suggestLeads(ctx.db, { memberId: ctx.founder, limit: 60 })).leads;
    const top30 = res.slice(0, 30);
    const rwLeads = [...ctx.labels.entries()].filter(([, p]) => p.rw && p.label).map(([id]) => id);
    rw.leads += rwLeads.length;
    rw.found30 += rwLeads.filter((id) => top30.some((r) => r.person.id === id)).length;
    const isRwDist = (r) => { const l = ctx.labels.get(r.person.id); return l && l.rw && !l.label; };
    rw.dist10 += res.slice(0, 10).filter(isRwDist).length;
    rw.dist30 += top30.filter(isRwDist).length;
    rw.early30 += top30.filter((r) => ['customer', 'connector', 'partner'].includes(r.lead_type) && analyzeOrg(r.person).early).length;
    rw.falseConn30 += top30.filter((r) => isRwDist(r) && r.lead_type === 'connector').length;
    for (const r of top30.filter(isRwDist)) rw.examples.set(`${r.person.title} @ ${r.person.company} [${r.lead_type}]`, (rw.examples.get(`${r.person.title} @ ${r.person.company} [${r.lead_type}]`) || 0) + 1);
    rw.runs++;
  }
}
console.log(`\nReal-world hard cases (C, ${rw.runs} runs): RW leads found in top 30: ${rw.found30}/${rw.leads} (${pct(rw.found30 / rw.leads).trim()})`);
console.log(`  RW distractors in top 10: ${(rw.dist10 / rw.runs).toFixed(2)} per run; in top 30: ${(rw.dist30 / rw.runs).toFixed(2)} per run; as "connector" in top 30: ${rw.falseConn30}`);
console.log(`  Early-career people shown as customer/connector/partner in top 30: ${(rw.early30 / rw.runs).toFixed(2)} per run`);
if (rw.examples.size) console.log(`  RW distractors that still reach the top 30: ${[...rw.examples.entries()].map(([k, n]) => `${k} x${n}`).join('; ')}`);

// ---------------------------------------------------------------------------
// Score blend: connection strength / introducer count as a nudge (new) vs the previous weights.
const ALT_NET = { base: 0.88, strength: 0.08, multi: 0.04 }; // tested flatter alternative (not shipped)
console.log(`\nScore blend (network factor f = base + strength*s + multi*introducers; weak s=.45, strong s=1)`);
for (const [label, w] of [['shipped    ', NET_WEIGHTS], ['flatter alt', ALT_NET]]) {
  _setNetworkWeights(w);
  const agg = { p10: 0, r30: 0, conn5: 0, n: 0 }; const ranks = [];
  for (const seed of SEEDS) {
    for (const profile of PROFILES) {
      const ctx = buildDb(profile, seed);
      const res = (await suggestLeads(ctx.db, { memberId: ctx.founder, limit: 60 })).leads;
      const m = metrics(res, ctx.labels);
      agg.p10 += m.p10; agg.r30 += m.r30; agg.conn5 += m.conn5 ? 1 : 0; agg.n++;
      if (profile.key === 'dental') { const i = res.findIndex((r) => r.person.id === ctx.motivatingId); ranks.push(i < 0 ? 'nf' : i + 1); }
    }
  }
  const weakF = w.base + w.strength * 0.45; const strongF = Math.min(1, w.base + w.strength + w.multi);
  console.log(`  ${label} (${w.base}/${w.strength}/${w.multi}): weak-vs-best-tie spread ${(100 * (strongF - weakF) / strongF).toFixed(0)}%  ` +
    `C P@10 ${pct(agg.p10 / agg.n).trim()}  R@30 ${pct(agg.r30 / agg.n).trim()}  Conn@5 ${pct(agg.conn5 / agg.n).trim()}  NHDS ranks ${ranks.join(', ')}`);
}

// Investor scenario (failure 5): clearly relevant venture investors with weak LinkedIn ties vs strong ties
// to people who are only loosely relevant (bankers, wealth advisers, traders, a buyout associate).
async function investorScenario() {
  const db = createTestDb();
  const founder = addMember(db, { name: 'Founder', role: 'founder' });
  const board = addMember(db, { name: 'Board', role: 'board' });
  const staff = addMember(db, { name: 'Staff', role: 'staff' });
  const strongLoose = [['Vice President', 'Goldman Sachs'], ['Analyst', 'Capital One'], ['Financial Advisor', 'Riverbend Wealth Management'],
    ['Portfolio Manager', 'Wellington Management'], ['Trader', 'Jane Street'], ['Private Equity Associate', 'Blackstone'],
    ['Managing Director', 'Morgan Stanley'], ['Investment Banking Analyst', 'J.P. Morgan'], ['Wealth Advisor', 'Granite Private Wealth'],
    ['Associate', 'Wellington Management'], ['Analyst', 'Bridgewater Associates'], ['Vice President', 'Citadel']];
  const weakVenture = [['Investor', '8VC'], ['Associate', 'White Star Capital'], ['Principal', 'Pine Hollow Ventures'],
    ['Partner', 'Heartland Rural Ventures'], ['Angel Investor', 'North Country Angels'], ['Venture Partner', 'Maple Ridge Seed Fund'],
    ['Investor', 'Dorm Room Fund'], ['Associate', 'Flagship Pioneering']];
  const venture = new Set();
  let i = 0;
  for (const [title, company] of strongLoose) { const id = addPerson(db, { full_name: `Strong Tie ${++i}`, title, company }); connect(db, board, id, { strength: 'strong', source: 'manual' }); }
  for (const [title, company] of weakVenture) { const id = addPerson(db, { full_name: `Weak Tie ${++i}`, title, company }); connect(db, staff, id, { strength: 'weak' }); venture.add(id); }
  // Tie-break: two identical profiles, one strong tie and one weak tie.
  const twinStrong = addPerson(db, { full_name: 'Twin Strong', title: 'Partner', company: 'Cedar Creek Ventures' }); connect(db, board, twinStrong, { strength: 'strong', source: 'manual' });
  const twinWeak = addPerson(db, { full_name: 'Twin Weak', title: 'Partner', company: 'Cedar Creek Ventures' }); connect(db, staff, twinWeak, { strength: 'weak' });
  venture.add(twinStrong); venture.add(twinWeak);
  const res = await search(db, { query: 'venture investors in rural startups', memberId: founder, limit: 40 });
  const top10 = res.slice(0, 10).filter((r) => venture.has(r.person.id)).length;
  const twinOk = res.findIndex((r) => r.person.id === twinStrong) < res.findIndex((r) => r.person.id === twinWeak);
  return { top10, total: venture.size, twinOk };
}
for (const [label, w] of [['shipped    ', NET_WEIGHTS], ['flatter alt', ALT_NET]]) {
  _setNetworkWeights(w);
  const r = await investorScenario();
  console.log(`  investor query, ${label} blend: venture investors in top 10: ${r.top10}/10 (of ${r.total}); equal profiles, strong tie ranks first: ${r.twinOk}`);
}
_setNetworkWeights(null);

// ---------------------------------------------------------------------------
// Buyer inference from free text only (eval/buyers.js): who does the engine think buys, from a description
// with no stated target customers? Works against any engine version: it reads customer/connector persona ids
// (customer-<id>, connector-<id>-...) and, when available, analyzeBusiness() for needs_input and evidence.
{
  const matching = await import('../server/matching/index.js');
  const { BUYER_CASES } = await import('./buyers.js');
  const agg = { cases: BUYER_CASES.length, expectCases: 0, primaryOk: 0, recallHit: 0, recallTotal: 0, wrong: 0, forbidden: 0,
    junkFallback: 0, askCases: 0, askOk: 0, falseAsk: 0, evidence: 0, suggestions: 0, details: [] };
  for (const c of BUYER_CASES) {
    const business = { name: 'Case', description: c.text };
    const personas = matching.explainBusiness(business);
    const a = typeof matching.analyzeBusiness === 'function' ? matching.analyzeBusiness(business) : null;
    const custIds = [];
    for (const p of personas) {
      if (p.lead_type !== 'customer' && p.lead_type !== 'connector') continue;
      const m = /^(?:customer|connector)-([a-z0-9_]+?)(?:-(?:associations|channels|government|ecosystem))?$/.exec(p.id);
      if (m && m[1] !== 'general' && !custIds.includes(m[1])) custIds.push(m[1]);
    }
    const junk = personas.some((p) => p.id === 'customer-general');
    const needsInput = a ? a.needs_input : (!custIds.length);
    if (junk) agg.junkFallback++;
    const allowed = new Set([...c.expect, ...(c.ok || [])]);
    const wrong = custIds.filter((id) => !allowed.has(id));
    const forb = custIds.filter((id) => (c.forbid || []).includes(id));
    agg.wrong += wrong.length; agg.forbidden += forb.length;
    if (c.expect.length) {
      agg.expectCases++;
      if (custIds[0] && c.expect.includes(custIds[0])) agg.primaryOk++;
      agg.recallTotal += c.expect.length;
      agg.recallHit += c.expect.filter((id) => custIds.includes(id)).length;
      if (needsInput) agg.falseAsk++;
    } else {
      agg.askCases++;
      if (needsInput && !junk && !custIds.length) agg.askOk++;
    }
    if (a) for (const s of a.suggested_customers || []) { agg.suggestions++; if (s.evidence) agg.evidence++; }
    if (wrong.length || junk || (c.expect.length && !c.expect.every((id) => custIds.includes(id))) || (!c.expect.length && !needsInput)) {
      agg.details.push(`${c.key}: got [${custIds.join(', ')}]${junk ? ' +Likely buyers' : ''}${needsInput ? ' needs_input' : ''}; want [${c.expect.join(', ')}]`);
    }
  }
  console.log(`\nBuyer inference from free text (${agg.cases} invented descriptions, eval/buyers.js)`);
  console.log(`  Primary customer correct: ${agg.primaryOk}/${agg.expectCases}; expected buyer types found: ${agg.recallHit}/${agg.recallTotal}`);
  console.log(`  Wrong customer/connector industries: ${agg.wrong} (of which forbidden incidental-word hits: ${agg.forbidden}); "Likely buyers" fallbacks: ${agg.junkFallback}`);
  console.log(`  No clear buyer -> asks the founder (needs_input, no personas): ${agg.askOk}/${agg.askCases}; asked although a buyer was stated: ${agg.falseAsk}`);
  if (agg.suggestions) console.log(`  Suggestions carrying an evidence phrase: ${agg.evidence}/${agg.suggestions}`);
  if (VERBOSE || agg.details.length <= 12) for (const d of agg.details) console.log(`    - ${d}`);
  else console.log(`    (${agg.details.length} cases with a miss; --verbose lists them)`);
}

console.log('\nCaveat: this benchmark was written by the same author as the heuristics, so it flatters them. Treat it as a regression check, not proof of real-world quality.');

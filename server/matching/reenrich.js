// npm run reenrich [-- --member 9] [--no-llm]
//
// Recomputes industries / org_type / job_function / seniority for every person with the current
// classifier and rebuilds people_fts, in one transaction. Idempotent and safe while the server is up
// (SQLite WAL: the server keeps reading its snapshot until the commit). The running server must be
// restarted to load new classifier code for search-time logic.
//
// When ANTHROPIC_API_KEY is set (and --no-llm is not given), companies the heuristics cannot classify are
// first sent, by name only and in batches, to the optional LLM layer; answers are cached in
// company_classifications and applied only where the heuristics found nothing.
import { openDb, reenrichAll, matching } from '../db.js';

const args = process.argv.slice(2);
const members = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--member') members.push(Number(args[++i]));
const useLlm = !args.includes('--no-llm');

function counts(db, memberId = null) {
  const where = memberId == null ? '' : 'WHERE id IN (SELECT person_id FROM connections WHERE member_id = ?)';
  const rows = db.prepare(`SELECT company, title, industries, org_type, job_function, seniority FROM people ${where}`)
    .all(...(memberId == null ? [] : [memberId]));
  const c = { people: rows.length, no_industry: 0, function_other: 0, association: 0, healthcare_provider: 0, investor: 0, early_career: 0 };
  for (const r of rows) {
    if (!r.industries || r.industries === '[]') c.no_industry++;
    if (r.job_function === 'other') c.function_other++;
    if (r.org_type === 'association') c.association++;
    if (r.org_type === 'healthcare_provider') c.healthcare_provider++;
    if (r.org_type === 'investor') c.investor++;
    if (typeof matching.classifyPerson === 'function' && matching.classifyPerson({ company: r.company, title: r.title }).stage) c.early_career++;
  }
  return c;
}

function show(label, before, after) {
  console.log(`\n${label}`);
  for (const k of Object.keys(before)) {
    console.log(`  ${k.padEnd(20)} ${String(before[k]).padStart(6)} -> ${String(after[k]).padStart(6)}`);
  }
}

const db = openDb();
const before = { all: counts(db), ...Object.fromEntries(members.map((m) => [m, counts(db, m)])) };

if (useLlm && typeof matching.llmAvailable === 'function' && matching.llmAvailable()) {
  const unknown = db.prepare(`SELECT DISTINCT company FROM people WHERE company IS NOT NULL AND company <> '' AND industries = '[]'`)
    .all().map((r) => r.company);
  const stats = await matching.classifyCompaniesWithLlm(db, unknown);
  console.log(`LLM company classification: asked ${stats.asked}, cached ${stats.stored}, batches ${stats.batches}, failed ${stats.failed}`);
} else {
  console.log('LLM company classification: skipped (no ANTHROPIC_API_KEY, HUB_LLM=off, or --no-llm)');
}

const t0 = Date.now();
const res = reenrichAll(db);
console.log(`Re-enriched ${res.total} people in ${Date.now() - t0} ms; ${res.changed} rows changed; people_fts rebuilt.`);
show('All people (before -> after)', before.all, counts(db));
for (const m of members) show(`Member ${m}'s contacts (before -> after)`, before[m], counts(db, m));
db.close();

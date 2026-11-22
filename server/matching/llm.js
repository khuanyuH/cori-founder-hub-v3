// Optional LLM layer (Anthropic Messages API over plain fetch).
// Active only when ANTHROPIC_API_KEY is set. Every failure falls back silently to heuristics.
// Only name-free fields are sent: business profile text, and for people their title, company,
// org_type, industries and state. Never names, emails, phone numbers, notes or LinkedIn URLs.

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';
const LEAD_TYPES = new Set(['customer', 'connector', 'partner', 'investor', 'talent']);
const cache = new Map();

export function llmAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.HUB_LLM !== 'off';
}

export function llmModel() {
  return process.env.HUB_LLM_MODEL || 'claude-haiku-5-5';
}

function remember(key, value) {
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

export function _clearLlmCache() { cache.clear(); }

export async function callClaude({ system, user, maxTokens = 2000, timeoutMs = 15000 }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({
      model: llmModel(),
      max_tokens: maxTokens,
      system,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  if (!data || data.stop_reason === 'refusal') throw new Error('LLM refusal');
  const text = (Array.isArray(data.content) ? data.content : [])
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  if (!text) throw new Error('LLM empty');
  return text;
}

export function extractJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON');
  return JSON.parse(s.slice(start, end + 1));
}

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Ask the model for personas. Returns Persona[] or null on any failure.
 */
export async function llmPersonas(business) {
  if (!llmAvailable()) return null;
  const profile = {
    name: clip(business.name, 120),
    description: clip(business.description, 1200),
    industry: clip(business.industry, 200),
    target_customers: clip(business.target_customers, 400),
    geography: clip(business.geography, 200),
    needs: clip(business.needs, 300),
  };
  const key = `personas:${llmModel()}:${JSON.stringify(profile)}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const system = 'You help rural startup founders find warm introductions. Given a business profile, list the kinds of people ' +
      'in a professional network who are worth meeting: direct customers (decision-makers at buying organisations), and ' +
      'especially CONNECTORS who reach many customers at once (trade associations, professional societies, distributors, ' +
      'buying groups, regulators and licensing boards, public programs, cooperatives), plus partners, investors (only if ' +
      'fundraising is mentioned) and talent (only if needs names a role). Queries must be short plain-language searches over ' +
      'job titles and organisation names (2-6 words), optionally ending with "in <region>". Reply with JSON only: ' +
      '{"personas":[{"label":string,"lead_type":"customer"|"connector"|"partner"|"investor"|"talent","why":string,"queries":[string]}]}';
    const text = await callClaude({ system, user: JSON.stringify(profile), maxTokens: 1500 });
    const parsed = extractJson(text);
    const list = Array.isArray(parsed.personas) ? parsed.personas : [];
    const out = [];
    for (const p of list.slice(0, 8)) {
      if (!p || !LEAD_TYPES.has(p.lead_type)) continue;
      const queries = (Array.isArray(p.queries) ? p.queries : []).map((q) => clip(q, 120)).filter(Boolean).slice(0, 5);
      if (!queries.length || !p.label) continue;
      out.push({ id: `llm-${out.length + 1}-${p.lead_type}`, label: clip(p.label, 100), lead_type: p.lead_type, why: clip(p.why, 400), queries });
    }
    return remember(key, out.length ? out : null);
  } catch {
    return remember(key, null);
  }
}

/**
 * Rerank the top results with the model. Input/outputs are rankPool-style results
 * ({ person, score, reasons, known_by, _mine }). Returns a new array; on failure, the input unchanged.
 * Own-network results stay below the others, as the contract requires.
 */
export async function llmRerank({ context, results, topN = 40, stateOf = null }) {
  if (!llmAvailable() || !results || results.length < 2) return results;
  const head = results.slice(0, topN);
  const tail = results.slice(topN);
  const items = head.map((r, i) => ({
    i,
    title: clip(r.person.title, 120),
    company: clip(r.person.company, 120),
    org_type: r.person.org_type || null,
    industries: r.person.industries || [],
    state: stateOf ? stateOf(r.person.location) : undefined,
  }));
  const key = `rerank:${llmModel()}:${clip(context, 1500)}:${JSON.stringify(items)}`;
  let ranking = cache.get(key);
  if (ranking === undefined) {
    try {
      const system = 'You rank professional contacts as leads for a founder. A good lead is a decision-maker at a likely buying ' +
        'organisation, or a connector who reaches many such buyers (association, society, distributor, regulator, buying group). ' +
        'Vendors who sell to the same customers are partners, not buyers. Score each item 0-10 and give one short, specific reason ' +
        '(max 15 words, no names). Reply with JSON only: {"ranking":[{"i":number,"score":number,"reason":string}]}';
      const text = await callClaude({ system, user: JSON.stringify({ context: clip(context, 1500), items }), maxTokens: 3000 });
      const parsed = extractJson(text);
      ranking = Array.isArray(parsed.ranking) ? parsed.ranking : null;
    } catch {
      ranking = null;
    }
    remember(key, ranking);
  }
  if (!ranking) return results;
  const byI = new Map();
  for (const r of ranking) {
    const i = Number(r && r.i);
    const s = Number(r && r.score);
    if (Number.isInteger(i) && i >= 0 && i < head.length && Number.isFinite(s)) {
      byI.set(i, { s: Math.max(0, Math.min(10, s)) / 10, reason: clip(r.reason, 160) });
    }
  }
  if (!byI.size) return results;
  const merged = head.map((r, i) => {
    const l = byI.get(i);
    if (!l) return { ...r, score: Math.round(r.score * 0.75 * 1000) / 1000 };
    const reasons = l.reason ? [l.reason, ...r.reasons.filter((x) => x !== l.reason)] : r.reasons;
    return { ...r, score: Math.round((0.5 * r.score + 0.5 * l.s) * 1000) / 1000, reasons, _llm: true };
  });
  merged.sort((a, b) => ((a._mine ? 1 : 0) - (b._mine ? 1 : 0)) || (b.score - a.score));
  return [...merged.map(({ _llm, ...r }) => r), ...tail];
}

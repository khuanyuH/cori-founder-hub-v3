// suggestLeads: run the member's personas over the pool, merge, de-duplicate, diversify.
import { analyzeBusiness, confirmedIndustries, wantedLeadTypes } from './personas.js';
import { BY_ID, SERVICE_IDS, GOVERNMENT_IDS, WEAK_QUERY_TERMS, industriesIn } from './taxonomy.js';
import { rankPool } from './search.js';
import { parseGeo, locationState } from './geo.js';
import { llmAvailable, llmPersonas, llmRerank } from './llm.js';

/** The founder's own sector, from the profile's industry field ("Fiber broadband provider" -> broadband_telecom): the main
 *  non-service industry it names, or none. Used only to link connectors (the sector's regulator and channels). */
export function sectorIndustries(business) {
  const found = industriesIn(business && business.industry ? String(business.industry) : '')
    .map((x) => ({ id: x.id, n: x.hits.filter((h) => !WEAK_QUERY_TERMS.has(h)).length }))
    .filter((x) => x.n && !SERVICE_IDS.has(x.id) && !GOVERNMENT_IDS.has(x.id) && x.id !== 'investment' && x.id !== 'wholesale_distribution')
    .sort((a, b) => b.n - a.n);
  return found.length ? [found[0].id] : [];
}

const PERSONA_WEIGHT = { customer: 1, connector: 1, partner: 0.55, investor: 0.6, talent: 0.6 };
const PER_QUERY = 60;

function mergePersonas(llmList, heuristic) {
  // Keep the model's personas, but guarantee at least one connector persona from the heuristics.
  const out = [...llmList];
  if (!out.some((p) => p.lead_type === 'connector')) out.push(...heuristic.filter((p) => p.lead_type === 'connector'));
  if (!out.some((p) => p.lead_type === 'talent')) out.push(...heuristic.filter((p) => p.lead_type === 'talent'));
  return out;
}

const PRIMARY_TYPES = new Set(['customer', 'connector']);
const TYPE_DECAY = 0.85;   // each pick of a lead type (customer / connector) lowers the next one of that type
const PERSONA_DECAY = 0.93; // and, more gently, of that persona

/**
 * Greedy diversified selection. Customers and connectors alternate by merit (lead-type decay),
 * and no single persona dominates (persona decay).
 */
export function diversify(items, limit) {
  const pool = [...items].sort((a, b) => b.s - a.s);
  const typeCount = new Map();
  const personaCount = new Map();
  const picked = [];
  while (picked.length < limit && pool.length) {
    let bestIdx = 0; let bestVal = -1;
    for (let i = 0; i < pool.length; i++) {
      const it = pool[i];
      if (it.s < bestVal) break; // sorted by s: nothing further can win
      const v = it.s * TYPE_DECAY ** (typeCount.get(it.persona.lead_type) || 0) * PERSONA_DECAY ** (personaCount.get(it.persona.id) || 0);
      if (v > bestVal) { bestVal = v; bestIdx = i; }
    }
    const [it] = pool.splice(bestIdx, 1);
    typeCount.set(it.persona.lead_type, (typeCount.get(it.persona.lead_type) || 0) + 1);
    personaCount.set(it.persona.id, (personaCount.get(it.persona.id) || 0) + 1);
    picked.push(it);
  }
  return picked;
}

/**
 * Customers and connectors lead the list. Partner / investor / talent suggestions are interleaved
 * after the first AUX_START slots, one every AUX_EVERY slots, so they are visible but never crowd out leads.
 */
const AUX_START = 10;
const AUX_EVERY = 3;
export function interleaveAux(primary, aux) {
  const out = [];
  let i = 0; let j = 0;
  while (i < primary.length || j < aux.length) {
    const pos = out.length;
    const auxSlot = pos >= AUX_START && (pos - AUX_START) % AUX_EVERY === 0;
    if ((auxSlot && j < aux.length) || i >= primary.length) out.push(aux[j++]);
    else out.push(primary[i++]);
  }
  return out;
}

/**
 * @returns {Promise<{ personas: Persona[], leads: (Result & { persona: string, persona_id: string, lead_type: string })[],
 *   needs_input: boolean, message?: string }>}
 *   persona = the persona's human-readable label; persona_id = its id. Returns empty lists if the member has no business row.
 *   needs_input: the profile names no buyer the hub can act on; leads is then empty and message says what to do.
 */
export async function suggestLeads(db, { memberId, limit = 30, strategy = 'full', diversify: doDiversify = true, llm = true } = {}) {
  const business = db.prepare('SELECT * FROM businesses WHERE member_id = ?').get(memberId);
  if (!business) return { personas: [], leads: [] };
  const lim = Math.max(1, Math.min(200, Number(limit) || 30));
  const analysis = analyzeBusiness(business);
  if (analysis.needs_input) {
    return { personas: analysis.personas, leads: [], needs_input: true, message: analysis.message };
  }
  const heuristic = analysis.personas;
  let personas = heuristic;
  const useLlm = llm && strategy === 'full' && llmAvailable();
  if (useLlm) {
    let lp = await llmPersonas(business);
    // Confirmed buyer types are the only source of customer, connector and partner personas.
    if (lp && confirmedIndustries(business).length) lp = lp.filter((p) => !['customer', 'connector', 'partner'].includes(p.lead_type));
    const wanted = wantedLeadTypes(business);
    if (lp && wanted) lp = lp.filter((p) => p.lead_type === 'talent' || wanted.includes(p.lead_type));
    if (lp && lp.length) personas = mergePersonas(lp, heuristic);
  }
  const industries = analysis.customer_industries.length ? analysis.customer_industries.slice(0, 5) : null;
  const noun = industries ? BY_ID[industries[0]].customers : null;
  const extraGeo = parseGeo(business.geography || '');
  const sector = sectorIndustries(business);

  const best = new Map();
  for (const persona of personas) {
    const w = PERSONA_WEIGHT[persona.lead_type] ?? 0.6;
    for (const q of persona.queries) {
      const ranked = rankPool(db, {
        query: q,
        mode: persona.lead_type === 'talent' ? 'talent' : 'leads',
        memberId,
        strategy,
        leadType: strategy === 'full' ? persona.lead_type : null,
        extraGeo,
        customersNoun: persona.lead_type === 'connector' ? noun : null,
        customerIndustries: industries,
        sectorIndustries: sector,
        // A customer persona for one buyer type ranks people in that buyer industry only.
        onlyIndustries: persona.lead_type === 'customer' && /^customer-/.test(persona.id) && BY_ID[persona.id.slice(9)] ? [persona.id.slice(9)] : null,
      }).slice(0, PER_QUERY);
      for (const r of ranked) {
        const s = r.score * w;
        const prev = best.get(r.person.id);
        if (!prev || prev.s < s) best.set(r.person.id, { result: r, persona, s });
      }
    }
  }
  let items = [...best.values()];
  if (useLlm && items.length > 1) {
    items.sort((a, b) => b.s - a.s);
    const head = items.slice(0, 40);
    const context = `Founder business: ${business.name || ''}. ${business.description || ''} Sells to: ${business.target_customers || ''}. Region: ${business.geography || ''}.`;
    const reranked = await llmRerank({
      context,
      results: head.map((it) => ({ ...it.result, _item: it })),
      topN: 40,
      stateOf: locationState,
    });
    const top = reranked.map((r) => ({ ...r._item, result: { ...r, _item: undefined }, s: r.score * (PERSONA_WEIGHT[r._item.persona.lead_type] ?? 0.6) }));
    items = [...top, ...items.slice(40)];
  }
  const order = (list) => (doDiversify ? diversify(list, list.length) : [...list].sort((a, b) => b.s - a.s));
  const primary = order(items.filter((x) => PRIMARY_TYPES.has(x.persona.lead_type)));
  const aux = order(items.filter((x) => !PRIMARY_TYPES.has(x.persona.lead_type)));
  const notMine = (list) => list.filter((x) => !x.result._mine);
  const mine = (list) => list.filter((x) => x.result._mine);
  // People the member already knows go below everyone else.
  const finalList = [...interleaveAux(notMine(primary), notMine(aux)), ...interleaveAux(mine(primary), mine(aux))].slice(0, lim);
  const leads = finalList.map(({ result, persona, s }) => {
    const { _mine, _item, ...rest } = result;
    return { ...rest, score: Math.round(Math.min(1, s) * 1000) / 1000, persona: persona.label, persona_id: persona.id, lead_type: persona.lead_type };
  });
  return { personas, leads, needs_input: false };
}

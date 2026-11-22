// analyzeBusiness(business) -> { personas, suggested_customers, needs_input, message?, customer_industries, source }
// explainBusiness(business) -> Persona[]   (contract interface; the personas of analyzeBusiness)
//
// Who buys (Addendum 2, guided business profile):
//   1. customer_industries (taxonomy ids the founder CONFIRMED) drive customer, connector and partner personas
//      exclusively. The description can still add talent and investor personas; it never adds a customer.
//   2. Without confirmed buyers, buyers are inferred only from explicit buyer statements in the founder's own
//      words (buyers.js), each with the phrase that justifies it.
//   3. No confident inference: no customer/connector/partner personas, needs_input = true, and a plain message.
//      There is no keyword "Likely buyers" fallback.
// lead_types (when given) limits which kinds of personas are produced. Pure and synchronous (no db, no network).

import { BY_ID, PICKABLE_IDS } from './taxonomy.js';
import { parseGeo } from './geo.js';
import { inferBuyers, confidentBuyers } from './buyers.js';

export const LEAD_TYPE_VALUES = ['customer', 'connector', 'partner', 'investor', 'talent'];
export const NEEDS_INPUT_MESSAGE = 'The hub does not know who buys from you yet. Pick at least one buyer type on your business profile and it will suggest customers and the connectors who reach them.';

function parseList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try { const x = JSON.parse(v); return Array.isArray(x) ? x : null; } catch { return null; }
  }
  return null;
}

/** Confirmed buyer types: known, pickable taxonomy ids, de-duplicated, in the founder's order. */
export function confirmedIndustries(business) {
  const list = parseList(business && business.customer_industries) || [];
  return [...new Set(list.filter((id) => typeof id === 'string' && PICKABLE_IDS.has(id)))];
}

/** Wanted lead types, or null when the profile does not say (then every kind is allowed). */
export function wantedLeadTypes(business) {
  const list = parseList(business && business.lead_types);
  if (!list) return null;
  return list.filter((t) => LEAD_TYPE_VALUES.includes(t));
}

const ROLE_HINT = /\b(cfo|cto|coo|cmo|ceo|controller|bookkeeper|accountant|marketing|marketer|sales|seller|business development|engineer|engineers|developer|developers|designer|product manager|operations|ops|hr|recruiter|counsel|lawyer|attorney|advisor|mentor|data scientist|head of|lead|vp|director|manager|hire|hiring)\b/i;

function talentQueries(needs) {
  if (!needs) return [];
  return String(needs)
    .split(/[,;\n]|\band\b|\bplus\b/i)
    .map((s) => s.replace(/\b(we need|need|needs|looking for|hiring|hire|a|an|to|help with|help)\b/gi, ' ').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 1 && ROLE_HINT.test(s))
    .slice(0, 4);
}

const FUNDING = /\b(rais(e|ing)|fundrais\w*|funding|investors?|seed|series [ab]|pre-?seed|capital|angels?)\b/i;

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function buyerPersonas(b, ids, evidence, ctx) {
  const { where, withGeo, productName } = ctx;
  const personas = [];
  const inds = ids.map((id) => BY_ID[id]).filter(Boolean);
  if (!inds.length) return personas;
  const primary = inds[0];

  for (const ind of inds.slice(0, 5)) {
    if (!ind.buyers || !ind.buyers.length) continue;
    const ev = evidence.get(ind.id);
    const basis = ev ? `You wrote "${ev}". ` : '';
    personas.push({
      id: `customer-${ind.id}`,
      label: `${cap(ind.customers)}: ${ind.deciders}`,
      lead_type: 'customer',
      why: `${basis}You sell to ${ind.customers}${where}. ${cap(ind.deciders)} there decide whether to buy ${productName}.`,
      queries: ind.buyers.slice(0, 4).map(withGeo),
    });
  }

  // Associations for up to three buyer types; distributor and public-program connectors for the main one.
  inds.slice(0, 3).forEach((ind, i) => {
    const c = ind.connectors || {};
    if (c.association && c.association.length) {
      personas.push({
        id: `connector-${ind.id}-associations`,
        label: `${cap(ind.adj)} associations and societies`,
        lead_type: 'connector',
        why: `One leader at a state or regional ${ind.adj} association knows hundreds of ${ind.customers} and can put ${productName} in front of all of them (newsletters, conferences, member discounts).`,
        queries: c.association.map(withGeo),
      });
    }
    if (i > 0) return;
    if (c.channel && c.channel.length) {
      personas.push({
        id: `connector-${ind.id}-channels`,
        label: `Distributors, suppliers and groups that reach ${ind.customers}`,
        lead_type: 'connector',
        why: `Distributors, buying groups and support organisations already sell to or advise many ${ind.customers}; a partnership with one of them is a sales channel.`,
        queries: c.channel.map(withGeo),
      });
    }
    if (c.government && c.government.length) {
      personas.push({
        id: `connector-${ind.id}-government`,
        label: `Regulators and public programs for ${ind.customers}`,
        lead_type: 'connector',
        why: `Licensing boards, state offices and public programs are in contact with every ${ind.customer}${where}; they can point you to early adopters and grant-funded pilots.`,
        queries: c.government.map(withGeo),
      });
    }
  });

  if (primary.partners && primary.partners.length) {
    personas.push({
      id: `partner-${primary.id}`,
      label: `Complementary vendors serving ${primary.customers}`,
      lead_type: 'partner',
      why: `Consultants and vendors who already specialise in ${primary.customers} can refer customers or bundle ${productName}. Generalist firms are left out.`,
      queries: primary.partners.slice(0, 3).map(withGeo),
    });
  }
  return personas;
}

/**
 * Full analysis of a business profile.
 * @param {{name?, description?, industry?, target_customers?, geography?, needs?, customer_industries?, lead_types?}} business
 * @returns {{ personas: Persona[], suggested_customers: {id,label,evidence}[], needs_input: boolean, message?: string,
 *            customer_industries: string[], source: 'confirmed'|'inferred'|'none' }}
 */
export function analyzeBusiness(business) {
  const b = business || {};
  const geo = parseGeo([b.geography, b.target_customers].filter(Boolean).join(' '));
  const geoLabel = geo.labels.length ? geo.labels.join(', ') : '';
  const ctx = {
    where: geoLabel ? ` in ${geoLabel}` : '',
    withGeo: (q) => (geoLabel ? `${q} in ${geoLabel}` : q),
    productName: b.name ? b.name : 'your product',
  };

  const suggestions = inferBuyers(b);
  const confirmed = confirmedIndustries(b);
  const leadTypes = wantedLeadTypes(b);
  let ids; let source; const evidence = new Map();
  if (confirmed.length) {
    ids = confirmed; source = 'confirmed';
  } else {
    const conf = confidentBuyers(suggestions);
    ids = conf.map((s) => s.id);
    for (const s of conf) evidence.set(s.id, s.evidence);
    source = ids.length ? 'inferred' : 'none';
  }

  const wantsBuyerLeads = !leadTypes || leadTypes.some((t) => t === 'customer' || t === 'connector' || t === 'partner');
  const needsInput = !ids.length && wantsBuyerLeads;
  let personas = ids.length ? buyerPersonas(b, ids, evidence, ctx) : [];

  const fundingText = [b.needs, b.description].filter(Boolean).join(' ');
  if (leadTypes ? leadTypes.includes('investor') : FUNDING.test(fundingText)) {
    const ind = ids.length ? BY_ID[ids[0]] : null;
    personas.push({
      id: 'investor', label: 'Investors who back companies like yours', lead_type: 'investor',
      why: `${FUNDING.test(fundingText) ? 'Your profile mentions fundraising. ' : 'You asked for investor leads. '}Investors focused on ${ind ? ind.label.toLowerCase() : 'your sector'} or on rural companies are the warmest first calls.`,
      queries: [ind ? `${ind.adj} investor` : 'venture investor', 'rural venture fund', 'angel investor'],
    });
  }

  const tq = talentQueries(b.needs);
  if (tq.length) {
    personas.push({
      id: 'talent', label: `Talent: ${tq.join(', ')}`, lead_type: 'talent',
      why: `You said you need ${tq.join(', ')}. People in the pool with that background, ideally recommended by a hub member.`,
      queries: tq,
    });
  }
  if (leadTypes) personas = personas.filter((p) => p.lead_type === 'talent' || leadTypes.includes(p.lead_type));

  const out = {
    personas,
    suggested_customers: suggestions.slice(0, 6).map((s) => ({ id: s.id, label: s.label, evidence: s.evidence })),
    needs_input: needsInput,
    customer_industries: ids,
    source,
  };
  if (needsInput) out.message = NEEDS_INPUT_MESSAGE;
  return out;
}

/**
 * @param {{name?, description?, industry?, target_customers?, geography?, needs?, customer_industries?, lead_types?}} business
 * @returns {Persona[]} Persona = { id, label, lead_type, why, queries }
 */
export function explainBusiness(business) {
  return analyzeBusiness(business).personas;
}

/** The customer noun and industries used to word connector reasons and score leads. */
export function customersNounFor(business) {
  const ids = analyzeBusiness(business || {}).customer_industries;
  return ids.length ? { noun: BY_ID[ids[0]].customers, industries: ids.slice(0, 5) } : { noun: null, industries: null };
}

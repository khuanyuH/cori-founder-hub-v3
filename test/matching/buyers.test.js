// Guided business profile (CONTRACT Addendum 2): who buys. Invented descriptions modelled on the failure
// patterns of a test with 49 real startup descriptions (no real company names).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeBusiness, explainBusiness, inferBuyers, buyerTypes, INDUSTRIES, classifyPerson, analyzeOrg, suggestLeads,
} from '../../server/matching/index.js';
import { parseQuery } from '../../server/matching/query.js';
import { BUYER_CASES } from '../../eval/buyers.js';
import { createTestDb, addMember, addPerson, connect } from './helpers.js';

const ids = (list) => list.map((s) => s.id);
const customerIds = (personas) => personas.filter((p) => p.lead_type === 'customer').map((p) => p.id.replace(/^customer-/, ''));
const connectorIds = (personas) => [...new Set(personas.filter((p) => p.lead_type === 'connector')
  .map((p) => p.id.replace(/^connector-/, '').replace(/-(associations|channels|government)$/, '')))];

// (i) inference from explicit buyer statements, with the evidence phrase ---------------------------------

test('explicit buyer statements are inferred, each with the founder\'s own words as evidence', () => {
  const cases = [
    ['Scheduling software for lawn care companies.', 'landscaping', /for lawn care companies/i],
    ['Collagen gel for hoof wounds in dairy cows, sold through veterinarians.', 'livestock', /dairy cows/i],
    ['Collagen gel for hoof wounds in dairy cows, sold through veterinarians.', 'veterinary', /veterinarians/i],
    ['A reading comprehension product for grades 4-12. Educators use it to assign leveled articles.', 'k12_education', /grades 4-12|educators use/i],
    ['Herd-health collars that dairy farmers use to spot illness early.', 'livestock', /dairy farmers use/i],
    ['Helps nonprofits track legislation and mobilize supporters.', 'nonprofit', /helps nonprofits/i],
    ['Outage forecasts for insurers, data centers, and utilities.', 'data_centers', /data centers/i],
    ['Code-compliance checking sold to architecture and engineering firms.', 'architecture_engineering', /sold to architecture and engineering firms/i],
    ['Business-education platform for women founders.', 'small_business', /for women founders/i],
    ['Satellite soil-moisture analytics that tells farmers when to irrigate.', 'agriculture', /farmers/i],
  ];
  for (const [text, id, evidence] of cases) {
    const a = analyzeBusiness({ name: 'Case', description: text });
    const s = a.suggested_customers.find((x) => x.id === id);
    assert.ok(s, `${text} -> ${JSON.stringify(a.suggested_customers)}`);
    assert.match(s.evidence, evidence, text);
    assert.ok(s.label && s.label.length > 3);
    assert.equal(a.needs_input, false, text);
    assert.ok(customerIds(a.personas).includes(id), `${text}: customer persona for ${id}`);
  }
});

test('the inferred persona says why, quoting the evidence', () => {
  const ps = explainBusiness({ name: 'Mowline', description: 'Scheduling software for lawn care companies.' });
  const c = ps.find((p) => p.id === 'customer-landscaping');
  assert.ok(c);
  assert.match(c.why, /You wrote "for lawn care companies"/);
  assert.ok(ps.some((p) => p.id === 'connector-landscaping-associations'));
});

test('the target-customers text counts as an explicit buyer statement', () => {
  const s = inferBuyers({ target_customers: 'independent dental offices, small group dental practices' });
  assert.equal(s[0].id, 'dental');
  assert.match(s[0].evidence, /dental offices/i);
});

// (ii) incidental words never create customers ------------------------------------------------------------

test('technology and founder-category words do not create customer industries', () => {
  const cases = [
    ['Satellite soil-moisture analytics that tells farmers when to irrigate each field.', ['aerospace_defense', 'software_it']],
    ['Collagen gel for hoof wounds in dairy cows, sold through veterinarians.', ['life_sciences', 'pharmacy']],
    ['Fungi-based PFAS remediation. We also sell mushroom grow kits online.', ['aerospace_defense', 'life_sciences', 'agriculture', 'environmental']],
    ['A suction toothbrush for hospital and long-term-care patients.', ['life_sciences', 'dental']],
    ['Home-construction marketplace that connects homeowners with vetted local builders.', ['retail', 'arts_culture', 'real_estate']],
    ['AI-powered SaaS that helps dentists fill last-minute cancellations.', ['software_it']],
    ['Drone inspections for solar farms and wind operators.', ['aerospace_defense', 'agriculture']],
    ['Founded by two former hospital nurses, we build budgeting software for food trucks.', ['healthcare_providers']],
  ];
  for (const [text, forbidden] of cases) {
    const a = analyzeBusiness({ name: 'Case', description: text });
    const got = [...ids(a.suggested_customers), ...customerIds(a.personas), ...connectorIds(a.personas)];
    for (const id of forbidden) assert.ok(!got.includes(id), `${text}: unexpected ${id} in ${JSON.stringify(got)}`);
  }
});

test('every eval/buyers.js case: expected buyers found, nothing outside expect + ok', () => {
  for (const c of BUYER_CASES) {
    const a = analyzeBusiness({ name: 'Case', description: c.text });
    const got = customerIds(a.personas);
    for (const id of c.expect) assert.ok(got.includes(id), `${c.key}: missing ${id} (got ${got})`);
    const allowed = new Set([...c.expect, ...(c.ok || [])]);
    for (const id of [...got, ...connectorIds(a.personas)]) assert.ok(allowed.has(id), `${c.key}: unexpected ${id}`);
    assert.equal(a.needs_input, c.expect.length === 0, `${c.key}: needs_input`);
  }
});

// (iii) needs_input -------------------------------------------------------------------------------------

test('no confident buyer: needs_input, a plain message, no customer/connector/partner personas', () => {
  for (const text of [
    '3D body scanning studio that turns a scan into a custom figurine.',
    'An AI platform that turns 3D models into physical objects with robots.',
    'A carbon-accounting tool with automatic emissions factors.',
  ]) {
    const a = analyzeBusiness({ name: 'Case', description: text, needs: 'fractional CFO' });
    assert.equal(a.needs_input, true, text);
    assert.match(a.message, /who buys/i);
    assert.deepEqual(a.suggested_customers, []);
    assert.ok(!a.personas.some((p) => ['customer', 'connector', 'partner'].includes(p.lead_type)), text);
    assert.ok(!a.personas.some((p) => p.label === 'Likely buyers'));
    assert.ok(a.personas.some((p) => p.lead_type === 'talent'), 'talent still comes from needs');
  }
});

test('suggestLeads returns needs_input and no leads when the profile names no buyer', async () => {
  const db = createTestDb();
  const founder = addMember(db, { name: 'Founder' });
  const board = addMember(db, { name: 'Board', role: 'board' });
  const p = addPerson(db, { full_name: 'Invented Person', title: 'Owner', company: 'Granite Figurine Studio' });
  connect(db, board, p);
  db.prepare(`INSERT INTO businesses (member_id, name, description) VALUES (?, 'Scanly', ?)`)
    .run(founder, '3D body scanning studio that turns a scan into a custom figurine.');
  const out = await suggestLeads(db, { memberId: founder });
  assert.equal(out.needs_input, true);
  assert.deepEqual(out.leads, []);
  assert.ok(out.message);
});

// (iv) confirmed industries override the text ------------------------------------------------------------

test('confirmed customer_industries drive customer and connector personas exclusively', () => {
  const b = {
    name: 'Hoofcare', description: 'Collagen gel for hoof wounds in dairy cows, sold through veterinarians. Satellite-tracked shipping.',
    target_customers: 'hospitals', customer_industries: ['veterinary'], needs: 'raising a seed round',
  };
  const a = analyzeBusiness(b);
  assert.equal(a.source, 'confirmed');
  assert.equal(a.needs_input, false);
  assert.deepEqual(customerIds(a.personas), ['veterinary']);
  assert.deepEqual(connectorIds(a.personas), ['veterinary']);
  assert.ok(a.personas.some((p) => p.lead_type === 'investor'), 'description may still add investors');
  // Suggestions from the text are still returned for the picker.
  assert.ok(ids(a.suggested_customers).includes('livestock'));
  // A JSON string (as stored in the db) works the same way; unknown ids are ignored.
  const a2 = analyzeBusiness({ ...b, customer_industries: JSON.stringify(['veterinary', 'no_such_id']) });
  assert.deepEqual(customerIds(a2.personas), ['veterinary']);
});

test('confirmed buyers replace inference even when the text names other buyers', () => {
  const a = analyzeBusiness({ name: 'X', description: 'Scheduling software for lawn care companies.', customer_industries: ['k12_education', 'libraries'] });
  assert.deepEqual(customerIds(a.personas), ['k12_education', 'libraries']);
  assert.ok(!connectorIds(a.personas).includes('landscaping'));
});

test('lead_types limits the personas produced', () => {
  const base = { name: 'X', description: 'Scheduling software for lawn care companies.', customer_industries: ['landscaping'], needs: 'head of sales' };
  const onlyConnectors = analyzeBusiness({ ...base, lead_types: ['connector'] });
  assert.ok(onlyConnectors.personas.every((p) => ['connector', 'talent'].includes(p.lead_type)));
  assert.ok(onlyConnectors.personas.some((p) => p.lead_type === 'connector'));
  const investors = analyzeBusiness({ ...base, lead_types: ['customer', 'investor'] });
  assert.ok(investors.personas.some((p) => p.lead_type === 'investor'), 'investor persona when asked for, even without fundraising text');
  assert.ok(!investors.personas.some((p) => p.lead_type === 'connector'));
  const investorOnlyNoBuyer = analyzeBusiness({ name: 'Y', description: 'A carbon-accounting tool.', lead_types: ['investor'] });
  assert.equal(investorOnlyNoBuyer.needs_input, false, 'investors need no buyer type');
});

// Title and organisation errors seen in the test --------------------------------------------------------

test('a sales representative is an individual contributor, not a director', () => {
  for (const company of ['Ridgeway Medical Devices', 'Stryker']) {
    const r = classifyPerson({ title: 'Trauma Sales Representative', company });
    assert.equal(r.seniority, 'ic', company);
    assert.equal(r.job_function, 'sales');
  }
  assert.equal(classifyPerson({ title: 'State Representative', company: 'Vermont House of Representatives' }).seniority, 'director');
});

test('architects and engineers are not building contractors', () => {
  for (const company of ['Sage and Coombe Architects', 'Hollis Architects', 'Northfield Architecture and Design', 'Granite Structural Engineering']) {
    const r = classifyPerson({ title: 'Junior Designer', company });
    assert.ok(r.industries.includes('architecture_engineering'), `${company}: ${r.industries}`);
    assert.ok(!r.industries.includes('construction'), `${company}: ${r.industries}`);
  }
  assert.ok(classifyPerson({ title: 'Solutions Architect', company: 'Northwind Cloud' }).industries.every((i) => i !== 'architecture_engineering'));
});

test('galleries and auction houses are not retailers and never connectors', () => {
  for (const [title, company] of [['Gallery Director', 'C24 Gallery'], ['Specialist', 'Christies'], ['Director', 'Granite Fine Art Auctioneers'], ['Art Dealer', 'Maple Ridge Gallery']]) {
    const r = classifyPerson({ title, company });
    assert.ok(!r.industries.includes('retail'), `${company}: ${r.industries}`);
    const kind = analyzeOrg({ title, company, org_type: r.org_type }).kind;
    assert.ok(!['distributor', 'association', 'gpo', 'cooperative'].includes(kind), `${company}: ${kind}`);
  }
});

test('a generic consultancy is a partner only when it specialises in the customer industry', async () => {
  const db = createTestDb();
  const founder = addMember(db, { name: 'Founder' });
  const board = addMember(db, { name: 'Board', role: 'board' });
  const generic = addPerson(db, { full_name: 'Generic Consultant', title: 'Founder', company: 'Summit Strategy Consulting' });
  const generic2 = addPerson(db, { full_name: 'Another Consultant', title: 'Managing Partner', company: 'Harbor Management Consultants' });
  const specialist = addPerson(db, { full_name: 'Health Consultant', title: 'Principal', company: 'Rural Hospital Consulting Group' });
  const customer = addPerson(db, { full_name: 'Hospital Buyer', title: 'Chief Nursing Officer', company: 'Cedar Creek Hospital' });
  for (const id of [generic, generic2, specialist, customer]) connect(db, board, id);
  db.prepare(`INSERT INTO businesses (member_id, name, description, customer_industries) VALUES (?, 'Brushwell', ?, '["healthcare_providers"]')`)
    .run(founder, 'A suction toothbrush for hospital patients.');
  const { leads } = await suggestLeads(db, { memberId: founder, limit: 50 });
  const asPartner = leads.filter((l) => l.lead_type === 'partner').map((l) => l.person.id);
  assert.ok(!asPartner.includes(generic) && !asPartner.includes(generic2), 'generalist consultancies are not partners');
  assert.ok(leads.some((l) => l.person.id === customer));
  assert.ok(!leads.some((l) => l.person.id === generic || l.person.id === generic2), 'generalist consultancies are not suggested at all');
  void specialist;
});

// Taxonomy for the picker --------------------------------------------------------------------------------

test('every pickable buyer type has a plain label, a group, 2-3 examples, buyer queries and connectors', () => {
  const types = buyerTypes();
  assert.ok(types.length >= 40);
  for (const t of types) {
    assert.ok(t.label && t.group, t.id);
    assert.ok(t.examples.length >= 2 && t.examples.length <= 3, `${t.id} examples`);
  }
  for (const id of ['k12_education', 'landscaping', 'home_services', 'livestock', 'veterinary', 'long_term_care', 'insurance', 'data_centers',
    'media_publishing', 'architecture_engineering', 'construction', 'environmental', 'small_business', 'nonprofit']) {
    assert.ok(types.some((t) => t.id === id), `missing buyer type ${id}`);
  }
  assert.ok(!types.some((t) => t.id === 'investment'), 'investors are a lead type, not a buyer type');
  for (const ind of INDUSTRIES.filter((i) => i.pickable)) {
    assert.ok(ind.buyers.length, `${ind.id} buyers`);
    assert.ok(Object.values(ind.connectors || {}).flat().length, `${ind.id} connectors`);
    assert.ok(ind.buyerTerms.length, `${ind.id} buyerTerms`);
  }
});

test('persona buyer queries name their industry (so a query never matches every association)', () => {
  for (const ind of INDUSTRIES.filter((i) => i.pickable && i.id !== 'wholesale_distribution')) {
    for (const q of ind.buyers) {
      const got = parseQuery(q).industries.map((x) => x.id);
      assert.ok(got.length, `${ind.id}: "${q}" names no industry`);
    }
    for (const q of (ind.connectors.association || [])) {
      const it = parseQuery(q);
      assert.ok(it.industries.length, `${ind.id}: association query "${q}" names no industry`);
    }
  }
});

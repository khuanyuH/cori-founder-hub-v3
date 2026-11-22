// Connector and customer precision for confirmed buyer types (re-test of 2026-11-12). Every organisation and person
// here is invented or a generic public-body name; the failure patterns come from a real import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPerson, analyzeOrg, suggestLeads, enrichPerson } from '../../server/matching/index.js';
import { connectorLink, isForeign } from '../../server/matching/enrich.js';
import { parseGeo } from '../../server/matching/geo.js';
import { createTestDb, addMember, addPerson, connect } from './helpers.js';

function link(title, company, customers, opts = {}) {
  const e = enrichPerson({ title, company });
  const p = { title, company, location: opts.location || null, ...e };
  const an = analyzeOrg(p);
  return { kind: an.kind, link: connectorLink(p, an, an.kind, customers, opts) };
}

// Government connectors need a remit that covers the buyers and a role with reach ---------------------------

test('a generic state or town employer with an unrelated title is not a connector', () => {
  for (const customers of [['utilities'], ['k12_education'], ['healthcare_providers'], ['insurance'], ['banking']]) {
    assert.equal(link('Firefighter', 'State of Tennessee', customers).link, null, `firefighter for ${customers}`);
    assert.equal(link('Cemetery Commissioner', 'Town of Maple Hollow', customers).link, null, `cemetery commissioner for ${customers}`);
    assert.equal(link('Policy Analyst', 'New Mexico Department of Justice', customers).link, null, `justice department for ${customers}`);
  }
});

test('a non-US public body never connects a US business', () => {
  assert.ok(isForeign('Al Noor Catering - (Dept. of Civil Aviation, Fujairah)'));
  assert.ok(isForeign('Ministry of Education (Singapore)'));
  assert.ok(!isForeign('New Mexico Department of Health'));
  assert.equal(link('Marketing Director', 'Al Noor Catering - (Dept. of Civil Aviation, Fujairah)', ['restaurants_hospitality']).link, null);
  assert.equal(link('Director of Schools Policy', 'Ministry of Education (Singapore)', ['k12_education']).link, null);
  const r = classifyPerson({ title: 'Marketing Director', company: 'Al Noor Catering - (Dept. of Civil Aviation, Fujairah)' });
  assert.ok(!r.industries.includes('state_government'), `foreign department is not a US state agency: ${r.industries}`);
});

test('regulators, departments and programs whose remit covers the buyers are connectors', () => {
  const cases = [
    ['Commissioner', 'Vermont Public Utility Commission', 'utilities'],
    ['Utility Analyst', 'Maine Public Utilities Commission', 'utilities'],
    ['Policy Analyst', 'Tennessee Department of Education', 'k12_education'],
    ['Program Manager', 'Ohio State Board of Education', 'k12_education'],
    ['Deputy Secretary', 'Pennsylvania Department of Agriculture', 'agriculture'],
    ['Executive Director', 'New Hampshire Board of Dental Examiners', 'dental'],
    ['Oral Health Program Manager', 'Vermont Department of Health', 'dental'],
    ['Director', 'Kentucky Office of Rural Health', 'healthcare_providers'],
    ['Broadband Program Specialist', 'Vermont Community Broadband Board', 'broadband_telecom'],
  ];
  for (const [title, company, id] of cases) {
    const r = link(title, company, [id]);
    assert.ok(r.link && r.link.id === id, `${title} @ ${company} -> ${id} (kind ${r.kind}, link ${JSON.stringify(r.link)})`);
  }
});

test('a unit named in the title links a generic state employer only for a role with reach', () => {
  assert.ok(link('Director, Office of School Nutrition', 'State of Ohio', ['k12_education']).link);
  assert.equal(link('Firefighter, School Fire Safety Unit', 'State of Ohio', ['k12_education']).link, null);
  assert.equal(link('Research Assistant', 'Federal Reserve Board', ['banking']).link, null, 'assistants have no reach');
  assert.equal(link('Legislative Intern', 'Vermont General Assembly', ['k12_education']).link, null);
});

test('a body named for another US state does not connect a founder who names their states', () => {
  const geoStates = parseGeo('Vermont and New Hampshire').states;
  assert.equal(link('Policy Analyst', 'Tennessee Department of Education', ['k12_education'], { geoStates }).link, null);
  assert.ok(link('Policy Analyst', 'Vermont Agency of Education', ['k12_education'], { geoStates }).link);
  assert.ok(link('Program Officer', 'U.S. Department of Education', ['k12_education'], { geoStates }).link, 'federal bodies are not state-bound');
});

// Other connector kinds need a positive link to the buyer industry too ------------------------------------

test('associations, distributors, chambers, extension and lenders link only to the buyers they serve', () => {
  assert.equal(link('Executive Director', 'Vermont Bar Association', ['utilities']).link, null);
  assert.ok(link('Executive Director', 'Northeast Public Power Association', ['utilities']).link);
  assert.ok(link('Member Services Director', 'Green Ridge Electric Cooperative', ['broadband_telecom']).link, 'electric co-ops reach broadband buyers');
  assert.equal(link('Sales Manager', 'Granite Office Supplies', ['dental']).link, null);
  assert.ok(link('Territory Manager', 'Northeast Dental Supply Co.', ['dental']).link);
  assert.equal(link('President', 'Maple Valley Chamber of Commerce', ['dental']).link, null);
  assert.ok(link('President', 'Maple Valley Chamber of Commerce', ['small_business']).link);
  assert.equal(link('Extension Educator', 'County Cooperative Extension', ['k12_education']).link, null);
  assert.ok(link('Extension Educator', 'County Cooperative Extension', ['agriculture']).link);
  assert.equal(link('Loan Officer', 'Heartland Farm Credit', ['k12_education']).link, null);
  assert.ok(link('Loan Officer', 'Heartland Farm Credit', ['livestock']).link);
});

test('the founder\'s own sector links its regulator and channels (a broadband builder selling to towns)', () => {
  assert.equal(link('Director', 'Vermont Broadband Office', ['local_government']).link, null);
  assert.ok(link('Director', 'Vermont Broadband Office', ['local_government'], { sector: ['broadband_telecom'] }).link);
  assert.ok(link('Account Manager', 'Northeast Food Distributors', ['grocery_retail'], { sector: ['food_manufacturing'] }).link);
  assert.equal(link('Firefighter', 'State of Vermont', ['local_government'], { sector: ['broadband_telecom'] }).link, null);
});

// End to end: what a founder with confirmed buyer types sees -----------------------------------------------

function poolDb(people) {
  const db = createTestDb();
  const founder = addMember(db, { name: 'Founder' });
  const staff = addMember(db, { name: 'Staff', role: 'staff' });
  const byKey = {};
  people.forEach(([key, title, company], i) => {
    byKey[key] = addPerson(db, { full_name: `Person ${i + 1}`, title, company });
    connect(db, staff, byKey[key], { strength: 'some' });
  });
  return { db, founder, byKey };
}
function setBuyers(db, memberId, industries, extra = {}) {
  db.prepare(`INSERT INTO businesses (member_id, name, description, industry, geography, customer_industries, lead_types) VALUES (?, 'Case', ?, ?, ?, ?, '["customer","connector"]')`)
    .run(memberId, extra.description || '', extra.industry || '', extra.geography || '', JSON.stringify(industries));
}

test('utilities and K-12 founders get remit-linked connectors, never a firefighter or a cemetery commissioner', async () => {
  const pool = [
    ['ff', 'Firefighter', 'State of Tennessee'],
    ['cem', 'Cemetery Commissioner', 'Town of Maple Hollow'],
    ['uae', 'Marketing Director', 'Al Noor Catering - (Dept. of Civil Aviation, Fujairah)'],
    ['doj', 'Policy Analyst', 'New Mexico Department of Justice'],
    ['puc', 'Commissioner', 'Vermont Public Utility Commission'],
    ['ppa', 'Executive Director', 'Northeast Public Power Association'],
    ['coop', 'General Manager', 'Green Ridge Electric Cooperative'],
    ['doe', 'Director of School Improvement', 'Vermont Agency of Education'],
    ['sba', 'Executive Director', 'Vermont School Boards Association'],
    ['sd', 'Superintendent', 'Maple Hollow School District'],
  ];
  const junk = ['ff', 'cem', 'uae', 'doj'];
  for (const [industries, want] of [[['utilities'], ['puc', 'ppa']], [['k12_education'], ['doe', 'sba']]]) {
    const { db, founder, byKey } = poolDb(pool);
    setBuyers(db, founder, industries);
    const { leads } = await suggestLeads(db, { memberId: founder, limit: 50, llm: false });
    const conn = leads.filter((l) => l.lead_type === 'connector').map((l) => l.person.id);
    for (const k of want) assert.ok(conn.includes(byKey[k]), `${industries}: ${k} should be a connector`);
    for (const k of junk) assert.ok(!conn.includes(byKey[k]), `${industries}: ${k} must not be a connector`);
    const gov = leads.find((l) => l.person.id === byKey[want[0]]);
    if (industries[0] === 'utilities') assert.match(gov.reasons[0], /remit covers utilities/);
  }
});

test('data-center customers need data-center signals, not just a software employer', async () => {
  const { db, founder, byKey } = poolDb([
    ['ai', 'AI Engineer & Manager', 'Nimbus Vision AI'],
    ['saas', 'Business Strategy Manager', 'ServiceNow'],
    ['csm', 'Senior Customer Success Manager', 'Persuado Marketing AI'],
    ['gsw', 'Software Engineer', 'Google'],
    ['eqx', 'Facilities Manager', 'Equinix'],
    ['colo', 'Critical Facilities Manager', 'Granite Colocation Partners'],
    ['gdc', 'Data Center Operations Manager', 'Google'],
  ]);
  setBuyers(db, founder, ['data_centers']);
  const { leads } = await suggestLeads(db, { memberId: founder, limit: 50, llm: false });
  const cust = leads.filter((l) => l.lead_type === 'customer').map((l) => l.person.id);
  for (const k of ['eqx', 'colo', 'gdc']) assert.ok(cust.includes(byKey[k]), `${k} is a data-center customer`);
  for (const k of ['ai', 'saas', 'csm', 'gsw']) assert.ok(!leads.some((l) => l.person.id === byKey[k]), `${k} is not a data-center lead`);
});

test('a buyer type never falls back to a neighbouring industry or a word in the persona query', async () => {
  const pool = [
    ['agency', 'Digital Media Buyer', 'Brightline Media Agency'],
    ['pr', 'Account Executive', 'Harbor PR Agency'],
    ['consult', 'Senior Consultant', 'Summit Strategy Consulting'],
    ['bank', 'Vice President', 'Granite Community Bank'],
    ['farm', 'General Manager', 'Hilltop Farm Market'],
    ['mfr', 'Mechanical Engineer', 'Valley Precision Manufacturing'],
    ['nh', 'Administrator', 'Maple Hollow Nursing Home'],
    ['staff', 'Recruiter', 'Northstar Staffing Agency'],
    ['env', 'Project Manager', 'Clearwater Environmental Remediation'],
  ];
  const expectations = [
    ['long_term_care', ['nh'], ['agency', 'pr', 'consult']],
    ['staffing_hr', ['staff'], ['agency', 'pr']],
    ['environmental', ['env'], ['consult']],
    ['insurance', [], ['bank']],
    ['veterinary', [], ['farm']],
    ['food_manufacturing', [], ['mfr']],
  ];
  for (const [id, want, never] of expectations) {
    const { db, founder, byKey } = poolDb(pool);
    setBuyers(db, founder, [id]);
    const { leads } = await suggestLeads(db, { memberId: founder, limit: 50, llm: false });
    const cust = leads.filter((l) => l.lead_type === 'customer').map((l) => l.person.id);
    for (const k of want) assert.ok(cust.includes(byKey[k]), `${id}: ${k} should be a customer`);
    for (const k of never) assert.ok(!cust.includes(byKey[k]), `${id}: ${k} must not be a customer`);
  }
});

test('front-line roles are not customers for a confirmed buyer type', async () => {
  const { db, founder, byKey } = poolDb([
    ['server', 'Server', 'Portside Italian Restaurant'],
    ['owner', 'Owner', 'Portside Italian Restaurant'],
  ]);
  setBuyers(db, founder, ['restaurants_hospitality']);
  const { leads } = await suggestLeads(db, { memberId: founder, limit: 50, llm: false });
  assert.ok(leads.some((l) => l.person.id === byKey.owner));
  assert.ok(!leads.some((l) => l.person.id === byKey.server && l.lead_type === 'customer'));
});

// Classification fixes behind the above ------------------------------------------------------------------

test('a university department is education, not a state agency; hyperscaler facilities roles are data-center buyers', () => {
  for (const company of ['Yale Department of Economics', 'Soft Matter Group, Yale Department of Chemical Engineering']) {
    const r = classifyPerson({ title: 'Research Assistant', company });
    assert.equal(r.org_type, 'education', company);
    assert.ok(!r.industries.includes('state_government'), `${company}: ${r.industries}`);
  }
  assert.ok(classifyPerson({ title: 'Data Center Facilities Manager', company: 'Google' }).industries.includes('data_centers'));
  assert.ok(!classifyPerson({ title: 'Software Engineer', company: 'Google' }).industries.includes('data_centers'));
  assert.ok(classifyPerson({ title: 'Sales Manager', company: 'Equinix' }).industries.includes('data_centers'));
  assert.ok(!classifyPerson({ title: 'Cemetery Commissioner', company: 'Town of Maple Hollow' }).industries.includes('state_government'));
  assert.ok(!classifyPerson({ title: 'Principal', company: 'Resume Builder Pro' }).industries.includes('construction'));
  assert.ok(classifyPerson({ title: 'Owner', company: 'Ridgeline Home Builders' }).industries.includes('construction'));
});

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, addMember, addPerson, connect, setBusiness, dismiss, rng } from './helpers.js';
import { search, suggestLeads } from '../../server/matching/index.js';

process.env.HUB_LLM = 'off';

let db; let founder; let board; let staff; const P = {};

before(() => {
  process.env.HUB_LLM = 'off'; // heuristics only, even if a real key is set
  db = createTestDb();
  founder = addMember(db, { name: 'Fran Founder', role: 'founder' });
  board = addMember(db, { name: 'Bea Board', role: 'board' });
  staff = addMember(db, { name: 'Sam Staff', role: 'staff' });
  setBusiness(db, founder, {
    name: 'BrightChair', industry: 'Dental practice software',
    description: 'Scheduling and billing software for dental offices.',
    target_customers: 'Dental offices and small DSOs', geography: 'New England', needs: 'fractional CFO',
  });
  const add = (key, rec, knowers) => {
    P[key] = addPerson(db, rec);
    for (const [m, strength, extra] of knowers) connect(db, m, P[key], { strength, ...(extra || {}) });
  };
  add('nhds', { full_name: 'Robin Ashgrove', title: 'Director of Member Services', company: 'New Hampshire Dental Society', location: 'Concord, New Hampshire, United States' },
    [[board, 'some', { source: 'linkedin', note: 'Served on a nonprofit board together', privateEmail: 'robin@example.org' }]]);
  add('ohio', { full_name: 'Kai Lindqvist', title: 'Executive Director', company: 'Ohio Dental Association', location: 'Columbus, Ohio, United States' }, [[staff, 'weak']]);
  add('owner', { full_name: 'Avery Oakes', title: 'Owner', company: 'Lakeside Family Dentistry', location: 'Burlington, Vermont, United States' }, [[staff, 'weak'], [board, 'strong']]);
  add('mgr', { full_name: 'Jules Corliss', title: 'Office Manager', company: 'Granite Smiles', location: 'Manchester, New Hampshire, United States' }, [[staff, 'some']]);
  add('mine', { full_name: 'Remy Upton', title: 'Owner', company: 'Harbor View Dental Care', location: 'Portland, Maine, United States' }, [[founder, 'strong']]);
  add('surname', { full_name: 'Chris Dental', title: 'Software Engineer', company: 'Lumen Freight', location: 'Boston, Massachusetts, United States' }, [[board, 'strong']]);
  add('former', { full_name: 'Noel Voss', title: 'Software Engineer (former dentist)', company: 'Cobalt Analytics', location: 'Hartford, Connecticut, United States' }, [[board, 'some']]);
  add('agency', { full_name: 'Drew Kincaid', title: 'Account Executive', company: 'Bright Dental Marketing Agency', location: 'Providence, Rhode Island, United States' }, [[staff, 'some']]);
  add('supply', { full_name: 'Quinn Hollister', title: 'Territory Manager', company: 'Northeast Dental Supply Co.', location: 'Worcester, Massachusetts, United States' }, [[staff, 'weak']]);
  add('cfo', { full_name: 'Wren Fairbanks', title: 'Fractional CFO', company: 'Fairbanks Advisory', location: 'Keene, New Hampshire, United States' }, [[staff, 'some']]);
  add('fa', { full_name: 'Gray Jessup', title: 'Financial Advisor', company: 'Summit Wealth Management', location: 'Nashua, New Hampshire, United States' }, [[staff, 'weak']]);
  add('dismissed', { full_name: 'Tatum Greaves', title: 'Practice Owner', company: 'Silver Lake Smile Center', location: 'Rutland, Vermont, United States' }, [[board, 'some']]);
  add('farm', { full_name: 'Logan Pendleton', title: 'Owner', company: 'Pine Hollow Farm', location: 'Montpelier, Vermont, United States' }, [[board, 'weak']]);
  add('nobody', { full_name: 'Orphan Person', title: 'Owner', company: 'Orphan Dental Group' }, []);
  dismiss(db, founder, P.dismissed);
});

test('motivating case: the dental society director tops "dental association leaders in New England"', async () => {
  const res = await search(db, { query: 'dental association leaders in New England', memberId: founder });
  assert.equal(res[0].person.id, P.nhds);
  assert.ok(res[0].reasons.includes('Leads a dental association: reaches many dental offices'), res[0].reasons.join(' | '));
  assert.equal(res[0].known_by[0].name, 'Bea Board');
  assert.equal(res[0].known_by[0].note, 'Served on a nonprofit board together');
  const ohio = res.findIndex((r) => r.person.id === P.ohio);
  assert.ok(ohio > 0, 'out-of-region association still listed, lower');
  assert.ok(res.every((r) => r.score >= 0 && r.score <= 1));
});

test('suggestLeads surfaces the dental society director in the top 3, known by the board member', async () => {
  const { personas, leads } = await suggestLeads(db, { memberId: founder, limit: 30 });
  assert.ok(personas.length >= 3);
  const idx = leads.findIndex((l) => l.person.id === P.nhds);
  assert.ok(idx >= 0 && idx < 3, `rank ${idx + 1}`);
  const lead = leads[idx];
  assert.equal(lead.lead_type, 'connector');
  assert.ok(lead.persona && lead.persona_id);
  assert.ok(lead.known_by.some((k) => k.member_id === board));
  assert.ok(lead.reasons[0].startsWith('Leads a dental association'));
});

test('distractors stay out of dental searches', async () => {
  const res = await search(db, { query: 'dentists', memberId: founder });
  const ids = res.map((r) => r.person.id);
  assert.ok(!ids.includes(P.surname), 'surname "Dental" must not match');
  assert.ok(!ids.includes(P.former), 'former dentist must not match');
  assert.ok(!ids.includes(P.farm));
  assert.ok(ids.includes(P.owner) && ids.includes(P.mgr));
  const agencyIdx = ids.indexOf(P.agency);
  if (agencyIdx >= 0) {
    assert.ok(agencyIdx > ids.indexOf(P.owner), 'vendor ranks below buyers');
    assert.ok(res[agencyIdx].reasons.some((r) => /partner/.test(r)));
  }
});

test('own-network people are kept, flagged and ranked below others; dismissed leads excluded; no unknown people', async () => {
  const res = await search(db, { query: 'dental office owners', memberId: founder, limit: 50 });
  const ids = res.map((r) => r.person.id);
  const mineIdx = ids.indexOf(P.mine);
  assert.ok(mineIdx >= 0);
  assert.ok(res[mineIdx].reasons.includes('Already in your own network'));
  assert.ok(res[mineIdx].known_by.some((k) => k.member_id === founder));
  for (let i = 0; i < mineIdx; i++) assert.ok(!res[i].known_by.some((k) => k.member_id === founder));
  assert.ok(!ids.includes(P.dismissed), 'dismissed lead');
  assert.ok(!ids.includes(P.nobody), 'nobody can introduce');
  const { leads } = await suggestLeads(db, { memberId: founder, limit: 50 });
  assert.ok(!leads.some((l) => l.person.id === P.dismissed));
  const lm = leads.findIndex((l) => l.person.id === P.mine);
  if (lm >= 0) assert.equal(lm, leads.length - 1);
});

test('known_by is strongest first and network size is a reason', async () => {
  const res = await search(db, { query: 'dental practice owner', memberId: founder });
  const owner = res.find((r) => r.person.id === P.owner);
  assert.equal(owner.known_by[0].strength, 'strong');
  assert.ok(owner.reasons.includes('Known by 2 hub members'));
});

test('suggestLeads diversifies across personas and includes several lead types', async () => {
  const { leads } = await suggestLeads(db, { memberId: founder, limit: 30 });
  const personas = new Set(leads.map((l) => l.persona_id));
  const types = new Set(leads.map((l) => l.lead_type));
  assert.ok(personas.size >= 3, [...personas].join(','));
  assert.ok(types.has('customer') && types.has('connector'));
});

test('talent mode ranks by role, not buying power', async () => {
  const res = await search(db, { query: 'fractional CFO', mode: 'talent', memberId: founder });
  assert.equal(res[0].person.id, P.cfo);
  assert.ok(res[0].reasons[0].includes('cfo'));
  assert.ok(!res.slice(0, 1).some((r) => r.person.id === P.fa));
});

test('results never contain an email address or phone number', async () => {
  const all = [
    ...(await search(db, { query: 'dental association leaders in New England', memberId: founder })),
    ...(await suggestLeads(db, { memberId: founder })).leads,
  ];
  const json = JSON.stringify(all);
  assert.ok(!json.includes('robin@example.org'));
  assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(json));
});

test('edge cases: empty query, no business, unknown member', async () => {
  assert.deepEqual(await search(db, { query: '   ', memberId: founder }), []);
  assert.deepEqual(await suggestLeads(db, { memberId: staff }), { personas: [], leads: [] });
  const res = await search(db, { query: 'dental', memberId: 9999 });
  assert.ok(res.length > 0);
  const q = await search(db, { query: 'AND OR NOT "unbalanced ( * NEAR', memberId: founder });
  assert.ok(Array.isArray(q));
});

test('search stays under ~150 ms on 5,000 people', async () => {
  const big = createTestDb();
  const r = rng(42);
  const members = [1, 2, 3, 4, 5, 6].map((i) => addMember(big, { name: `M${i}`, role: i === 1 ? 'founder' : 'board' }));
  const titles = ['Owner', 'Office Manager', 'CEO', 'Director', 'Software Engineer', 'Accountant', 'Teacher', 'Nurse', 'Executive Director', 'Sales Manager'];
  const companies = ['{P} Family Dentistry', '{P} Dental Society', '{P} Regional Hospital', '{P} Farms', '{P} Community College', 'Town of {P}',
    '{P} Savings Bank', '{P} Software', '{P} Plastics', '{P} Food Co-op', '{P} Electric Cooperative', '{P} Logistics', '{P} Law Offices'];
  const places = ['Lakeside', 'Riverbend', 'Granite', 'Maple', 'Cedar', 'Pine', 'Elm', 'Birch', 'Oak', 'Fox'];
  const states = ['New Hampshire', 'Vermont', 'Maine', 'Ohio', 'Iowa', 'Kentucky', 'Texas'];
  big.exec('BEGIN');
  for (let i = 0; i < 5000; i++) {
    const pick = (a) => a[Math.floor(r() * a.length)];
    const id = addPerson(big, { full_name: `Person ${i}`, title: pick(titles), company: pick(companies).replace('{P}', pick(places)), location: `${pick(places)}, ${pick(states)}, United States` });
    connect(big, pick(members.slice(1)), id, { strength: pick(['weak', 'some', 'strong']) });
    if (r() < 0.3) connect(big, pick(members), id, { source: 'manual', strength: 'some' });
  }
  big.exec('COMMIT');
  await search(big, { query: 'warmup', memberId: members[0] });
  const queries = ['dental association leaders in New England', 'hospital ceo in Kentucky', 'farms', 'community college deans', 'sales lead'];
  const times = [];
  for (const q of queries) {
    const t0 = performance.now();
    const res = await search(big, { query: q, memberId: members[0], mode: q.includes('sales') ? 'talent' : 'leads' });
    times.push(performance.now() - t0);
    assert.ok(res.length > 0, q);
  }
  const worst = Math.max(...times);
  assert.ok(worst < 150, `worst ${worst.toFixed(1)} ms (${times.map((t) => t.toFixed(0)).join(', ')})`);
});

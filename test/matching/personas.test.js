import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainBusiness } from '../../server/matching/index.js';

const BRIGHTCHAIR = {
  name: 'BrightChair', industry: 'Dental practice software',
  description: 'Scheduling and billing software for dental offices.',
  target_customers: 'Dental offices and small DSOs', geography: 'New England', needs: 'fractional CFO',
};

test('BrightChair gets customer and connector personas with geography and a why', () => {
  const ps = explainBusiness(BRIGHTCHAIR);
  const types = ps.map((p) => p.lead_type);
  assert.ok(types.includes('customer'));
  assert.ok(types.filter((t) => t === 'connector').length >= 2);
  const assoc = ps.find((p) => p.id === 'connector-dental-associations');
  assert.ok(assoc, 'dental association persona');
  assert.ok(assoc.queries.some((q) => /dental (association|society) in New England/.test(q)));
  for (const p of ps) {
    assert.ok(p.id && p.label && p.why && p.why.length > 20, p.id);
    assert.ok(Array.isArray(p.queries) && p.queries.length > 0, p.id);
    assert.ok(['customer', 'connector', 'partner', 'investor', 'talent'].includes(p.lead_type));
  }
  const talent = ps.find((p) => p.lead_type === 'talent');
  assert.ok(talent && talent.queries.includes('fractional CFO'));
  assert.ok(!types.includes('investor'));
});

test('investor persona only when fundraising is mentioned', () => {
  const ps = explainBusiness({ ...BRIGHTCHAIR, needs: 'raising a seed round' });
  assert.ok(ps.some((p) => p.lead_type === 'investor'));
});

test('a broadband company selling to towns targets towns, not other broadband providers', () => {
  const ps = explainBusiness({
    name: 'Ridgeline Fiber', industry: 'Fiber broadband provider',
    description: 'We build open-access fiber networks with towns.',
    target_customers: 'Towns, counties, school districts and libraries', geography: 'Vermont',
  });
  assert.equal(ps[0].id, 'customer-local_government');
  // Connectors come from the buyer types only (the founder's own industry no longer adds an "ecosystem" persona).
  assert.ok(ps.some((p) => p.id === 'connector-local_government-associations'));
  assert.ok(!ps.some((p) => /broadband_telecom/.test(p.id)));
  assert.ok(ps.every((p) => p.queries.every((q) => q.endsWith('in Vermont'))) || ps.some((p) => p.lead_type === 'talent'));
});

test('a food maker selling to grocers targets grocers', () => {
  const ps = explainBusiness({
    name: 'Hilltop Provisions', industry: 'Food manufacturing: granola',
    target_customers: 'Grocery stores, natural food co-ops and regional food distributors',
  });
  assert.equal(ps[0].id, 'customer-grocery_retail');
  assert.ok(!ps.some((p) => p.id === 'customer-food_manufacturing'));
});

test('no recognisable buyer gives no personas (no "Likely buyers" keyword fallback); empty profile gives nothing', () => {
  const ps = explainBusiness({ name: 'X', target_customers: 'quilting guild members' });
  assert.deepEqual(ps, []);
  assert.deepEqual(explainBusiness({}), []);
  assert.deepEqual(explainBusiness(null), []);
});

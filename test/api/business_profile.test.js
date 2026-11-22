// Guided business profile API (CONTRACT Addendum 2) and the schema migration for existing databases.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startTestServer, tempDbPath } from '../fixtures/helpers.js';
import { openDb, matching } from '../../server/db.js';

const needsReal = matching.__kind === 'stub' ? 'needs the real server/matching module (stub in use)' : false;

let t;
let founder;
before(async () => {
  t = await startTestServer({ label: 'guided' });
  founder = (await t.call('POST', '/api/members', { json: { name: 'Gina Founder', role: 'founder' } })).data;
});
after(async () => { await t.close(); });

test('GET /api/taxonomy needs no auth and lists buyer types in plain words', { skip: needsReal }, async () => {
  const r = await t.call('GET', '/api/taxonomy');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data) && r.data.length >= 40);
  for (const x of r.data) {
    assert.deepEqual(Object.keys(x).sort(), ['examples', 'group', 'id', 'label']);
    assert.ok(Array.isArray(x.examples) && x.examples.length >= 2);
  }
  assert.ok(r.data.some((x) => x.id === 'landscaping'));
});

test('preview: suggestions with evidence, needs_input, confirmed buyers override text', { skip: needsReal }, async () => {
  const lawn = await t.call('POST', '/api/business/preview', { member: founder.id, json: { name: 'Mowline', description: 'Scheduling software for lawn care companies.' } });
  assert.equal(lawn.status, 200);
  assert.equal(lawn.data.needs_input, false);
  const s = lawn.data.suggested_customers.find((x) => x.id === 'landscaping');
  assert.ok(s && /for lawn care companies/i.test(s.evidence), JSON.stringify(lawn.data.suggested_customers));
  assert.ok(lawn.data.personas.some((p) => p.id === 'customer-landscaping'));

  const none = await t.call('POST', '/api/business/preview', { member: founder.id, json: { name: 'Scanly', description: '3D body scanning studio that makes custom figurines.' } });
  assert.equal(none.data.needs_input, true);
  assert.ok(none.data.message);
  assert.deepEqual(none.data.suggested_customers, []);
  assert.ok(!none.data.personas.some((p) => p.lead_type === 'customer' || p.lead_type === 'connector'));

  const confirmed = await t.call('POST', '/api/business/preview', { member: founder.id, json: { name: 'Mowline', description: 'Scheduling software for lawn care companies.', customer_industries: ['dental'], lead_types: ['customer', 'connector'] } });
  assert.equal(confirmed.data.needs_input, false);
  const cust = confirmed.data.personas.filter((p) => p.lead_type === 'customer').map((p) => p.id);
  assert.deepEqual(cust, ['customer-dental']);
  assert.ok(confirmed.data.personas.every((p) => ['customer', 'connector', 'talent'].includes(p.lead_type)));
});

test('preview and PUT validate customer_industries and lead_types', { skip: needsReal }, async () => {
  const base = { name: 'X', description: 'y' };
  const bad = [
    { customer_industries: ['no_such_buyer'] },
    { customer_industries: 'dental' },
    { customer_industries: [42] },
    { customer_industries: ['investment'] },
    { lead_types: ['wizard'] },
    { lead_types: [] },
    { lead_types: 'customer' },
  ];
  for (const extra of bad) {
    const p = await t.call('POST', '/api/business/preview', { member: founder.id, json: { ...base, ...extra } });
    assert.equal(p.status, 400, JSON.stringify(extra));
    assert.ok(p.data.error);
    const u = await t.call('PUT', '/api/business', { member: founder.id, json: { ...base, ...extra } });
    assert.equal(u.status, 400, JSON.stringify(extra));
  }
});

test('PUT stores confirmed buyers and lead types; /me returns them as arrays; omitted fields are kept', { skip: needsReal }, async () => {
  const put = await t.call('PUT', '/api/business', { member: founder.id, json: {
    name: 'Mowline', description: 'Scheduling software for lawn care companies.', target_customers: 'snow plow operators',
    customer_industries: ['landscaping', 'landscaping', 'home_services'], lead_types: ['customer', 'connector', 'investor'],
  } });
  assert.equal(put.status, 200);
  assert.deepEqual(put.data.business.customer_industries, ['landscaping', 'home_services']);
  assert.deepEqual(put.data.business.lead_types, ['customer', 'connector', 'investor']);
  assert.equal(put.data.needs_input, false);
  assert.ok(Array.isArray(put.data.suggested_customers));
  assert.ok(put.data.personas.some((p) => p.lead_type === 'investor'));
  assert.ok(!put.data.personas.some((p) => p.lead_type === 'partner'));

  const me = await t.call('GET', '/api/me', { member: founder.id });
  assert.deepEqual(me.data.business.customer_industries, ['landscaping', 'home_services']);
  assert.deepEqual(me.data.business.lead_types, ['customer', 'connector', 'investor']);

  // An older client that does not send the new fields keeps them.
  const put2 = await t.call('PUT', '/api/business', { member: founder.id, json: { name: 'Mowline 2', description: 'Scheduling software.' } });
  assert.deepEqual(put2.data.business.customer_industries, ['landscaping', 'home_services']);
  assert.deepEqual(put2.data.business.lead_types, ['customer', 'connector', 'investor']);

  const sug = await t.call('GET', '/api/leads/suggested', { member: founder.id });
  assert.equal(sug.status, 200);
  assert.equal(sug.data.needs_input, false);
  assert.ok(Array.isArray(sug.data.leads));
});

test('suggested leads: needs_input with a message and no leads when no buyer is known', { skip: needsReal }, async () => {
  const other = (await t.call('POST', '/api/members', { json: { name: 'Hal Founder', role: 'founder' } })).data;
  const put = await t.call('PUT', '/api/business', { member: other.id, json: { name: 'Scanly', description: '3D body scanning studio that makes custom figurines.' } });
  assert.equal(put.status, 200);
  assert.equal(put.data.needs_input, true);
  assert.deepEqual(put.data.business.customer_industries, []);
  assert.deepEqual(put.data.business.lead_types, ['customer', 'connector', 'partner']);
  const sug = await t.call('GET', '/api/leads/suggested', { member: other.id });
  assert.equal(sug.status, 200);
  assert.equal(sug.data.needs_input, true);
  assert.deepEqual(sug.data.leads, []);
  assert.ok(sug.data.message);
  // Confirming a buyer type fixes it.
  const fixed = await t.call('PUT', '/api/business', { member: other.id, json: { name: 'Scanly', description: '3D body scanning.', customer_industries: ['retail'] } });
  assert.equal(fixed.data.needs_input, false);
  assert.equal((await t.call('GET', '/api/leads/suggested', { member: other.id })).data.needs_input, false);
});

test('openDb migrates an existing database: adds the two columns, keeps every row, is idempotent', () => {
  const p = tempDbPath('migrate');
  const old = new DatabaseSync(p);
  old.exec(`CREATE TABLE members (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, org TEXT,
              role TEXT NOT NULL DEFAULT 'founder', created_at TEXT NOT NULL DEFAULT (datetime('now')));
            CREATE TABLE businesses (id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
              name TEXT NOT NULL, description TEXT, industry TEXT, target_customers TEXT, geography TEXT, needs TEXT,
              updated_at TEXT NOT NULL DEFAULT (datetime('now')));
            INSERT INTO members (id, name) VALUES (1, 'Old Member');
            INSERT INTO businesses (member_id, name, description) VALUES (1, 'OldCo', 'Scheduling for dental offices');`);
  old.close();
  try {
    const db = openDb(p);
    const cols = db.prepare('PRAGMA table_info(businesses)').all().map((c) => c.name);
    assert.ok(cols.includes('customer_industries') && cols.includes('lead_types'));
    const row = db.prepare('SELECT * FROM businesses').get();
    assert.equal(row.name, 'OldCo');
    assert.equal(row.customer_industries, '[]');
    assert.deepEqual(JSON.parse(row.lead_types), ['customer', 'connector', 'partner']);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM members').get().n, 1);
    db.close();
    const again = openDb(p);
    assert.equal(again.prepare('SELECT COUNT(*) AS n FROM businesses').get().n, 1);
    again.close();
  } finally {
    fs.rmSync(path.dirname(p), { recursive: true, force: true });
  }
});

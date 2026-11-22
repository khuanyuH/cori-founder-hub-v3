// Optional LLM company classification, exercised only against a mocked fetch (no real API calls).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestDb } from './helpers.js';
import { classifyCompaniesWithLlm, applyCompanyCache, cachedCompanyClass, ensureCompanyCache } from '../../server/matching/llm_companies.js';
import { _clearLlmCache } from '../../server/matching/llm.js';
import { openDb, upsertPerson, reenrichAll } from '../../server/db.js';

const realFetch = globalThis.fetch;
const saved = { key: process.env.ANTHROPIC_API_KEY, off: process.env.HUB_LLM };
let calls;

function mockFetch(handler) {
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    return handler(body);
  };
}
const ok = (obj) => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], stop_reason: 'end_turn' }) });

beforeEach(() => { calls = []; _clearLlmCache(); delete process.env.HUB_LLM; process.env.ANTHROPIC_API_KEY = 'test-key-not-real'; });
afterEach(() => {
  globalThis.fetch = realFetch;
  if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved.key;
  if (saved.off === undefined) delete process.env.HUB_LLM; else process.env.HUB_LLM = saved.off;
});

test('no key: nothing is called and nothing is created', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  mockFetch(() => { throw new Error('should not be called'); });
  const db = createTestDb();
  const r = await classifyCompaniesWithLlm(db, ['Brighterway', 'Sea12']);
  assert.deepEqual(r, { asked: 0, stored: 0, batches: 0, failed: 0 });
  assert.equal(calls.length, 0);
  assert.equal(cachedCompanyClass(db, 'Brighterway'), null, 'missing table is fine');
});

test('batched, company names only, validated, cached once', async () => {
  const db = createTestDb();
  mockFetch((body) => {
    const { companies } = JSON.parse(body.messages[0].content);
    return ok({ results: companies.map((c) => (c.name === 'Brighterway' ? { i: c.i, industries: ['consulting', 'not_an_id'], org_type: 'company' }
      : c.name === 'Ridge Growers Guild' ? { i: c.i, industries: ['agriculture'], org_type: 'association' }
        : { i: c.i, industries: [], org_type: null })) });
  });
  const names = ['Brighterway', 'Sea12', 'Ridge Growers Guild', 'brighterway', 'Professor Jane Roe, History Department', 'Dr. Lee and Associates',
    ...Array.from({ length: 5 }, (_, i) => `Unknown Co ${i}`)];
  const r = await classifyCompaniesWithLlm(db, names, { batchSize: 4 });
  assert.equal(r.asked, 8, 'deduplicated; person-like company strings skipped');
  assert.equal(r.batches, 2);
  assert.equal(calls.length, 2);
  for (const c of calls) {
    const sent = JSON.stringify(c.body);
    assert.ok(!/Jane Roe|Dr\. Lee/.test(sent));
    const { companies } = JSON.parse(c.body.messages[0].content);
    assert.ok(companies.every((x) => Object.keys(x).sort().join() === 'i,name'), 'only an index and the company name are sent');
  }
  assert.deepEqual(cachedCompanyClass(db, 'Brighterway'), { industries: ['consulting'], org_type: 'company' });
  assert.equal(cachedCompanyClass(db, 'Sea12'), null, 'unknown answers are remembered but not applied');
  const again = await classifyCompaniesWithLlm(db, names, { batchSize: 4 });
  assert.equal(again.asked, 0, 'cached: not asked twice');
  assert.equal(calls.length, 2);
});

test('failures are silent; cache is applied only where the heuristics found nothing', async () => {
  const db = createTestDb();
  ensureCompanyCache(db);
  mockFetch(() => ({ ok: false, status: 500, json: async () => ({}) }));
  const r = await classifyCompaniesWithLlm(db, ['Brighterway']);
  assert.equal(r.failed, 1);
  db.prepare(`INSERT INTO company_classifications (company_key, company, industries, org_type) VALUES ('brighterway','Brighterway','["consulting"]','company'), ('goldman sachs','Goldman Sachs','["retail"]','company')`).run();
  assert.deepEqual(applyCompanyCache(db, 'Brighterway', { industries: [], org_type: 'company' }).industries, ['consulting']);
  assert.deepEqual(applyCompanyCache(db, 'Goldman Sachs', { industries: ['banking'], org_type: 'company' }).industries, ['banking'], 'heuristics win');
});

test('reenrich applies cached LLM answers for unknown companies', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-llmco-'));
  try {
    const db = openDb(path.join(dir, 'hub.db'));
    const { personId } = upsertPerson(db, { full_name: 'Avery Example', company: 'Brighterway', title: 'Associate' });
    assert.equal(db.prepare('SELECT industries FROM people WHERE id=?').get(personId).industries, '[]');
    ensureCompanyCache(db);
    db.prepare(`INSERT INTO company_classifications (company_key, company, industries, org_type) VALUES ('brighterway','Brighterway','["consulting"]','company')`).run();
    reenrichAll(db);
    assert.equal(db.prepare('SELECT industries FROM people WHERE id=?').get(personId).industries, '["consulting"]');
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

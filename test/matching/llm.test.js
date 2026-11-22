// The optional LLM layer, exercised only against a mocked fetch (no real API calls).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, addMember, addPerson, connect, setBusiness } from './helpers.js';
import { search, suggestLeads } from '../../server/matching/index.js';
import { _clearLlmCache, llmAvailable, llmModel, extractJson } from '../../server/matching/llm.js';

const realFetch = globalThis.fetch;
const saved = { key: process.env.ANTHROPIC_API_KEY, model: process.env.HUB_LLM_MODEL, off: process.env.HUB_LLM };
let calls;

function fixture() {
  const db = createTestDb();
  const founder = addMember(db, { name: 'Fran Founder' });
  const board = addMember(db, { name: 'Bea Board', role: 'board' });
  setBusiness(db, founder, { name: 'BrightChair', industry: 'Dental practice software', target_customers: 'Dental offices', geography: 'New England' });
  const ids = {};
  ids.nhds = addPerson(db, { full_name: 'Robin Ashgrove', title: 'Director of Member Services', company: 'New Hampshire Dental Society', location: 'Concord, New Hampshire' });
  ids.owner = addPerson(db, { full_name: 'Avery Oakes', title: 'Owner', company: 'Lakeside Family Dentistry', location: 'Burlington, Vermont' });
  ids.mgr = addPerson(db, { full_name: 'Jules Corliss', title: 'Office Manager', company: 'Granite Smiles', location: 'Manchester, New Hampshire' });
  for (const id of Object.values(ids)) connect(db, board, id, { strength: 'some', privateEmail: 'secret@example.org', note: 'private note' });
  return { db, founder, ids };
}

function mockFetch(handler) {
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    return handler(body);
  };
}

const ok = (text) => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }], stop_reason: 'end_turn' }) });

beforeEach(() => {
  calls = [];
  _clearLlmCache();
  delete process.env.HUB_LLM;
  delete process.env.HUB_LLM_MODEL;
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [k, env] of [['key', 'ANTHROPIC_API_KEY'], ['model', 'HUB_LLM_MODEL'], ['off', 'HUB_LLM']]) {
    if (saved[k] === undefined) delete process.env[env]; else process.env[env] = saved[k];
  }
});

test('no key: the LLM is never called', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  mockFetch(() => { throw new Error('should not be called'); });
  const { db, founder } = fixture();
  assert.equal(llmAvailable(), false);
  const res = await search(db, { query: 'dental association', memberId: founder });
  assert.ok(res.length > 0);
  await suggestLeads(db, { memberId: founder });
  assert.equal(calls.length, 0);
});

test('rerank: request shape, no names or private data sent, scores and reasons merged', async () => {
  const { db, founder, ids } = fixture();
  mockFetch((body) => {
    const items = JSON.parse(body.messages[0].content).items;
    // Rank the office manager first.
    const ranking = items.map((it) => ({ i: it.i, score: it.title === 'Office Manager' ? 10 : 2, reason: it.title === 'Office Manager' ? 'Runs the front desk, picks scheduling tools' : 'ok' }));
    return ok(`Here you go: ${JSON.stringify({ ranking })}`);
  });
  const res = await search(db, { query: 'dental offices', memberId: founder });
  assert.equal(calls.length, 1);
  const { url, init, body } = calls[0];
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.headers['x-api-key'], 'test-key-not-real');
  assert.ok(init.headers['anthropic-version']);
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.ok(body.max_tokens > 0);
  assert.ok(!('temperature' in body));
  const sent = init.body;
  for (const forbidden of ['Robin', 'Ashgrove', 'Avery', 'Oakes', 'Jules', 'Corliss', 'Bea Board', 'secret@example.org', 'private note']) {
    assert.ok(!sent.includes(forbidden), `sent ${forbidden}`);
  }
  assert.ok(sent.includes('Office Manager') && sent.includes('Granite Smiles'));
  assert.equal(res[0].person.id, ids.mgr);
  assert.equal(res[0].reasons[0], 'Runs the front desk, picks scheduling tools');
  assert.ok(res.every((r) => r.score >= 0 && r.score <= 1));
});

test('model override via HUB_LLM_MODEL', async () => {
  process.env.HUB_LLM_MODEL = 'claude-sonnet-5-5';
  assert.equal(llmModel(), 'claude-sonnet-5-5');
  const { db, founder } = fixture();
  mockFetch(() => ok('{"ranking":[]}'));
  await search(db, { query: 'dental offices', memberId: founder });
  assert.equal(calls[0].body.model, 'claude-sonnet-5-5');
});

test('failures fall back silently to the heuristic ranking', async () => {
  const { db, founder } = fixture();
  process.env.HUB_LLM = 'off';
  const baseline = (await search(db, { query: 'dental offices', memberId: founder })).map((r) => r.person.id);
  delete process.env.HUB_LLM;
  const failures = [
    () => { throw new Error('network down'); },
    () => ({ ok: false, status: 529, json: async () => ({}) }),
    () => ok('not json at all'),
    () => ok('{"ranking": "nope"}'),
    () => ({ ok: true, status: 200, json: async () => ({ content: [], stop_reason: 'refusal' }) }),
  ];
  for (const f of failures) {
    _clearLlmCache();
    mockFetch(f);
    const ids = (await search(db, { query: 'dental offices', memberId: founder })).map((r) => r.person.id);
    assert.deepEqual(ids, baseline);
  }
});

test('LLM personas are used by suggestLeads; a connector persona is always kept', async () => {
  const { db, founder, ids } = fixture();
  mockFetch((body) => {
    if (body.system.includes('business profile')) {
      return ok(JSON.stringify({ personas: [
        { label: 'Dental office managers', lead_type: 'customer', why: 'They pick scheduling software.', queries: ['dental office manager in New England'] },
        { label: 'Bogus', lead_type: 'wizard', why: 'invalid type is dropped', queries: ['x'] },
      ] }));
    }
    return ok('{"ranking":[]}');
  });
  const { personas, leads } = await suggestLeads(db, { memberId: founder });
  assert.equal(personas[0].label, 'Dental office managers');
  assert.ok(!personas.some((p) => p.label === 'Bogus'));
  assert.ok(personas.some((p) => p.lead_type === 'connector'), 'heuristic connectors merged in');
  assert.ok(leads.some((l) => l.person.id === ids.nhds));
  const personaCall = calls.find((c) => c.body.system.includes('business profile'));
  assert.ok(!personaCall.init.body.includes('Robin'));
});

test('extractJson tolerates prose around the JSON', () => {
  assert.deepEqual(extractJson('Sure! {"a": 1} Hope that helps.'), { a: 1 });
  assert.throws(() => extractJson('no braces'));
});

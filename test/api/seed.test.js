// Seed shape and the BrightChair / New Hampshire Dental Society scenario, end to end through the API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestServer, openTempDb } from '../fixtures/helpers.js';
import { seedDatabase } from '../../server/seed/index.js';
import { matching } from '../../server/db.js';

const needsReal = matching.__kind === 'stub' ? 'needs the real server/matching module (stub in use)' : false;

let t;
let ids;
before(async () => {
  t = await startTestServer({ seed: true, label: 'seed' });
  ids = t.seeded.memberIds;
});
after(async () => { await t.close(); });

test('seed: members, roles, businesses, pool size, per-member counts, overlap', () => {
  const db = t.db;
  const roles = db.prepare('SELECT role, COUNT(*) AS n FROM members GROUP BY role').all();
  assert.deepEqual(Object.fromEntries(roles.map((r) => [r.role, r.n])), { board: 2, founder: 4, mentor: 1, staff: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM businesses').get().n, 4);
  const people = db.prepare('SELECT COUNT(*) AS n FROM people').get().n;
  assert.ok(people >= 1300 && people <= 1700, `people=${people}`);
  for (const r of db.prepare('SELECT member_id, COUNT(DISTINCT person_id) AS n FROM connections GROUP BY member_id').all()) {
    assert.ok(r.n >= 150 && r.n <= 400, `member ${r.member_id} has ${r.n}`);
  }
  const shared = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT person_id FROM connections GROUP BY person_id HAVING COUNT(DISTINCT member_id) >= 2)`).get().n;
  const triple = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT person_id FROM connections GROUP BY person_id HAVING COUNT(DISTINCT member_id) >= 3)`).get().n;
  assert.ok(shared > 100, `shared=${shared}`);
  assert.ok(triple > 5, `triple=${triple}`);
  const sources = db.prepare('SELECT DISTINCT source FROM connections').all().map((r) => r.source).sort();
  assert.deepEqual(sources, ['calendar', 'email_headers', 'google_contacts', 'linkedin', 'manual', 'outlook_contacts', 'roster', 'vcard']);
  const strengths = db.prepare('SELECT DISTINCT strength FROM connections').all().map((r) => r.strength).sort();
  assert.deepEqual(strengths, ['some', 'strong', 'weak']);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM people_fts WHERE people_fts MATCH 'dental'").get().n > 20, true);
});

test('seed is deterministic', async () => {
  const a = await openTempDb('det-a');
  const b = await openTempDb('det-b');
  try {
    seedDatabase(a.db);
    seedDatabase(b.db);
    const q = 'SELECT p.full_name, p.company, p.title, c.member_id, c.source, c.strength FROM connections c JOIN people p ON p.id = c.person_id ORDER BY c.id';
    assert.deepEqual(a.db.prepare(q).all(), b.db.prepare(q).all());
  } finally {
    a.db.close(); b.db.close();
    fs.rmSync(path.dirname(a.path), { recursive: true, force: true });
    fs.rmSync(path.dirname(b.path), { recursive: true, force: true });
  }
});

test('scenario: the NH Dental Society director is known by the board member, not by the BrightChair founder', () => {
  const ruth = t.db.prepare("SELECT * FROM people WHERE company = 'New Hampshire Dental Society'").all();
  assert.equal(ruth.length, 1);
  assert.match(ruth[0].title, /Director/);
  const knowers = t.db.prepare('SELECT DISTINCT m.id, m.role FROM connections c JOIN members m ON m.id = c.member_id WHERE c.person_id = ?').all(ruth[0].id);
  assert.deepEqual(knowers.map((k) => k.id), [ids.eleanor]);
  assert.equal(knowers[0].role, 'board');
  const biz = t.db.prepare('SELECT * FROM businesses WHERE member_id = ?').get(ids.dana);
  assert.equal(biz.name, 'BrightChair');
});

test('scenario: searching as the BrightChair founder surfaces the NH Dental Society director via the board member', { skip: needsReal }, async () => {
  const r = await t.call('GET', `/api/search?q=${encodeURIComponent('dental association leaders in New England')}&mode=leads&limit=25`, { member: ids.dana });
  assert.equal(r.status, 200);
  const hit = r.data.results.find((x) => x.person.company === 'New Hampshire Dental Society');
  assert.ok(hit, `not found in: ${r.data.results.map((x) => `${x.person.full_name} @ ${x.person.company}`).join('; ')}`);
  assert.equal(hit.known_by[0].member_id, ids.eleanor);
  const rank = r.data.results.indexOf(hit);
  assert.ok(rank < 10, `rank ${rank}`);
});

test('scenario: suggested leads for BrightChair include the NH Dental Society director', { skip: needsReal }, async () => {
  const r = await t.call('GET', '/api/leads/suggested?limit=30', { member: ids.dana });
  assert.equal(r.status, 200);
  assert.ok(r.data.personas.length >= 2);
  const hit = r.data.leads.find((x) => x.person.company === 'New Hampshire Dental Society');
  assert.ok(hit, `not in suggested leads: ${r.data.leads.map((x) => `${x.person.full_name} @ ${x.person.company}`).join('; ')}`);
  assert.ok(hit.known_by.some((k) => k.member_id === ids.eleanor));
  const personas = new Set(r.data.leads.map((x) => x.persona));
  assert.ok(personas.size >= 2, 'leads are diversified across personas');
});

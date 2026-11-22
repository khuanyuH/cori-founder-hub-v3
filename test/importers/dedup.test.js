import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { upsertPerson, addConnection, normalizeLinkedIn, computeDedupKey, removeOrphanPeople } from '../../server/db.js';
import { importRecords, parseFile } from '../../server/importers/index.js';
import { openTempDb, fixture } from '../fixtures/helpers.js';

async function freshDb() {
  const { db, path: p } = await openTempDb('dedup');
  db.prepare("INSERT INTO members (name, email, role) VALUES ('Member One', 'one@member.example', 'founder')").run();
  db.prepare("INSERT INTO members (name, email, role) VALUES ('Member Two', 'two@member.example', 'board')").run();
  return { db, cleanup: () => { db.close(); fs.rmSync(path.dirname(p), { recursive: true, force: true }); } };
}

const count = (db) => db.prepare('SELECT COUNT(*) AS n FROM people').get().n;

test('normalizeLinkedIn and dedup_key priority', () => {
  assert.equal(normalizeLinkedIn('HTTPS://WWW.LinkedIn.com/in/Jo-Ann/?trk=x#y'), 'linkedin.com/in/jo-ann');
  assert.equal(normalizeLinkedIn('linkedin.com/in/jo-ann//'), 'linkedin.com/in/jo-ann');
  assert.equal(normalizeLinkedIn('https://example.com/me'), null);
  assert.equal(computeDedupKey({ full_name: 'Jo Ann', email: 'JO@X.example', linkedin_url: 'https://linkedin.com/in/jo' }), 'linkedin.com/in/jo');
  assert.equal(computeDedupKey({ full_name: 'Jo Ann', email: 'JO@X.example' }), 'jo@x.example');
  assert.equal(computeDedupKey({ first_name: 'Jo', last_name: 'Ann', company: 'Acme' }), 'jo|ann|acme');
});

test('same LinkedIn URL in different spellings -> one person', async () => {
  const { db, cleanup } = await freshDb();
  try {
    const a = upsertPerson(db, { full_name: 'Ada Quill', company: 'Acme', linkedin_url: 'https://www.linkedin.com/in/ada-q/' });
    const b = upsertPerson(db, { full_name: 'Ada Quill', company: 'Acme Corp', linkedin_url: 'http://linkedin.com/in/ADA-Q?x=1' });
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(a.personId, b.personId);
    assert.equal(count(db), 1);
  } finally { cleanup(); }
});

test('email match, then a later record adds a LinkedIn URL -> one row, key upgraded', async () => {
  const { db, cleanup } = await freshDb();
  try {
    const a = upsertPerson(db, { full_name: 'Bea Holt', company: 'Prairie Bank', email: 'bea@prairie.example' });
    addConnection(db, { memberId: 1, personId: a.personId, source: 'google_contacts', privateEmail: 'bea@prairie.example' });
    // Record with the same email but now also a LinkedIn URL and a title.
    const b = upsertPerson(db, { full_name: 'Bea Holt', email: 'BEA@prairie.example', linkedin_url: 'https://www.linkedin.com/in/bea-holt', title: 'VP Lending' });
    assert.equal(b.personId, a.personId);
    const row = db.prepare('SELECT * FROM people WHERE id = ?').get(a.personId);
    assert.equal(row.dedup_key, 'linkedin.com/in/bea-holt');
    assert.equal(row.title, 'VP Lending', 'missing fields are filled');
    // A third record with only the LinkedIn URL also lands on the same row.
    const c = upsertPerson(db, { full_name: 'Beatrice Holt', linkedin_url: 'linkedin.com/in/bea-holt' });
    assert.equal(c.personId, a.personId);
    assert.equal(count(db), 1);
  } finally { cleanup(); }
});

test('email stored only on a connection (person keyed by LinkedIn) still matches', async () => {
  const { db, cleanup } = await freshDb();
  try {
    const a = upsertPerson(db, { full_name: 'Cy Moss', company: 'Ridge', linkedin_url: 'https://linkedin.com/in/cymoss', email: 'cy@ridge.example' });
    addConnection(db, { memberId: 1, personId: a.personId, source: 'linkedin', privateEmail: 'cy@ridge.example' });
    const b = upsertPerson(db, { full_name: 'Cyrus Moss', company: 'Other Co', email: 'cy@ridge.example' });
    assert.equal(b.personId, a.personId);
    assert.equal(count(db), 1);
  } finally { cleanup(); }
});

test('first|last|company match, then LinkedIn added -> one row; different LinkedIn -> different person', async () => {
  const { db, cleanup } = await freshDb();
  try {
    const a = upsertPerson(db, { first_name: 'Dee', last_name: 'Park', company: 'Lakes Clinic' });
    const b = upsertPerson(db, { full_name: 'Dee Park', company: 'lakes clinic', linkedin_url: 'https://www.linkedin.com/in/dee-park-1' });
    assert.equal(b.personId, a.personId);
    assert.equal(db.prepare('SELECT dedup_key FROM people WHERE id = ?').get(a.personId).dedup_key, 'linkedin.com/in/dee-park-1');
    const c = upsertPerson(db, { full_name: 'Dee Park', company: 'Lakes Clinic', linkedin_url: 'https://www.linkedin.com/in/dee-park-2' });
    assert.notEqual(c.personId, a.personId, 'a namesake with a different profile is a different person');
    const d = upsertPerson(db, { full_name: 'Dee Park', company: 'Other Clinic' });
    assert.notEqual(d.personId, a.personId, 'different company is a different person');
    assert.equal(count(db), 3);
  } finally { cleanup(); }
});

test('people_fts stays in sync on insert and update', async () => {
  const { db, cleanup } = await freshDb();
  try {
    const a = upsertPerson(db, { full_name: 'Eve Lark', company: 'Zephyrine Logistics' });
    const hit = (q) => db.prepare('SELECT rowid FROM people_fts WHERE people_fts MATCH ?').all(q).map((r) => r.rowid);
    assert.deepEqual(hit('zephyrine'), [a.personId]);
    upsertPerson(db, { full_name: 'Eve Lark', company: 'Zephyrine Logistics', title: 'Quartermaster' });
    assert.deepEqual(hit('quartermaster'), [a.personId]);
    assert.deepEqual(hit('zephyrine'), [a.personId], 'no duplicate fts rows');
  } finally { cleanup(); }
});

test('addConnection: one edge per member/person/source; strength only goes up', async () => {
  const { db, cleanup } = await freshDb();
  try {
    const { personId } = upsertPerson(db, { full_name: 'Fay Orr', company: 'X' });
    assert.equal(addConnection(db, { memberId: 1, personId, source: 'calendar', strength: 'some', interactionCount: 3 }).created, true);
    assert.equal(addConnection(db, { memberId: 1, personId, source: 'calendar', strength: 'weak', interactionCount: 1 }).created, false);
    let row = db.prepare('SELECT * FROM connections WHERE member_id = 1 AND person_id = ?').get(personId);
    assert.equal(row.strength, 'some');
    assert.equal(row.interaction_count, 3);
    addConnection(db, { memberId: 1, personId, source: 'calendar', strength: 'strong', interactionCount: 9, note: 'Great' });
    row = db.prepare('SELECT * FROM connections WHERE member_id = 1 AND person_id = ?').get(personId);
    assert.equal(row.strength, 'strong');
    assert.equal(row.note, 'Great');
    assert.equal(addConnection(db, { memberId: 1, personId, source: 'linkedin' }).created, true, 'second source is a second edge');
    assert.equal(addConnection(db, { memberId: 2, personId, source: 'linkedin' }).created, true);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM connections').get().n, 3);
  } finally { cleanup(); }
});

test('importRecords: re-importing is idempotent; overlap across sources and members', async () => {
  const { db, cleanup } = await freshDb();
  try {
    const li = await parseFile('Connections.csv', fixture('Connections.csv'));
    const s1 = importRecords(db, 1, li.records, li.source, { skipped: li.skipped });
    assert.deepEqual(s1, { parsed: 4, new_people: 4, new_connections: 4, already_known: 0, skipped: 1 });
    const s2 = importRecords(db, 1, li.records, li.source);
    assert.equal(s2.new_people, 0);
    assert.equal(s2.new_connections, 0);
    assert.equal(s2.already_known, 4);
    const s3 = importRecords(db, 2, li.records, li.source);
    assert.equal(s3.new_people, 0, 'second member shares the pooled people');
    assert.equal(s3.new_connections, 4);
    const strengths = db.prepare("SELECT DISTINCT strength FROM connections WHERE source = 'linkedin'").all().map((r) => r.strength);
    assert.deepEqual(strengths, ['weak']);
    // Pasted roster that names someone already known via LinkedIn (same name + company).
    const s4 = importRecords(db, 1, [{ full_name: 'Ada Quillfeather', company: 'Granite Peaks Dental', title: 'Office Manager', source: 'roster' }], 'roster');
    assert.equal(s4.new_people, 0);
    assert.equal(s4.already_known, 1);
    assert.equal(s4.new_connections, 1);
    assert.equal(count(db), 4);
  } finally { cleanup(); }
});

test('importRecords skips the member themselves', async () => {
  const { db, cleanup } = await freshDb();
  try {
    const s = importRecords(db, 1, [
      { full_name: 'Member One', email: 'one@member.example', source: 'calendar', interaction_count: 9 },
      { full_name: 'Gil Rhee', email: 'gil@rhee.example', source: 'calendar', interaction_count: 6 },
    ], 'calendar');
    assert.equal(s.skipped, 1);
    assert.equal(s.new_people, 1);
    assert.equal(db.prepare('SELECT strength FROM connections').get().strength, 'strong');
  } finally { cleanup(); }
});

test('removeOrphanPeople deletes unreferenced people and their fts rows', async () => {
  const { db, cleanup } = await freshDb();
  try {
    const { personId } = upsertPerson(db, { full_name: 'Hal Wynn', company: 'Orphanage Works' });
    assert.equal(removeOrphanPeople(db), 1);
    assert.equal(count(db), 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM people_fts WHERE people_fts MATCH 'orphanage'").get().n, 0);
    void personId;
  } finally { cleanup(); }
});

// reenrichAll: recompute stored tags with the current classifier, rebuild people_fts; idempotent. Temp DB only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, reenrichAll, upsertPerson } from '../../server/db.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-reenrich-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('reenrich fixes stale tags, rebuilds FTS, and is idempotent', () => {
  const db = openDb(path.join(dir, 'hub.db'));
  const { personId: a } = upsertPerson(db, { full_name: 'Avery Example', company: 'McKinsey & Company', title: 'Business Analyst' });
  const { personId: b } = upsertPerson(db, { full_name: 'Rowan Example', company: 'Yale Computer Society', title: 'Software Engineer' });
  const { personId: c } = upsertPerson(db, { full_name: 'Jules Example', company: 'New Hampshire Dental Society', title: 'Director' });
  // Simulate rows written by an older classifier.
  db.prepare(`UPDATE people SET industries='[]', org_type='company', job_function='other', seniority='ic' WHERE id=?`).run(a);
  db.prepare(`UPDATE people SET industries='["software_it"]', org_type='association' WHERE id=?`).run(b);
  db.prepare(`DELETE FROM people_fts WHERE rowid = ?`).run(a);

  const first = reenrichAll(db);
  assert.equal(first.total, 3);
  assert.equal(first.changed, 2);
  const row = (id) => db.prepare('SELECT industries, org_type, job_function FROM people WHERE id=?').get(id);
  assert.deepEqual(JSON.parse(row(a).industries), ['consulting']);
  assert.equal(row(a).job_function, 'operations');
  assert.equal(row(b).org_type, 'education');
  assert.equal(row(c).org_type, 'association');
  const fts = (q) => db.prepare('SELECT rowid FROM people_fts WHERE people_fts MATCH ?').all(q).map((r) => r.rowid);
  assert.deepEqual(fts('consulting'), [a], 'FTS rebuilt with the new tags');
  assert.deepEqual(fts('association'), [c]);
  assert.equal(db.prepare('SELECT count(*) n FROM people_fts').get().n, 3);

  const second = reenrichAll(db);
  assert.equal(second.changed, 0, 'idempotent');
  assert.deepEqual(fts('consulting'), [a]);
  db.close();
});

test('reenrich runs while another connection is reading (WAL)', () => {
  const p = path.join(dir, 'concurrent.db');
  const writer = openDb(p);
  upsertPerson(writer, { full_name: 'Casey Example', company: 'Goldman Sachs', title: 'Analyst' });
  const reader = openDb(p);
  reader.exec('BEGIN');
  const beforeRead = reader.prepare('SELECT count(*) n FROM people').get().n;
  const res = reenrichAll(writer);
  assert.equal(res.total, 1);
  assert.equal(reader.prepare('SELECT count(*) n FROM people').get().n, beforeRead);
  reader.exec('COMMIT');
  reader.close();
  writer.close();
});

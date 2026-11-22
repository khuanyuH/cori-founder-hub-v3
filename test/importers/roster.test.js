import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile, parsePastedText, detectSource } from '../../server/importers/index.js';
import { fixture } from '../fixtures/helpers.js';

test('roster: pasted free text in several line formats', () => {
  const recs = parsePastedText(fixture('roster.txt').toString('utf8'));
  const by = Object.fromEntries(recs.map((r) => [r.full_name, r]));
  assert.equal(recs.length, 6);
  assert.deepEqual([by['Odessa Fairweather'].title, by['Odessa Fairweather'].company], ['Treasurer', 'Lakes Region Savings Bank']);
  assert.deepEqual([by['Percival Strand'].title, by['Percival Strand'].company], ['Executive Director', 'Upper Valley Business Alliance']);
  assert.deepEqual([by['Quentin Marlowe'].title, by['Quentin Marlowe'].company], ['Chief Nursing Officer', 'North Country Regional Hospital']);
  assert.deepEqual([by['Rhiannon Tate'].title, by['Rhiannon Tate'].company], ['Board Chair', 'Monadnock Community Foundation']);
  assert.equal(by['Sigrid Holloway'].title, 'DDS', 'honorific stripped');
  assert.equal(by['Tobias Wren'].company, 'Wren & Daughters Hardware');
  assert.equal(by['Tobias Wren'].email, 'tobias@wrenhardware.example', 'email kept only for dedup');
  for (const r of recs) {
    assert.equal(r.source, 'roster');
    assert.ok(!/@|555/.test(`${r.full_name} ${r.title} ${r.company}`), 'no contact details in visible fields');
  }
  assert.ok(!by['Board of Directors'], 'heading line is not a person');
});

test('roster: CSV with arbitrary headers', async () => {
  const buf = fixture('roster.csv');
  assert.equal(detectSource('attendees.csv', buf), 'roster');
  const out = await parseFile('attendees.csv', buf);
  assert.equal(out.source, 'roster');
  assert.equal(out.records.length, 2);
  assert.equal(out.skipped, 1);
  assert.equal(out.records[0].full_name, 'Ulla Brightmore');
  assert.equal(out.records[0].company, 'Heartland Farmers Alliance');
  assert.equal(out.records[0].title, 'Membership Director');
});

test('roster: tab-separated paste from a spreadsheet', () => {
  const recs = parsePastedText('Name\tTitle\tCompany\nXan Forde\tCFO\tCopperline Telecom\nYael Brant\tDirector\tSummit Logistics\n');
  assert.deepEqual(recs.map((r) => [r.full_name, r.title, r.company]), [
    ['Xan Forde', 'CFO', 'Copperline Telecom'], ['Yael Brant', 'Director', 'Summit Logistics']]);
});

test('manual: JSON contact with a vouch note', async () => {
  const buf = fixture('manual.json');
  assert.equal(detectSource('contact.json', buf), 'manual');
  const out = await parseFile('contact.json', buf);
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].note, 'Co-invested twice; very responsive.');
  assert.equal(out.records[0].source, 'manual');
});

test('unknown binary file is not recognised', async () => {
  const out = await parseFile('photo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]));
  assert.equal(out.source, null);
});

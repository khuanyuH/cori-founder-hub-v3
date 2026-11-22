import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile, detectSource } from '../../server/importers/index.js';
import { fixture } from '../fixtures/helpers.js';

test('google contacts: new (2020+) header set', async () => {
  const buf = fixture('google_contacts_new.csv');
  assert.equal(detectSource('contacts.csv', buf), 'google_contacts');
  const out = await parseFile('contacts.csv', buf);
  assert.equal(out.records.length, 2);
  assert.equal(out.skipped, 1);
  const elsie = out.records[0];
  assert.equal(elsie.full_name, 'Elsie Varnham');
  assert.equal(elsie.company, 'Cedar Valley Community College');
  assert.equal(elsie.title, 'Dean of Workforce Development');
  assert.equal(elsie.email, 'elsie.varnham@cedarvalley.example');
  assert.equal(elsie.linkedin_url, 'https://www.linkedin.com/in/elsie-varnham');
  assert.equal(elsie.location, 'Ames, IA');
  assert.equal(out.records[1].full_name, 'Fenwick J. Oduya', 'middle name kept in full name');
  for (const r of out.records) assert.ok(!JSON.stringify(r).includes('555-01'), 'no phone numbers parsed');
});

test('google contacts: old "Google CSV" header set', async () => {
  const buf = fixture('google_contacts_old.csv');
  assert.equal(detectSource('google.csv', buf), 'google_contacts');
  const out = await parseFile('google.csv', buf);
  assert.equal(out.records.length, 2);
  assert.equal(out.skipped, 1);
  const g = out.records[0];
  assert.equal(g.full_name, 'Gwendolyn Harrowgate');
  assert.equal(g.first_name, 'Gwendolyn');
  assert.equal(g.company, 'Ozark Mountain Health Partners');
  assert.equal(g.title, 'Chief Executive Officer');
  assert.equal(g.linkedin_url, 'https://linkedin.com/in/gwen-harrowgate/');
  assert.equal(out.records[1].company, 'Brandvold Farms');
});

test('outlook contacts csv', async () => {
  const buf = fixture('outlook_contacts.csv');
  assert.equal(detectSource('outlook.csv', buf), 'outlook_contacts');
  const out = await parseFile('outlook.csv', buf);
  assert.equal(out.records.length, 2);
  const i = out.records[0];
  assert.equal(i.full_name, 'Ignatius Pellwright');
  assert.equal(i.company, 'Ridgeline Ventures');
  assert.equal(i.title, 'General Partner');
  assert.equal(i.email, 'ignatius@ridgelinevc.example');
  assert.equal(i.linkedin_url, 'https://www.linkedin.com/in/ignatius-pellwright');
  assert.equal(i.location, 'Burlington, VT');
  assert.equal(out.records[1].location, 'Montpelier, VT', 'falls back to home address city');
});

test('vcard: multi-card, folded lines, quoted-printable, nameless card skipped', async () => {
  const buf = fixture('contacts.vcf');
  assert.equal(detectSource('contacts.vcf', buf), 'vcard');
  const out = await parseFile('contacts.vcf', buf);
  assert.equal(out.source, 'vcard');
  assert.equal(out.records.length, 3);
  assert.equal(out.skipped, 1);
  const k = out.records[0];
  assert.equal(k.full_name, 'Kasimir Delavanne');
  assert.equal(k.company, 'Granite Hills Community Bank', 'first ORG component only');
  assert.equal(k.title, 'VP Commercial Lending and Small Business Relationship Manager for the Seacoast Region', 'folded line joined');
  assert.equal(k.email, 'kasimir@granitehills.example');
  assert.equal(k.linkedin_url, 'https://www.linkedin.com/in/kasimir-delavanne', 'grouped item1.URL with escaped colon');
  assert.equal(k.location, 'Portsmouth, NH');
  assert.equal(out.records[1].full_name, 'Lumière Renée', 'QP soft line break + UTF-8');
  const moira = out.records[2];
  assert.equal(moira.full_name, 'Moira Strand', 'name built from N when FN is missing');
  const all = JSON.stringify(out.records);
  assert.ok(!/555[\s-]01/.test(all), 'TEL and NOTE are never read');
});

test('vcard detected by content even with an unknown extension', () => {
  assert.equal(detectSource('export.txt', Buffer.from('BEGIN:VCARD\nFN:A B\nEND:VCARD\n')), 'vcard');
});

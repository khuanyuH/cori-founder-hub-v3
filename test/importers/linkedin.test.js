import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { parseFile, detectSource } from '../../server/importers/index.js';
import { parseLinkedIn } from '../../server/importers/linkedin.js';
import { fixture } from '../fixtures/helpers.js';

test('linkedin csv: skips Notes preamble, finds header, parses dates and urls', async () => {
  const buf = fixture('Connections.csv');
  assert.equal(detectSource('Connections.csv', buf), 'linkedin');
  const out = await parseFile('Connections.csv', buf);
  assert.equal(out.source, 'linkedin');
  assert.equal(out.records.length, 4);
  assert.equal(out.skipped, 1, 'row without a name is skipped');
  assert.deepEqual(out.warnings, [], 'skipping the Notes preamble is normal and not a warning');
  const ada = out.records[0];
  assert.equal(ada.full_name, 'Ada Quillfeather');
  assert.equal(ada.company, 'Granite Peaks Dental');
  assert.equal(ada.title, 'Office Manager');
  assert.equal(ada.connected_on, '2026-04-19');
  assert.equal(ada.source, 'linkedin');
  const cora = out.records.find((r) => r.last_name === 'Penhallow');
  assert.equal(cora.company, 'Northeast Dental Supply Co., Inc.', 'quoted comma inside a field');
  assert.equal(out.records.find((r) => r.first_name === 'Bastian').email, 'bastian@heartlandseed.example');
});

test('linkedin csv without preamble (header on first line) still parses', () => {
  const text = 'First Name,Last Name,URL,Email Address,Company,Position,Connected On\nYves,Montclair,https://www.linkedin.com/in/yves-m,,Acme,CEO,01 Jan 2020\n';
  const out = parseLinkedIn(Buffer.from(text));
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].connected_on, '2020-01-01');
});

test('linkedin zip: finds Connections.csv inside the export archive', async () => {
  const zip = Buffer.from(zipSync({
    'Basic_LinkedInDataExport_11-11-2026/Profile.csv': strToU8('First Name,Last Name\nMe,Myself\n'),
    'Basic_LinkedInDataExport_11-11-2026/Connections.csv': new Uint8Array(fixture('Connections.csv')),
    'Basic_LinkedInDataExport_11-11-2026/messages.csv': strToU8('FROM,TO,CONTENT\nx,y,private body\n'),
  }));
  assert.equal(detectSource('Basic_LinkedInDataExport.zip', zip), 'linkedin');
  const out = await parseFile('Basic_LinkedInDataExport.zip', zip);
  assert.equal(out.source, 'linkedin');
  assert.equal(out.records.length, 4);
  assert.equal(out.records[0].full_name, 'Ada Quillfeather');
});

test('zip without Connections.csv is not recognised', async () => {
  const zip = Buffer.from(zipSync({ 'other.txt': strToU8('hello') }));
  assert.equal(detectSource('random.zip', zip), null);
  const out = await parseFile('random.zip', zip, 'linkedin');
  assert.equal(out.records.length, 0);
  assert.ok(out.warnings[0].includes('Connections.csv'));
});

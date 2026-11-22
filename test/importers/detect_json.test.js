// JSON is only a 'manual' import when it is a contact (or a list of contacts) with a name.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { detectSource, parseFile } from '../../server/importers/index.js';
import { startTestServer } from '../fixtures/helpers.js';

const buf = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v));

test('package.json and other non-contact JSON are not recognised', async () => {
  const pkg = buf({ name: 'some-app', version: '1.0.0', scripts: { test: 'node --test' }, dependencies: { express: '^5' } });
  assert.equal(detectSource('package.json', pkg), null);
  const out = await parseFile('package.json', pkg);
  assert.equal(out.source, null);
  assert.equal(out.records.length, 0);
  assert.equal(detectSource('data.json', buf([1, 2, 3])), null);
  assert.equal(detectSource('data.json', buf(['a', 'b'])), null);
  assert.equal(detectSource('data.json', buf({ title: 'Partner', company: 'Acme' })), null, 'no name');
  assert.equal(detectSource('broken.json', buf('{ not json')), null);
  assert.equal(detectSource('empty.json', buf([])), null);
});

test('contact JSON (object or array) is a manual import', () => {
  assert.equal(detectSource('contact.json', buf({ full_name: 'Avery Example', company: 'Acme' })), 'manual');
  assert.equal(detectSource('contact.json', buf({ first_name: 'Avery', last_name: 'Example' })), 'manual');
  assert.equal(detectSource('contacts.json', buf([{ full_name: 'Avery Example' }, { first_name: 'Rowan' }])), 'manual');
  assert.equal(detectSource('pasted.txt', buf({ full_name: 'Avery Example' })), 'manual', 'content sniffing without the extension');
});

let t;
after(async () => { if (t) await t.close(); });

test('uploading package.json returns 422 instead of previewing a junk contact', async () => {
  t = await startTestServer({ label: 'detect-json' });
  const m = (await t.call('POST', '/api/members', { json: { name: 'Uploader Example', role: 'founder' } })).data;
  const pkg = buf({ name: 'some-app', version: '1.0.0', private: true });
  const prev = await t.upload('/api/import/preview', m.id, 'package.json', pkg);
  assert.equal(prev.status, 422);
  assert.ok(prev.data.error);
  const ok = await t.upload('/api/import/preview', m.id, 'contact.json', buf({ full_name: 'Avery Example', company: 'Acme', title: 'Owner' }));
  assert.equal(ok.status, 200);
  assert.equal(ok.data.source, 'manual');
  assert.equal(ok.data.parsed, 1);
});

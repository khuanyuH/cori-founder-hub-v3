// Privacy rule: no API response ever contains an email address or phone number.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, fixture, EMAIL_PATTERN, PHONE_PATTERN } from '../fixtures/helpers.js';

let t;
before(async () => { t = await startTestServer({ seed: true, label: 'privacy' }); });
after(async () => { await t.close(); });

test('no API response contains an email address or phone number', async () => {
  const members = (await t.call('GET', '/api/members')).data;
  const founder = members.find((m) => m.role === 'founder').id;
  const board = members.find((m) => m.role === 'board').id;

  // Import every fixture (they contain emails and phone numbers) as the founder.
  for (const file of ['Connections.csv', 'google_contacts_new.csv', 'google_contacts_old.csv', 'outlook_contacts.csv',
    'contacts.vcf', 'calendar.ics', 'mail.mbox', 'roster.txt', 'roster.csv', 'manual.json']) {
    const p = await t.upload('/api/import/preview', founder, file, fixture(file));
    assert.equal(p.status, 200, file);
    const r = await t.upload('/api/import', founder, file, fixture(file));
    assert.equal(r.status, 200, file);
  }
  await t.call('POST', '/api/import/paste', { member: founder, json: { text: 'Zed Quarry, CFO, Quarry Co, zed@quarry.example, (603) 555-0111', preview: true } });
  await t.call('POST', '/api/import/paste', { member: founder, json: { text: 'Zed Quarry, CFO, Quarry Co, zed@quarry.example, (603) 555-0111' } });
  // A note typed with contact details in it.
  const c = await t.call('POST', '/api/contacts', { member: founder, json: { full_name: 'Una Vale', company: 'Vale Farms', note: 'Email una@valefarms.example or call 802-555-0190' } });
  await t.call('POST', '/api/members', { json: { name: 'New Person', email: 'new.person@member.example' } });

  // Hit every read endpoint.
  await t.call('GET', '/api/me', { member: founder });
  await t.call('GET', '/api/network?limit=500', { member: founder });
  await t.call('GET', '/api/network?q=quarry', { member: founder });
  await t.call('GET', '/api/network?limit=500', { member: board });
  for (const q of ['dental association', 'cedar valley', 'vale farms', 'fractional CFO', 'bank']) {
    for (const mode of ['leads', 'talent', 'any']) {
      await t.call('GET', `/api/search?q=${encodeURIComponent(q)}&mode=${mode}&limit=50`, { member: board });
    }
  }
  await t.call('GET', '/api/leads/suggested?limit=100', { member: founder });
  await t.call('POST', `/api/leads/${c.data.person_id}/feedback`, { member: board, json: { verdict: 'saved' } });
  await t.call('GET', '/api/leads/saved', { member: board });
  const intro = await t.call('POST', '/api/intros', { member: board, json: { person_id: c.data.person_id, introducer_id: founder, message: 'reach me at board@member.example' } });
  assert.equal(intro.status, 201);
  await t.call('GET', '/api/intros', { member: board });
  await t.call('GET', '/api/intros', { member: founder });
  await t.call('GET', '/api/members');

  assert.ok(t.bodies.length > 40);
  for (const b of t.bodies) {
    assert.ok(!EMAIL_PATTERN.test(b.text), `email address in ${b.method} ${b.url}: ${b.text.match(EMAIL_PATTERN)?.[0]}`);
    assert.ok(!PHONE_PATTERN.test(b.text), `phone number in ${b.method} ${b.url}: ${b.text.match(PHONE_PATTERN)?.[0]}`);
    assert.ok(!/"(private_)?email"\s*:/.test(b.text), `email key in ${b.method} ${b.url}`);
  }
});

test('stored visible fields carry no contact details (privacy holds below the response layer too)', () => {
  const rows = t.db.prepare('SELECT full_name, company, title, location, linkedin_url FROM people').all();
  for (const r of rows) {
    const s = Object.values(r).filter(Boolean).join(' ');
    assert.ok(!EMAIL_PATTERN.test(s), s);
    assert.ok(!PHONE_PATTERN.test(s), s);
  }
  const notes = t.db.prepare('SELECT note FROM connections WHERE note IS NOT NULL').all();
  for (const n of notes) {
    assert.ok(!EMAIL_PATTERN.test(n.note), n.note);
    assert.ok(!PHONE_PATTERN.test(n.note), n.note);
  }
  // private_email is stored for dedup only.
  assert.ok(t.db.prepare('SELECT COUNT(*) AS n FROM connections WHERE private_email IS NOT NULL').get().n > 0);
});

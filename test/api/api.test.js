import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, fixture } from '../fixtures/helpers.js';

let t;
let alice; // founder
let bob; // board member
before(async () => {
  t = await startTestServer({ label: 'routes' });
  alice = (await t.call('POST', '/api/members', { json: { name: 'Alice Founder', email: 'alice@member.example', org: 'Testco', role: 'founder' } })).data;
  bob = (await t.call('POST', '/api/members', { json: { name: 'Bob Board', email: 'bob@member.example', role: 'board' } })).data;
});
after(async () => { await t.close(); });

test('health and unknown routes', async () => {
  assert.deepEqual((await t.call('GET', '/api/health')).data, { ok: true });
  const r = await t.call('GET', '/api/nope');
  assert.equal(r.status, 404);
  assert.ok(r.data.error);
  const page = await t.call('GET', '/definitely-missing.html');
  assert.equal(page.status, 404);
});

test('members: create, list, validation; never returns member email', async () => {
  assert.equal(alice.name, 'Alice Founder');
  assert.equal(alice.role, 'founder');
  assert.equal(alice.email, undefined);
  const list = await t.call('GET', '/api/members');
  assert.equal(list.status, 200);
  assert.deepEqual(Object.keys(list.data[0]).sort(), ['connection_count', 'headline', 'id', 'name', 'org', 'role']);
  assert.equal((await t.call('POST', '/api/members', { json: {} })).status, 400);
  assert.equal((await t.call('POST', '/api/members', { json: { name: 'X', role: 'king' } })).status, 400);
  assert.equal((await t.call('POST', '/api/members', { json: { name: 'Dup', email: 'alice@member.example' } })).status, 409);
});

test('auth: member-scoped routes need a valid X-Member-Id', async () => {
  assert.equal((await t.call('GET', '/api/me')).status, 401);
  assert.equal((await t.call('GET', '/api/me', { member: 99999 })).status, 401);
  assert.equal((await t.call('GET', '/api/me', { member: 'abc' })).status, 401);
  assert.equal((await t.call('GET', '/api/network')).status, 401);
  assert.equal((await t.call('GET', '/api/search?q=x')).status, 401);
});

test('me + business profile + preview + suggested leads gate', async () => {
  let me = await t.call('GET', '/api/me', { member: alice.id });
  assert.equal(me.status, 200);
  assert.equal(me.data.member.id, alice.id);
  assert.equal(me.data.business, null);
  assert.deepEqual(Object.keys(me.data.stats).sort(), ['by_source', 'connections', 'pool_members', 'pool_people']);
  assert.equal((await t.call('GET', '/api/leads/suggested', { member: alice.id })).status, 409);

  const biz = { name: 'ChairCo', description: 'Scheduling for dental offices', industry: 'dental software', target_customers: 'dental offices', geography: 'New England', needs: 'fractional CFO' };
  const prev = await t.call('POST', '/api/business/preview', { member: alice.id, json: biz });
  assert.equal(prev.status, 200);
  assert.ok(Array.isArray(prev.data.personas) && prev.data.personas.length > 0);
  me = await t.call('GET', '/api/me', { member: alice.id });
  assert.equal(me.data.business, null, 'preview does not write');

  assert.equal((await t.call('PUT', '/api/business', { member: alice.id, json: { description: 'no name' } })).status, 400);
  const put = await t.call('PUT', '/api/business', { member: alice.id, json: biz });
  assert.equal(put.status, 200);
  assert.equal(put.data.business.name, 'ChairCo');
  assert.ok(put.data.personas.length > 0);
  for (const p of put.data.personas) {
    assert.ok(p.id && p.label && p.lead_type && Array.isArray(p.queries));
  }
  const put2 = await t.call('PUT', '/api/business', { member: alice.id, json: { ...biz, name: 'ChairCo 2' } });
  assert.equal(put2.data.business.name, 'ChairCo 2', 'upsert');
  const sug = await t.call('GET', '/api/leads/suggested', { member: alice.id });
  assert.equal(sug.status, 200);
  assert.ok(Array.isArray(sug.data.personas));
  assert.ok(Array.isArray(sug.data.leads));
});

test('import preview and import (LinkedIn csv) with stats; network listing', async () => {
  const prev = await t.upload('/api/import/preview', bob.id, 'Connections.csv', fixture('Connections.csv'));
  assert.equal(prev.status, 200);
  assert.equal(prev.data.source, 'linkedin');
  assert.equal(prev.data.parsed, 4);
  assert.ok(prev.data.sample.length <= 10);
  for (const s of prev.data.sample) assert.ok(!('email' in s));
  assert.equal((await t.call('GET', '/api/network', { member: bob.id })).data.total, 0, 'preview does not write');

  const imp = await t.upload('/api/import', bob.id, 'Connections.csv', fixture('Connections.csv'));
  assert.equal(imp.status, 200);
  assert.deepEqual(
    { source: imp.data.source, parsed: imp.data.parsed, new_people: imp.data.new_people, new_connections: imp.data.new_connections, already_known: imp.data.already_known, skipped: imp.data.skipped },
    { source: 'linkedin', parsed: 4, new_people: 4, new_connections: 4, already_known: 0, skipped: 1 });
  assert.ok(Array.isArray(imp.data.warnings));

  const again = await t.upload('/api/import', bob.id, 'Connections.csv', fixture('Connections.csv'));
  assert.equal(again.data.new_connections, 0);
  assert.equal(again.data.already_known, 4);

  const net = await t.call('GET', '/api/network', { member: bob.id });
  assert.equal(net.data.total, 4);
  const item = net.data.items[0];
  assert.deepEqual(Object.keys(item).sort(), ['note', 'person', 'sources', 'strength']);
  assert.deepEqual(Object.keys(item.person).sort(),
    ['company', 'full_name', 'id', 'industries', 'job_function', 'linkedin_url', 'location', 'org_type', 'seniority', 'title']);
  assert.ok(Array.isArray(item.person.industries));
  assert.deepEqual(item.sources, ['linkedin']);
  assert.equal(item.strength, 'weak');

  const q = await t.call('GET', '/api/network?q=dental', { member: bob.id });
  assert.equal(q.data.total, 2);
  const paged = await t.call('GET', '/api/network?limit=1&offset=1', { member: bob.id });
  assert.equal(paged.data.items.length, 1);
  assert.equal(paged.data.total, 4);
  assert.equal((await t.call('GET', '/api/network?source=bogus', { member: bob.id })).status, 400);
  const me = await t.call('GET', '/api/me', { member: bob.id });
  assert.equal(me.data.stats.connections, 4);
  assert.deepEqual(me.data.stats.by_source, { linkedin: 4 });
});

test('import: other sources detected from upload, explicit source hint, bad input', async () => {
  const cases = [
    ['google_contacts_new.csv', 'google_contacts', 2],
    ['google_contacts_old.csv', 'google_contacts', 2],
    ['outlook_contacts.csv', 'outlook_contacts', 2],
    ['contacts.vcf', 'vcard', 3],
    ['calendar.ics', 'calendar', 3],
    ['roster.csv', 'roster', 2],
  ];
  for (const [file, source, parsed] of cases) {
    const r = await t.upload('/api/import/preview', alice.id, file, fixture(file));
    assert.equal(r.status, 200, file);
    assert.equal(r.data.source, source, file);
    assert.equal(r.data.parsed, parsed, file);
  }
  // mbox with the member's own address excluded via their member email
  const mbox = Buffer.from(fixture('mail.mbox').toString('utf8').replaceAll('owner@myco.example', 'alice@member.example'));
  const m = await t.upload('/api/import', alice.id, 'mail.mbox', mbox);
  assert.equal(m.data.source, 'email_headers');
  assert.equal(m.data.parsed, 3);
  assert.equal(m.data.new_connections, 3);

  const hinted = await t.upload('/api/import/preview', alice.id, 'whatever.txt', fixture('roster.txt'), { source: 'roster' });
  assert.equal(hinted.data.source, 'roster');
  assert.equal((await t.upload('/api/import/preview', alice.id, 'x.csv', fixture('roster.csv'), { source: 'nope' })).status, 400);
  assert.equal((await t.upload('/api/import', alice.id, 'image.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))).status, 422);
  const noFile = await t.call('POST', '/api/import', { member: alice.id, form: new FormData() });
  assert.equal(noFile.status, 400);
});

test('paste: preview and import', async () => {
  const text = fixture('roster.txt').toString('utf8');
  const prev = await t.call('POST', '/api/import/paste', { member: bob.id, json: { text, preview: true } });
  assert.equal(prev.status, 200);
  assert.equal(prev.data.source, 'roster');
  assert.equal(prev.data.parsed, 6);
  assert.ok(prev.data.sample.every((s) => !('email' in s)));
  const imp = await t.call('POST', '/api/import/paste', { member: bob.id, json: { text } });
  assert.equal(imp.data.new_connections, 6);
  assert.equal(imp.data.new_people, 6);
  assert.equal((await t.call('POST', '/api/import/paste', { member: bob.id, json: { text: '   ' } })).status, 400);
});

test('manual contact, network note, delete a source', async () => {
  const add = await t.call('POST', '/api/contacts', { member: bob.id, json: { full_name: 'Wilhelmina Starke', company: 'New England Impact Partners', title: 'Partner', note: 'Co-invested twice.' } });
  assert.equal(add.status, 201);
  assert.equal(add.data.created, true);
  assert.ok(add.data.person_id);
  const again = await t.call('POST', '/api/contacts', { member: bob.id, json: { full_name: 'Wilhelmina Starke', company: 'New England Impact Partners' } });
  assert.equal(again.data.created, false);
  assert.equal(again.data.person_id, add.data.person_id);
  assert.equal((await t.call('POST', '/api/contacts', { member: bob.id, json: { company: 'x' } })).status, 400);
  assert.equal((await t.call('POST', '/api/contacts', { member: bob.id, json: { full_name: 'A B', linkedin_url: 'https://evil.example/x' } })).status, 400);

  const net = await t.call('GET', '/api/network?source=manual', { member: bob.id });
  assert.equal(net.data.total, 1);
  assert.equal(net.data.items[0].strength, 'strong');
  assert.equal(net.data.items[0].note, 'Co-invested twice.');

  const before = (await t.call('GET', '/api/me', { member: bob.id })).data.stats.by_source.roster;
  const del = await t.call('DELETE', '/api/network/source/roster', { member: bob.id });
  assert.equal(del.data.removed, before);
  assert.equal((await t.call('GET', '/api/me', { member: bob.id })).data.stats.by_source.roster, undefined);
  assert.equal((await t.call('DELETE', '/api/network/source/bogus', { member: bob.id })).status, 400);
});

test('search, feedback, saved leads', async () => {
  assert.equal((await t.call('GET', '/api/search', { member: alice.id })).status, 400);
  assert.equal((await t.call('GET', '/api/search?q=x&mode=bad', { member: alice.id })).status, 400);
  const s = await t.call('GET', '/api/search?q=dental&mode=any&limit=5', { member: alice.id });
  assert.equal(s.status, 200);
  assert.equal(s.data.query, 'dental');
  assert.ok(Array.isArray(s.data.results));
  assert.ok(s.data.results.length <= 5);
  for (const r of s.data.results) {
    assert.ok(r.person && typeof r.score === 'number' && Array.isArray(r.reasons) && Array.isArray(r.known_by));
  }

  const pid = (await t.call('GET', '/api/network', { member: bob.id })).data.items[0].person.id;
  assert.equal((await t.call('POST', `/api/leads/${pid}/feedback`, { member: alice.id, json: { verdict: 'meh' } })).status, 400);
  assert.equal((await t.call('POST', '/api/leads/999999/feedback', { member: alice.id, json: { verdict: 'saved' } })).status, 404);
  assert.deepEqual((await t.call('POST', `/api/leads/${pid}/feedback`, { member: alice.id, json: { verdict: 'saved' } })).data, { ok: true });
  let saved = await t.call('GET', '/api/leads/saved', { member: alice.id });
  assert.equal(saved.data.results.length, 1);
  assert.equal(saved.data.results[0].person.id, pid);
  assert.equal(saved.data.results[0].known_by[0].member_id, bob.id);
  assert.deepEqual(Object.keys(saved.data.results[0].known_by[0]).sort(), ['member_id', 'name', 'note', 'role', 'sources', 'strength']);
  await t.call('POST', `/api/leads/${pid}/feedback`, { member: alice.id, json: { verdict: 'dismissed' } });
  saved = await t.call('GET', '/api/leads/saved', { member: alice.id });
  assert.equal(saved.data.results.length, 0);
  await t.call('POST', `/api/leads/${pid}/feedback`, { member: alice.id, json: { verdict: 'clear' } });
  assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM lead_feedback').get().n, 0);
});

test('intro requests: create, list, permissions, status changes', async () => {
  const pid = (await t.call('GET', '/api/network', { member: bob.id })).data.items[0].person.id;
  assert.equal((await t.call('POST', '/api/intros', { member: alice.id, json: { person_id: pid, introducer_id: alice.id } })).status, 400);
  assert.equal((await t.call('POST', '/api/intros', { member: alice.id, json: { person_id: 999999, introducer_id: bob.id } })).status, 404);
  const otherPerson = (await t.call('GET', '/api/network', { member: alice.id })).data.items
    .find((i) => !t.db.prepare('SELECT 1 FROM connections WHERE member_id = ? AND person_id = ?').get(bob.id, i.person.id));
  if (otherPerson) {
    assert.equal((await t.call('POST', '/api/intros', { member: bob.id, json: { person_id: otherPerson.person.id, introducer_id: bob.id + 1000 } })).status, 404);
  }
  const created = await t.call('POST', '/api/intros', { member: alice.id, json: { person_id: pid, introducer_id: bob.id, message: 'Could you introduce me?' } });
  assert.equal(created.status, 201);
  assert.equal(created.data.status, 'pending');
  assert.equal(created.data.person.id, pid);
  assert.equal(created.data.requester.id, alice.id);
  assert.equal(created.data.introducer.id, bob.id);
  assert.equal((await t.call('POST', '/api/intros', { member: alice.id, json: { person_id: pid, introducer_id: bob.id } })).status, 409);

  const mine = await t.call('GET', '/api/intros', { member: alice.id });
  assert.equal(mine.data.outgoing.length, 1);
  assert.equal(mine.data.incoming.length, 0);
  const theirs = await t.call('GET', '/api/intros', { member: bob.id });
  assert.equal(theirs.data.incoming.length, 1);
  assert.equal(theirs.data.incoming[0].requester.name, 'Alice Founder');

  const id = created.data.id;
  assert.equal((await t.call('PATCH', `/api/intros/${id}`, { member: alice.id, json: { status: 'accepted' } })).status, 403);
  assert.equal((await t.call('PATCH', `/api/intros/${id}`, { member: bob.id, json: { status: 'weird' } })).status, 400);
  const carol = (await t.call('POST', '/api/members', { json: { name: 'Carol Staff', role: 'staff' } })).data;
  assert.equal((await t.call('PATCH', `/api/intros/${id}`, { member: carol.id, json: { status: 'accepted' } })).status, 404);
  const acc = await t.call('PATCH', `/api/intros/${id}`, { member: bob.id, json: { status: 'accepted' } });
  assert.equal(acc.data.status, 'accepted');
  const done = await t.call('PATCH', `/api/intros/${id}`, { member: alice.id, json: { status: 'done' } });
  assert.equal(done.data.status, 'done');
});

test('malformed JSON body gives a 400 with an error message', async () => {
  const res = await fetch(`${t.base}/api/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).error);
});

// Accounts (sign-up, sign-in, sessions), profiles and saved searches. Demo header auth is OFF here.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../fixtures/helpers.js';

let t; let cookie;
const PW = 'correct-horse-9';

before(async () => { t = await startTestServer({ label: 'accounts', demoAuth: false }); });
after(async () => { await t.close(); });

test('without a session, member routes answer 401 and the demo header is ignored', async () => {
  assert.equal((await t.call('GET', '/api/me')).status, 401);
  assert.equal((await t.call('GET', '/api/me', { member: 1 })).status, 401);
  assert.equal((await t.call('GET', '/api/members')).status, 401);
  assert.equal((await t.call('POST', '/api/members', { json: { name: 'Sneak' } })).status, 403);
});

test('sign-up validates input, creates a session cookie, and never returns the email or hash', async () => {
  assert.equal((await t.call('POST', '/api/auth/signup', { json: { name: 'A', email: 'nope', password: PW } })).status, 400);
  assert.equal((await t.call('POST', '/api/auth/signup', { json: { name: 'A', email: 'a@member.example', password: 'short' } })).status, 400);
  const res = await t.call('POST', '/api/auth/signup', { json: { name: 'Ada Founder', email: 'Ada@Member.example', password: PW, org: 'Adaco', role: 'founder' } });
  assert.equal(res.status, 201);
  assert.equal(res.data.member.name, 'Ada Founder');
  assert.ok(!/member\.example|scrypt/.test(res.text));
  assert.match(res.setCookie[0], /hub_session=.+HttpOnly/);
  assert.match(res.setCookie[0], /SameSite=Lax/);
  cookie = res.cookie;
  const me = await t.call('GET', '/api/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.member.name, 'Ada Founder');
  assert.equal(me.data.has_password, true);
  assert.equal((await t.call('POST', '/api/auth/signup', { json: { name: 'Ada 2', email: 'ada@member.example', password: PW } })).status, 409);
  const stored = t.db.prepare('SELECT password_hash FROM members WHERE email = ?').get('ada@member.example').password_hash;
  assert.match(stored, /^scrypt\$/);
  assert.ok(!stored.includes(PW));
});

test('sign-in checks the password; sign-out ends the session', async () => {
  assert.equal((await t.call('POST', '/api/auth/login', { json: { email: 'ada@member.example', password: 'wrong-password' } })).status, 401);
  assert.equal((await t.call('POST', '/api/auth/login', { json: { email: 'nobody@member.example', password: PW } })).status, 401);
  const ok = await t.call('POST', '/api/auth/login', { json: { email: 'ada@member.example', password: PW } });
  assert.equal(ok.status, 200);
  assert.equal((await t.call('GET', '/api/me', { cookie: ok.cookie })).status, 200);
  assert.equal((await t.call('POST', '/api/auth/logout', { cookie: ok.cookie })).status, 200);
  assert.equal((await t.call('GET', '/api/me', { cookie: ok.cookie })).status, 401);
  assert.equal((await t.call('GET', '/api/me', { cookie })).status, 200, 'other sessions stay valid');
});

test('a member without a password claims the account by signing up with the email on file', async () => {
  t.db.prepare(`INSERT INTO members (name, email, org, role) VALUES ('Old Member', 'old@member.example', 'Oldco', 'board')`).run();
  const res = await t.call('POST', '/api/auth/signup', { json: { email: 'old@member.example', password: PW } });
  assert.equal(res.status, 201);
  assert.equal(res.data.claimed, true);
  assert.equal(res.data.member.name, 'Old Member');
  assert.equal(res.data.member.role, 'board');
});

test('change password needs the current one and signs out other sessions', async () => {
  const other = await t.call('POST', '/api/auth/login', { json: { email: 'ada@member.example', password: PW } });
  assert.equal((await t.call('POST', '/api/auth/password', { cookie, json: { current: 'bad', next: 'new-password-1' } })).status, 403);
  assert.equal((await t.call('POST', '/api/auth/password', { cookie, json: { current: PW, next: 'new-password-1' } })).status, 200);
  assert.equal((await t.call('GET', '/api/me', { cookie: other.cookie })).status, 401);
  assert.equal((await t.call('POST', '/api/auth/login', { json: { email: 'ada@member.example', password: 'new-password-1' } })).status, 200);
});

test('repeated failed sign-ins are throttled', async () => {
  let last;
  for (let i = 0; i < 11; i++) last = await t.call('POST', '/api/auth/login', { json: { email: 'throttle@member.example', password: 'x' } });
  assert.equal(last.status, 429);
});

test('profile: edit own profile, view another member, reject bad links', async () => {
  const up = await t.call('PATCH', '/api/me', { cookie, json: { headline: 'Founder at Adaco', bio: 'Hello.', location: 'Keene, NH', linkedin_url: 'linkedin.com/in/ada-founder-1234567890', website_url: 'https://adaco.example' } });
  assert.equal(up.status, 200);
  assert.equal(up.data.member.headline, 'Founder at Adaco');
  assert.equal(up.data.member.linkedin_url, 'https://linkedin.com/in/ada-founder-1234567890', 'digits in a link are not scrubbed as a phone number');
  assert.equal((await t.call('PATCH', '/api/me', { cookie, json: { website_url: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await t.call('PATCH', '/api/me', { cookie, json: { linkedin_url: 'https://example.com/in/ada' } })).status, 400);
  assert.equal((await t.call('PATCH', '/api/me', { cookie, json: { name: '' } })).status, 400);
  const id = up.data.member.id;
  const view = await t.call('GET', `/api/members/${id}`, { cookie });
  assert.equal(view.status, 200);
  assert.equal(view.data.member.bio, 'Hello.');
  assert.deepEqual(Object.keys(view.data.stats).sort(), ['comments', 'connections', 'intros_made', 'posts']);
  assert.ok(!/member\.example/.test(view.text));
  assert.equal((await t.call('GET', '/api/members/9999', { cookie })).status, 404);
});

test('searches: history is recorded, searches can be saved and removed, and stay private', async () => {
  await t.call('GET', '/api/search?q=dental%20association', { cookie });
  await t.call('GET', '/api/search?q=dental%20association', { cookie });
  await t.call('GET', '/api/search?q=fractional%20CFO&mode=talent', { cookie });
  let s = (await t.call('GET', '/api/searches', { cookie })).data;
  assert.deepEqual(s.recent.map((x) => x.query), ['fractional CFO', 'dental association']);
  const saved = await t.call('POST', '/api/searches', { cookie, json: { query: 'dental association', mode: 'leads' } });
  assert.equal(saved.status, 201);
  assert.equal((await t.call('POST', '/api/searches', { cookie, json: { query: 'Dental Association', mode: 'leads' } })).data.id, saved.data.id);
  assert.equal((await t.call('POST', '/api/searches', { cookie, json: { query: '', mode: 'leads' } })).status, 400);
  const other = await t.call('POST', '/api/auth/signup', { json: { name: 'Ben Other', email: 'ben@member.example', password: PW } });
  assert.deepEqual((await t.call('GET', '/api/searches', { cookie: other.cookie })).data, { saved: [], recent: [] });
  assert.equal((await t.call('DELETE', `/api/searches/${saved.data.id}`, { cookie: other.cookie })).status, 404);
  assert.equal((await t.call('DELETE', `/api/searches/${saved.data.id}`, { cookie })).status, 200);
  assert.equal((await t.call('DELETE', '/api/searches/history', { cookie })).data.removed, 2);
  s = (await t.call('GET', '/api/searches', { cookie })).data;
  assert.deepEqual(s, { saved: [], recent: [] });
});

// Forum and jobs board.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../fixtures/helpers.js';

let t; let a; let b; let staff;

before(async () => {
  t = await startTestServer({ label: 'community' });
  a = (await t.call('POST', '/api/members', { json: { name: 'Ann Author', role: 'founder', org: 'Annco' } })).data.id;
  b = (await t.call('POST', '/api/members', { json: { name: 'Bo Reader', role: 'mentor' } })).data.id;
  staff = (await t.call('POST', '/api/members', { json: { name: 'Sal Staff', role: 'staff' } })).data.id;
});
after(async () => { await t.close(); });

test('forum: needs sign-in; post validation', async () => {
  assert.equal((await t.call('GET', '/api/forum/posts')).status, 401);
  assert.equal((await t.call('POST', '/api/forum/posts', { member: a, json: { title: 'Hi', body: 'x' } })).status, 400);
  assert.equal((await t.call('POST', '/api/forum/posts', { member: a, json: { title: 'A good title', category: 'nope' } })).status, 400);
  assert.equal((await t.call('GET', '/api/forum/categories')).data.length, 8);
});

test('forum: post, list, filter, vote, threaded comments, permissions', async () => {
  const p1 = await t.call('POST', '/api/forum/posts', { member: a, json: { title: 'How do I price a pilot?', body: 'Details here. Write to ann@member.example.', category: 'sales' } });
  assert.equal(p1.status, 201);
  assert.equal(p1.data.score, 1);
  assert.equal(p1.data.my_vote, true);
  assert.equal(p1.data.author.name, 'Ann Author');
  assert.ok(!p1.text.includes('ann@member.example'), 'emails in post bodies are hidden');
  const p2 = (await t.call('POST', '/api/forum/posts', { member: b, json: { title: 'Looking for a CFO', category: 'hiring' } })).data;

  let list = (await t.call('GET', '/api/forum/posts?sort=new', { member: b })).data;
  assert.deepEqual(list.items.map((x) => x.id), [p2.id, p1.data.id]);
  assert.equal(list.items[1].mine, false);
  assert.equal(list.category_counts.sales, 1);
  assert.equal((await t.call('GET', '/api/forum/posts?category=hiring', { member: b })).data.total, 1);
  assert.equal((await t.call('GET', '/api/forum/posts?q=pilot', { member: b })).data.items[0].id, p1.data.id);
  assert.equal((await t.call('GET', `/api/forum/posts?author=${a}`, { member: b })).data.total, 1);

  const v = await t.call('POST', '/api/forum/vote', { member: b, json: { target_type: 'post', target_id: p1.data.id, value: 1 } });
  assert.deepEqual(v.data, { score: 2, my_vote: true });
  await t.call('POST', '/api/forum/vote', { member: b, json: { target_type: 'post', target_id: p1.data.id, value: 1 } });
  list = (await t.call('GET', '/api/forum/posts?sort=top', { member: b })).data;
  assert.equal(list.items[0].id, p1.data.id);
  assert.equal(list.items[0].score, 2, 'a second upvote from the same member does not count');
  assert.equal((await t.call('POST', '/api/forum/vote', { member: b, json: { target_type: 'post', target_id: p1.data.id, value: 0 } })).data.score, 1);
  assert.equal((await t.call('POST', '/api/forum/vote', { member: b, json: { target_type: 'post', target_id: 999, value: 1 } })).status, 404);

  const c1 = await t.call('POST', `/api/forum/posts/${p1.data.id}/comments`, { member: b, json: { body: 'Charge something, even a little.' } });
  assert.equal(c1.status, 201);
  const c2 = await t.call('POST', `/api/forum/posts/${p1.data.id}/comments`, { member: a, json: { body: 'Thanks.', parent_id: c1.data.id } });
  assert.equal(c2.data.parent_id, c1.data.id);
  assert.equal((await t.call('POST', `/api/forum/posts/${p2.id}/comments`, { member: a, json: { body: 'x', parent_id: c1.data.id } })).status, 400);
  assert.equal((await t.call('POST', `/api/forum/posts/${p1.data.id}/comments`, { member: a, json: { body: '  ' } })).status, 400);

  let thread = (await t.call('GET', `/api/forum/posts/${p1.data.id}`, { member: a })).data;
  assert.equal(thread.post.comment_count, 2);
  assert.equal(thread.post.mine, true);
  assert.equal(thread.comments.length, 2);

  assert.equal((await t.call('DELETE', `/api/forum/comments/${c1.data.id}`, { member: a })).status, 403);
  assert.equal((await t.call('DELETE', `/api/forum/comments/${c1.data.id}`, { member: b })).status, 200);
  thread = (await t.call('GET', `/api/forum/posts/${p1.data.id}`, { member: a })).data;
  assert.equal(thread.comments[0].deleted, true);
  assert.equal(thread.comments[0].body, null);
  assert.equal(thread.comments[1].body, 'Thanks.', 'replies to a deleted comment stay');

  assert.equal((await t.call('PATCH', `/api/forum/posts/${p1.data.id}`, { member: b, json: { title: 'Hijack title' } })).status, 403);
  assert.equal((await t.call('PATCH', `/api/forum/posts/${p1.data.id}`, { member: a, json: { title: 'How do I price a first pilot?' } })).data.title, 'How do I price a first pilot?');
  assert.equal((await t.call('DELETE', `/api/forum/posts/${p1.data.id}`, { member: b })).status, 403);
  assert.equal((await t.call('DELETE', `/api/forum/posts/${p2.id}`, { member: staff })).status, 200, 'staff can moderate');
  assert.equal((await t.call('DELETE', `/api/forum/posts/${p1.data.id}`, { member: a })).status, 200);
  assert.equal((await t.call('GET', '/api/forum/posts', { member: a })).data.total, 0);
  assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM forum_votes').get().n, 0);
});

const JOB = {
  title: 'Account Executive', company: 'Annco', location: 'Keene, NH', workplace: 'hybrid', employment_type: 'full_time',
  job_function: 'sales', salary_min: '70,000', salary_max: 95000, equity: '0.25%',
  description: 'Own the full sales cycle with independent dental offices in New England.',
  apply_url: 'https://jobs.annco.example/postings/4012345678',
};

test('jobs: validation', async () => {
  assert.equal((await t.call('GET', '/api/jobs')).status, 401);
  for (const bad of [{ title: '' }, { company: '' }, { description: 'too short' }, { apply_url: '' }, { apply_url: 'javascript:alert(1)' },
    { apply_url: 'mailto:jobs@annco.example' }, { workplace: 'moon' }, { salary_min: 90000, salary_max: 50000 }, { salary_min: 'lots' }]) {
    assert.equal((await t.call('POST', '/api/jobs', { member: a, json: { ...JOB, ...bad } })).status, 400, JSON.stringify(bad));
  }
});

test('jobs: post, browse, filter, save, edit, close, delete', async () => {
  const j = await t.call('POST', '/api/jobs', { member: a, json: JOB });
  assert.equal(j.status, 201);
  assert.equal(j.data.apply_url, JOB.apply_url, 'the posting id in the link survives the privacy scrubber');
  assert.equal(j.data.salary_min, 70000);
  assert.equal(j.data.poster.name, 'Ann Author');
  const j2 = (await t.call('POST', '/api/jobs', { member: b, json: { ...JOB, title: 'Hardware Engineer', company: 'Boco', job_function: 'engineering', workplace: 'remote', apply_url: 'boco.example/careers' } })).data;
  assert.equal(j2.apply_url, 'https://boco.example/careers');

  let list = (await t.call('GET', '/api/jobs', { member: b })).data;
  assert.equal(list.total, 2);
  assert.equal(list.open_companies, 2);
  assert.equal(list.items[0].description, undefined);
  assert.equal((await t.call('GET', '/api/jobs?job_function=engineering', { member: b })).data.total, 1);
  assert.equal((await t.call('GET', '/api/jobs?workplace=remote&q=hardware%20boco', { member: b })).data.total, 1);
  assert.equal((await t.call('GET', '/api/jobs?q=nomatch', { member: b })).data.total, 0);
  assert.equal((await t.call('GET', '/api/jobs?workplace=moon', { member: b })).status, 400);

  assert.equal((await t.call('POST', `/api/jobs/${j.data.id}/save`, { member: b, json: {} })).data.saved, true);
  list = (await t.call('GET', '/api/jobs?saved=1', { member: b })).data;
  assert.deepEqual(list.items.map((x) => x.id), [j.data.id]);
  assert.equal((await t.call('GET', '/api/jobs?saved=1', { member: a })).data.total, 0);
  assert.equal((await t.call('POST', `/api/jobs/${j.data.id}/save`, { member: b, json: { saved: false } })).data.saved, false);

  assert.equal((await t.call('PATCH', `/api/jobs/${j.data.id}`, { member: b, json: { title: 'Mine now' } })).status, 403);
  const closed = await t.call('PATCH', `/api/jobs/${j.data.id}`, { member: a, json: { status: 'closed', title: 'Senior Account Executive' } });
  assert.equal(closed.data.status, 'closed');
  assert.equal(closed.data.title, 'Senior Account Executive');
  assert.equal(closed.data.company, 'Annco', 'fields that are not sent keep their value');
  assert.equal((await t.call('GET', '/api/jobs', { member: b })).data.total, 1, 'closed jobs leave the board');
  assert.equal((await t.call('GET', '/api/jobs?mine=1', { member: a })).data.total, 1, 'the poster still sees it');
  assert.equal((await t.call('GET', `/api/jobs/${j.data.id}`, { member: b })).data.description, JOB.description);

  assert.equal((await t.call('DELETE', `/api/jobs/${j.data.id}`, { member: b })).status, 403);
  assert.equal((await t.call('DELETE', `/api/jobs/${j.data.id}`, { member: a })).status, 200);
  assert.equal((await t.call('GET', `/api/jobs/${j.data.id}`, { member: a })).status, 404);
});

test('seed: demo members can sign in; forum and jobs have content', async () => {
  const s = await startTestServer({ seed: true, label: 'community-seed', demoAuth: false });
  try {
    const { DEMO_PASSWORD } = await import('../../server/seed/data.js');
    const login = await s.call('POST', '/api/auth/login', { json: { email: 'dana@brightchair.example', password: DEMO_PASSWORD } });
    assert.equal(login.status, 200);
    const posts = (await s.call('GET', '/api/forum/posts', { cookie: login.cookie })).data;
    assert.ok(posts.total >= 6);
    const jobs = (await s.call('GET', '/api/jobs', { cookie: login.cookie })).data;
    assert.ok(jobs.total >= 8);
    assert.ok(jobs.items.some((x) => /\/jobs\/4012345678$/.test(x.apply_url)));
    assert.equal((await s.call('GET', '/api/searches', { cookie: login.cookie })).data.saved.length, 2);
  } finally { await s.close(); process.env.HUB_DEMO_AUTH = '1'; }
});

// Forum: a members-only board. Routes: #/forum, #/forum/new, #/forum/<id>, #/forum/<id>/edit.
import { h, replace, nextId, plural, timeAgo, richText } from '../dom.js';
import { api, qs } from '../api.js';
import { toast } from '../store.js';
import { loading, errorBox, emptyState, memberLink, avatar, confirmDialog } from '../components.js';

export const CATEGORIES = [
  { id: 'help', label: 'Ask for help' },
  { id: 'advice', label: 'Advice' },
  { id: 'fundraising', label: 'Fundraising' },
  { id: 'sales', label: 'Customers and sales' },
  { id: 'hiring', label: 'Hiring' },
  { id: 'product', label: 'Product and tech' },
  { id: 'wins', label: 'Wins' },
  { id: 'general', label: 'General' },
];
export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;
const SORTS = [{ id: 'hot', label: 'Active' }, { id: 'new', label: 'Newest' }, { id: 'top', label: 'Most upvoted' }];

/** Upvote control shared by posts and comments. */
function voteButton(type, item) {
  const count = h('span', { class: 'vote-count' }, String(item.score));
  const btn = h('button', {
    type: 'button', class: 'vote', 'aria-pressed': item.my_vote ? 'true' : 'false',
    'aria-label': `Upvote. ${item.score} so far.`,
    onclick: async (e) => {
      e.preventDefault(); e.stopPropagation();
      btn.disabled = true;
      try {
        const res = await api('/forum/vote', { method: 'POST', body: { target_type: type, target_id: item.id, value: item.my_vote ? 0 : 1 } });
        item.score = res.score; item.my_vote = res.my_vote;
        count.textContent = String(res.score);
        btn.setAttribute('aria-pressed', res.my_vote ? 'true' : 'false');
        btn.setAttribute('aria-label', `Upvote. ${res.score} so far.`);
      } catch (err) { toast(err.message, { error: true }); }
      btn.disabled = false;
    },
  }, h('span', { class: 'vote-arrow', 'aria-hidden': 'true' }, '▲'), count);
  return btn;
}

export async function renderForum(ctx) {
  const sub = ctx.parts[1];
  if (sub === 'new') return renderEditor(ctx, null);
  if (sub && /^\d+$/.test(sub)) return ctx.parts[2] === 'edit' ? renderEditor(ctx, Number(sub)) : renderThread(ctx, Number(sub));
  return renderList(ctx);
}

// ---------- List ----------
async function renderList(ctx) {
  const { root, params } = ctx;
  const sort = SORTS.some((s) => s.id === params.get('sort')) ? params.get('sort') : 'hot';
  const category = CATEGORIES.some((c) => c.id === params.get('category')) ? params.get('category') : '';
  const q = (params.get('q') || '').trim();
  const go = (over) => ctx.navigate(`#/forum${qs({ sort: sort === 'hot' ? null : sort, category, q, ...over })}`);

  const searchId = nextId('fq');
  const searchForm = h('form', { class: 'inline-search', role: 'search' },
    h('label', { for: searchId, class: 'visually-hidden' }, 'Search the forum'),
    h('input', { id: searchId, type: 'search', value: q, placeholder: 'Search posts', maxlength: 200 }),
    h('button', { type: 'submit', class: 'btn btn-sm' }, 'Search'));
  searchForm.addEventListener('submit', (e) => { e.preventDefault(); go({ q: searchForm.querySelector('input').value.trim() }); });

  const sideSlot = h('ul', { class: 'side-list' });
  const listSlot = h('div', null, loading('Loading posts…'));
  root.append(
    h('div', { class: 'page-head' },
      h('div', null,
        h('p', { class: 'kicker' }, 'Forum'),
        h('h1', null, 'Ask the network'),
        h('p', null, 'Questions, advice and wins from members. Only members can read this board.')),
      h('a', { class: 'btn btn-primary', href: '#/forum/new' }, 'New post')),
    h('div', { class: 'with-side' },
      h('aside', { class: 'side', 'aria-label': 'Topics' },
        h('h2', { class: 'side-title' }, 'Topics'),
        sideSlot,
        searchForm),
      h('div', { class: 'side-main' },
        h('div', { class: 'list-tools' },
          h('div', { class: 'sort-tabs', role: 'group', 'aria-label': 'Sort posts' },
            SORTS.map((s) => h('a', { href: `#/forum${qs({ sort: s.id === 'hot' ? null : s.id, category, q })}`, 'aria-current': s.id === sort ? 'true' : null }, s.label))),
          h('span', { class: 'list-count muted small', role: 'status' })),
        listSlot)));

  let data;
  try {
    data = await api(`/forum/posts${qs({ sort, category, q, limit: 100 })}`);
  } catch (err) {
    if (ctx.isCurrent()) replace(listSlot, errorBox(err, () => ctx.rerender()));
    return;
  }
  if (!ctx.isCurrent()) return;

  const total = Object.values(data.category_counts || {}).reduce((a, b) => a + b, 0);
  const topic = (id, label, n) => h('li', null, h('a', { href: `#/forum${qs({ sort: sort === 'hot' ? null : sort, category: id })}`, 'aria-current': (category || '') === id ? 'true' : null },
    h('span', null, label), h('span', { class: 'count' }, String(n))));
  replace(sideSlot, topic('', 'All topics', total), CATEGORIES.map((c) => topic(c.id, c.label, data.category_counts?.[c.id] || 0)));
  root.querySelector('.list-count').textContent = `${plural(data.total, 'post')}${q ? ` matching “${q}”` : ''}${category ? ` in ${categoryLabel(category)}` : ''}`;

  if (!data.items.length) {
    replace(listSlot, emptyState(q || category ? 'No posts match' : 'No posts yet',
      q || category ? 'Try another topic or a broader search.' : 'Start the first conversation. Ask a question you are stuck on.',
      h('a', { class: 'btn btn-primary', href: '#/forum/new' }, 'Write a post')));
    return;
  }
  replace(listSlot, h('ol', { class: 'post-list' }, data.items.map((p) => h('li', { class: 'post-row' },
    voteButton('post', p),
    h('div', { class: 'post-row-main' },
      h('h2', { class: 'post-title' }, h('a', { href: `#/forum/${p.id}` }, p.title)),
      p.excerpt ? h('p', { class: 'post-excerpt' }, p.excerpt) : null,
      h('p', { class: 'meta' },
        h('a', { class: 'tag', href: `#/forum${qs({ category: p.category })}` }, categoryLabel(p.category)),
        memberLink(p.author),
        h('span', null, timeAgo(p.created_at)),
        h('a', { href: `#/forum/${p.id}`, class: 'meta-replies' }, plural(p.comment_count, 'reply', 'replies'))))))));
}

// ---------- Thread ----------
async function renderThread(ctx, id) {
  const { root } = ctx;
  root.append(loading('Loading post…'));
  let data;
  try { data = await api(`/forum/posts/${id}`); } catch (err) {
    if (!ctx.isCurrent()) return;
    replace(root, h('p', null, h('a', { class: 'back-link', href: '#/forum' }, '← Forum')),
      err.status === 404 ? emptyState('This post is gone', 'The author or CORI staff removed it.', h('a', { class: 'btn', href: '#/forum' }, 'Back to the forum')) : errorBox(err, () => ctx.rerender()));
    return;
  }
  if (!ctx.isCurrent()) return;
  const { post } = data;
  const comments = data.comments;
  ctx.setTitle(post.title);

  const threadSlot = h('div', { class: 'thread' });
  const countEl = h('h2', { class: 'thread-count' });

  const replyForm = (parentId, onDone, { autofocus = false } = {}) => {
    const taId = nextId('reply');
    const ta = h('textarea', { id: taId, rows: parentId ? 3 : 4, maxlength: 6000, required: true, placeholder: parentId ? 'Write a reply' : 'Add your answer or a follow-up question' });
    const send = h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, parentId ? 'Reply' : 'Post reply');
    const form = h('form', { class: 'reply-form' },
      h('label', { for: taId, class: parentId ? 'visually-hidden' : null }, parentId ? 'Your reply' : 'Your reply'),
      ta,
      h('div', { class: 'row' }, send,
        parentId ? h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onclick: () => onDone(null) }, 'Cancel') : null));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = ta.value.trim();
      if (!body) { ta.focus(); return; }
      send.disabled = true;
      try {
        const c = await api(`/forum/posts/${id}/comments`, { method: 'POST', body: { body, parent_id: parentId || undefined } });
        ta.value = '';
        onDone(c);
      } catch (err) { toast(err.message, { error: true }); }
      send.disabled = false;
    });
    if (autofocus) setTimeout(() => ta.focus(), 0);
    return form;
  };

  const drawThread = (focusId) => {
    const live = comments.filter((c) => !c.deleted).length;
    countEl.textContent = plural(live, 'reply', 'replies');
    const kids = new Map();
    for (const c of comments) {
      const k = c.parent_id || 0;
      if (!kids.has(k)) kids.set(k, []);
      kids.get(k).push(c);
    }
    const hasLive = (c) => !c.deleted || (kids.get(c.id) || []).some(hasLive);
    const node = (c) => {
      const replySlot = h('div');
      const el = h('li', { class: `comment${c.deleted ? ' comment--deleted' : ''}`, id: `c${c.id}`, tabindex: '-1' },
        c.deleted
          ? h('p', { class: 'muted small' }, 'This reply was removed.')
          : [
            h('div', { class: 'comment-head' }, avatar(c.author?.name, 'sm'), memberLink(c.author), h('span', { class: 'muted small' }, timeAgo(c.created_at))),
            richText(c.body),
            h('div', { class: 'comment-actions' },
              voteButton('comment', c),
              h('button', {
                type: 'button', class: 'link-btn',
                onclick: () => {
                  if (replySlot.firstChild) { replace(replySlot); return; }
                  replace(replySlot, replyForm(c.id, (created) => { replace(replySlot); if (created) { comments.push(created); drawThread(created.id); } }, { autofocus: true }));
                },
              }, 'Reply'),
              c.mine ? h('button', {
                type: 'button', class: 'link-btn link-danger',
                onclick: async () => {
                  if (!await confirmDialog({ title: 'Delete your reply?', message: 'Replies under it stay in the thread.', confirmLabel: 'Delete', danger: true })) return;
                  try { await api(`/forum/comments/${c.id}`, { method: 'DELETE' }); c.deleted = true; c.body = null; c.mine = false; drawThread(); } catch (err) { toast(err.message, { error: true }); }
                },
              }, 'Delete') : null),
          ],
        replySlot,
        (kids.get(c.id) || []).filter(hasLive).length ? h('ol', { class: 'comment-kids' }, (kids.get(c.id) || []).filter(hasLive).map(node)) : null);
      return el;
    };
    const top = (kids.get(0) || []).filter(hasLive);
    replace(threadSlot, top.length ? h('ol', { class: 'comments' }, top.map(node)) : h('p', { class: 'muted' }, 'No replies yet. Be the first to answer.'));
    if (focusId) document.getElementById(`c${focusId}`)?.focus();
  };

  const ownerActions = post.mine ? h('span', { class: 'owner-actions' },
    h('a', { class: 'link-btn', href: `#/forum/${id}/edit` }, 'Edit'),
    h('button', {
      type: 'button', class: 'link-btn link-danger',
      onclick: async () => {
        if (!await confirmDialog({ title: 'Delete this post?', message: 'The post and all its replies are removed. This cannot be undone.', confirmLabel: 'Delete post', danger: true })) return;
        try { await api(`/forum/posts/${id}`, { method: 'DELETE' }); toast('Post deleted.'); ctx.navigate('#/forum'); } catch (err) { toast(err.message, { error: true }); }
      },
    }, 'Delete')) : null;

  replace(root,
    h('p', null, h('a', { class: 'back-link', href: '#/forum' }, '← Forum')),
    h('article', { class: 'post-full' },
      h('div', { class: 'post-full-vote' }, voteButton('post', post)),
      h('div', { class: 'post-full-main' },
        h('p', { class: 'meta' }, h('a', { class: 'tag', href: `#/forum${qs({ category: post.category })}` }, categoryLabel(post.category))),
        h('h1', null, post.title),
        h('p', { class: 'meta' }, avatar(post.author?.name, 'sm'), memberLink(post.author), h('span', null, timeAgo(post.created_at)),
          post.updated_at ? h('span', null, 'edited') : null, ownerActions),
        post.body ? richText(post.body) : null)),
    h('section', { class: 'thread-wrap', 'aria-label': 'Replies' },
      countEl,
      replyForm(null, (created) => { if (created) { comments.push(created); drawThread(created.id); toast('Reply posted.'); } }),
      threadSlot));
  drawThread();
}

// ---------- New / edit ----------
async function renderEditor(ctx, id) {
  const { root } = ctx;
  let post = null;
  if (id) {
    try { post = (await api(`/forum/posts/${id}`)).post; } catch (err) { replace(root, errorBox(err, () => ctx.rerender())); return; }
    if (!ctx.isCurrent()) return;
    if (!post.mine) { ctx.navigate(`#/forum/${id}`, { replace: true }); return; }
  }
  const ids = { t: nextId('t'), b: nextId('b'), c: nextId('c') };
  const errorSlot = h('div');
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, id ? 'Save changes' : 'Post to the forum');
  const title = h('input', { id: ids.t, type: 'text', required: true, maxlength: 200, value: post?.title || '', placeholder: 'e.g. How do you price a first pilot with a hospital?' });
  const body = h('textarea', { id: ids.b, rows: 10, maxlength: 10000, placeholder: 'What are you trying to do? What did you already try?' });
  body.value = post?.body || '';
  const cat = h('select', { id: ids.c }, CATEGORIES.map((c) => h('option', { value: c.id, selected: (post?.category || 'help') === c.id }, c.label)));
  const form = h('form', { class: 'form-narrow' },
    h('div', { class: 'field' }, h('label', { for: ids.t }, 'Title'), h('span', { class: 'hint' }, 'Put the question or the ask in the title.'), title),
    h('div', { class: 'field' }, h('label', { for: ids.c }, 'Topic'), cat),
    h('div', { class: 'field' }, h('label', { for: ids.b }, 'Details', h('span', { class: 'hint' }, ' (optional)')),
      body, h('span', { class: 'hint' }, 'Blank lines make paragraphs. Lines that start with "-" make a list. Email addresses and phone numbers are hidden.')),
    errorSlot,
    h('div', { class: 'row' }, submit, h('a', { class: 'btn btn-quiet', href: id ? `#/forum/${id}` : '#/forum' }, 'Cancel')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { title: title.value.trim(), body: body.value.trim(), category: cat.value };
    if (payload.title.length < 4) { replace(errorSlot, h('div', { class: 'alert alert-error', role: 'alert' }, 'Give your post a title of at least 4 characters.')); title.focus(); return; }
    submit.disabled = true;
    try {
      const saved = await api(id ? `/forum/posts/${id}` : '/forum/posts', { method: id ? 'PATCH' : 'POST', body: payload });
      toast(id ? 'Post updated.' : 'Posted.');
      ctx.navigate(`#/forum/${saved.id}`);
    } catch (err) {
      replace(errorSlot, h('div', { class: 'alert alert-error', role: 'alert' }, err.message));
      submit.disabled = false;
    }
  });
  replace(root,
    h('p', null, h('a', { class: 'back-link', href: id ? `#/forum/${id}` : '#/forum' }, id ? '← Back to the post' : '← Forum')),
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'Forum'),
      h('h1', null, id ? 'Edit your post' : 'New post'),
      h('p', null, 'Every member can read and answer. Do not post confidential customer or investor details.'))),
    form);
}

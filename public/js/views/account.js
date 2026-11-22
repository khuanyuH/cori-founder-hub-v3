// Account: your member profile, your saved and recent searches, and your password.
import { h, replace, nextId, timeAgo } from '../dom.js';
import { api, qs } from '../api.js';
import { state, toast } from '../store.js';
import { loading, errorBox, roleLabel, avatar } from '../components.js';

const ROLES = ['founder', 'board', 'staff', 'mentor', 'investor'];
const MODE_LABEL = { leads: 'Leads', talent: 'Talent', any: 'Anyone' };
export const searchHref = (s) => `#/${s.mode === 'talent' ? 'talent' : 'search'}${qs({ q: s.query, mode: s.mode === 'any' ? 'any' : null })}`;

export async function renderAccount(ctx) {
  const { root } = ctx;
  const m = state.me.member;
  const searchSlot = h('div', null, loading('Loading your searches…'));

  root.append(
    h('div', { class: 'page-head' },
      h('div', { class: 'profile-head' }, avatar(m.name, 'xl'),
        h('div', null, h('p', { class: 'kicker' }, 'Account'), h('h1', null, m.name),
          h('p', null, [roleLabel(m.role), m.org].filter(Boolean).join(' · ')))),
      h('a', { class: 'btn', href: `#/members/${m.id}` }, 'View public profile')),
    h('div', { class: 'split' },
      h('div', { class: 'stack' }, profileForm(ctx), passwordForm()),
      h('section', { 'aria-labelledby': 'searches-h' }, h('h2', { id: 'searches-h' }, 'Your searches'),
        h('p', { class: 'muted small' }, 'Only you can see these.'), searchSlot)));

  const load = async () => {
    let data;
    try { data = await api('/searches'); } catch (err) { if (ctx.isCurrent()) replace(searchSlot, errorBox(err, load)); return; }
    if (!ctx.isCurrent()) return;
    const savedKeys = new Set(data.saved.map((s) => `${s.mode}|${s.query.toLowerCase()}`));
    const item = (s, actions) => h('li', null,
      h('a', { href: searchHref(s), class: 'search-q' }, s.query),
      h('span', { class: 'tag' }, MODE_LABEL[s.mode] || s.mode), actions);
    replace(searchSlot,
      h('h3', { class: 'side-title' }, `Saved (${data.saved.length})`),
      data.saved.length ? h('ul', { class: 'search-list' }, data.saved.map((s) => item(s,
        h('button', { type: 'button', class: 'link-btn link-danger', 'aria-label': `Remove saved search ${s.query}`,
          onclick: async () => { try { await api(`/searches/${s.id}`, { method: 'DELETE' }); load(); } catch (err) { toast(err.message, { error: true }); } } }, 'Remove'))))
        : h('p', { class: 'muted' }, 'No saved searches. Run a search and choose "Save this search".'),
      h('h3', { class: 'side-title' }, 'Recent'),
      data.recent.length ? [
        h('ul', { class: 'search-list' }, data.recent.map((s) => item(s, [
          h('span', { class: 'muted small' }, `${s.result_count} found · ${timeAgo(s.created_at)}`),
          savedKeys.has(`${s.mode}|${s.query.toLowerCase()}`) ? null : h('button', { type: 'button', class: 'link-btn', 'aria-label': `Save search ${s.query}`,
            onclick: async () => { try { await api('/searches', { method: 'POST', body: { query: s.query, mode: s.mode } }); load(); } catch (err) { toast(err.message, { error: true }); } } }, 'Save')]))),
        h('button', { type: 'button', class: 'link-btn', onclick: async () => { try { await api('/searches/history', { method: 'DELETE' }); load(); } catch (err) { toast(err.message, { error: true }); } } }, 'Clear recent searches'),
      ] : h('p', { class: 'muted' }, 'Nothing yet.'));
  };
  load();
}

function profileForm(ctx) {
  const m = state.me.member;
  const f = {};
  const field = (k, label, attrs = {}, hint) => {
    const id = nextId(k);
    const el = attrs.rows ? h('textarea', { id, ...attrs }) : h('input', { id, type: 'text', ...attrs });
    el.value = m[k] || '';
    f[k] = el;
    return h('div', { class: 'field' }, h('label', { for: id }, label), hint ? h('span', { class: 'hint' }, hint) : null, el);
  };
  const roleId = nextId('role');
  f.role = h('select', { id: roleId }, ROLES.map((r) => h('option', { value: r, selected: m.role === r }, roleLabel(r))));
  const errorSlot = h('div');
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save profile');
  const form = h('form', { 'aria-labelledby': 'profile-h', novalidate: true },
    h('h2', { id: 'profile-h' }, 'Your profile'),
    h('p', { class: 'muted small' }, 'Other members see this next to your posts, jobs and introductions.'),
    h('div', { class: 'form-row' }, field('name', 'Name', { required: true, maxlength: 200, autocomplete: 'name' }),
      h('div', { class: 'field' }, h('label', { for: roleId }, 'Role in the CORI network'), f.role)),
    h('div', { class: 'form-row' }, field('org', 'Company or organisation', { maxlength: 200 }), field('location', 'Location', { maxlength: 120, placeholder: 'e.g. Keene, NH' })),
    field('headline', 'Headline', { maxlength: 160 }, 'One line. What you do.'),
    field('bio', 'About you', { rows: 4, maxlength: 2000 }, 'What you know and what you can help with.'),
    h('div', { class: 'form-row' }, field('linkedin_url', 'LinkedIn', { type: 'url', maxlength: 500, placeholder: 'https://www.linkedin.com/in/…' }),
      field('website_url', 'Website', { type: 'url', maxlength: 500, placeholder: 'https://' })),
    errorSlot, submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
    if (!body.name) { replace(errorSlot, h('div', { class: 'alert alert-error', role: 'alert' }, 'Enter your name.')); f.name.focus(); return; }
    submit.disabled = true;
    try {
      const res = await api('/me', { method: 'PATCH', body });
      state.me.member = res.member;
      window.dispatchEvent(new Event('hub:me-changed'));
      replace(errorSlot);
      toast('Profile saved.');
      ctx.rerender();
    } catch (err) { replace(errorSlot, h('div', { class: 'alert alert-error', role: 'alert' }, err.message)); }
    submit.disabled = false;
  });
  return form;
}

function passwordForm() {
  const ids = { cur: nextId('cur'), next: nextId('next') };
  const errorSlot = h('div');
  const has = state.me.has_password;
  const cur = h('input', { id: ids.cur, type: 'password', autocomplete: 'current-password', maxlength: 200 });
  const next = h('input', { id: ids.next, type: 'password', autocomplete: 'new-password', minlength: 8, maxlength: 200 });
  const submit = h('button', { type: 'submit', class: 'btn' }, has ? 'Change password' : 'Set password');
  const form = h('form', { 'aria-labelledby': 'pw-h', class: 'form-section-top', novalidate: true },
    h('h2', { id: 'pw-h' }, 'Password'),
    h('div', { class: 'form-row' },
      has ? h('div', { class: 'field' }, h('label', { for: ids.cur }, 'Current password'), cur) : null,
      h('div', { class: 'field' }, h('label', { for: ids.next }, 'New password'), next, h('span', { class: 'hint' }, 'At least 8 characters. Other devices are signed out.'))),
    errorSlot, submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (next.value.length < 8) { replace(errorSlot, h('div', { class: 'alert alert-error', role: 'alert' }, 'Use a new password of at least 8 characters.')); next.focus(); return; }
    submit.disabled = true;
    try {
      await api('/auth/password', { method: 'POST', body: { current: cur.value, next: next.value } });
      cur.value = ''; next.value = '';
      replace(errorSlot);
      toast('Password changed.');
    } catch (err) { replace(errorSlot, h('div', { class: 'alert alert-error', role: 'alert' }, err.message)); }
    submit.disabled = false;
  });
  return form;
}

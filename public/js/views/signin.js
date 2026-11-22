// Sign in or create an account. The session is an HttpOnly cookie set by the server.
import { h, replace, nextId } from '../dom.js';
import { api } from '../api.js';
import { refreshMe, refreshIntros, toast } from '../store.js';
import { roleLabel } from '../components.js';

const ROLES = ['founder', 'board', 'staff', 'mentor', 'investor'];

function safeNext(params) {
  const next = params.get('next') || '';
  return /^#\/[a-z]/.test(next) && !next.startsWith('#/signin') ? next : '#/leads';
}

export async function renderSignin(ctx) {
  const { root, params } = ctx;
  let mode = params.get('mode') === 'signup' ? 'signup' : 'signin';
  let config = { min_password: 8, invite_required: false };
  try { config = await api('/auth/config'); } catch { /* defaults are fine */ }
  if (!ctx.isCurrent()) return;

  const panel = h('div', { class: 'auth-panel' });
  root.append(h('div', { class: 'auth' },
    h('section', { class: 'auth-pitch' },
      h('p', { class: 'kicker' }, 'Members only'),
      h('h1', null, 'The people you need are one introduction away.'),
      h('p', { class: 'auth-lede' }, 'Founders, board members, CORI staff and mentors pool their networks here. Find a customer, a connector or a hire. See who in the hub knows them. Ask for the introduction.'),
      h('ul', { class: 'auth-points' },
        h('li', null, h('strong', null, 'Leads'), 'Warm paths to customers and to the associations that reach them.'),
        h('li', null, h('strong', null, 'Forum'), 'Ask other founders. Get answers from people who did it.'),
        h('li', null, h('strong', null, 'Jobs'), 'Open roles at portfolio companies, posted by the founders.'))),
    panel));

  const draw = () => {
    const ids = { name: nextId('n'), org: nextId('o'), role: nextId('r'), email: nextId('e'), pw: nextId('p'), code: nextId('c') };
    const errorSlot = h('div');
    const signup = mode === 'signup';
    const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, signup ? 'Create account' : 'Sign in');
    const form = h('form', { class: 'auth-form', novalidate: true },
      signup ? h('div', { class: 'field' }, h('label', { for: ids.name }, 'Your name'),
        h('input', { id: ids.name, name: 'name', type: 'text', required: true, autocomplete: 'name', maxlength: 200 })) : null,
      h('div', { class: 'field' }, h('label', { for: ids.email }, 'Email'),
        h('input', { id: ids.email, name: 'email', type: 'email', required: true, autocomplete: signup ? 'email' : 'username', maxlength: 320 }),
        signup ? h('span', { class: 'hint' }, 'Your sign-in name. Never shown to other members. If CORI already added you, use that email to claim your account.') : null),
      h('div', { class: 'field' }, h('label', { for: ids.pw }, 'Password'),
        h('input', { id: ids.pw, name: 'password', type: 'password', required: true, autocomplete: signup ? 'new-password' : 'current-password', minlength: signup ? config.min_password : null, maxlength: 200 }),
        signup ? h('span', { class: 'hint' }, `At least ${config.min_password} characters.`) : null),
      signup ? h('div', { class: 'form-row' },
        h('div', { class: 'field' }, h('label', { for: ids.org }, 'Company or organisation', h('span', { class: 'hint' }, ' (optional)')),
          h('input', { id: ids.org, name: 'org', type: 'text', autocomplete: 'organization', maxlength: 200 })),
        h('div', { class: 'field' }, h('label', { for: ids.role }, 'Role in the CORI network'),
          h('select', { id: ids.role, name: 'role' }, ROLES.map((r) => h('option', { value: r }, roleLabel(r)))))) : null,
      signup && config.invite_required ? h('div', { class: 'field' }, h('label', { for: ids.code }, 'Invite code'),
        h('input', { id: ids.code, name: 'invite_code', type: 'text', required: true, autocomplete: 'off', maxlength: 100 }),
        h('span', { class: 'hint' }, 'CORI staff sent this with your invitation.')) : null,
      errorSlot,
      submit);
    const fail = (msg, field) => {
      replace(errorSlot, h('div', { class: 'alert alert-error', role: 'alert' }, msg));
      form.querySelector(`[name="${field}"]`)?.focus();
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, k === 'password' ? v : String(v).trim()]));
      if (signup && !body.name) return fail('Enter your name.', 'name');
      if (!body.email) return fail('Enter your email.', 'email');
      if (!body.password) return fail('Enter your password.', 'password');
      if (signup && body.password.length < config.min_password) return fail(`Use a password of at least ${config.min_password} characters.`, 'password');
      submit.disabled = true;
      submit.textContent = signup ? 'Creating account…' : 'Signing in…';
      try {
        const res = await api(signup ? '/auth/signup' : '/auth/login', { method: 'POST', body, quiet401: true });
        await refreshMe();
        refreshIntros().catch(() => {});
        toast(signup ? `Welcome, ${res.member.name}.` : `Signed in as ${res.member.name}.`);
        ctx.navigate(signup && !res.claimed ? '#/profile' : safeNext(params));
      } catch (err) {
        submit.disabled = false;
        submit.textContent = signup ? 'Create account' : 'Sign in';
        fail(err.message, err.status === 401 ? 'password' : 'email');
      }
      return undefined;
    });
    const tab = (id, label) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': mode === id ? 'true' : 'false', class: 'auth-tab',
      onclick: () => { if (mode !== id) { mode = id; draw(); panel.querySelector('input')?.focus(); } },
    }, label);
    replace(panel,
      h('div', { class: 'auth-tabs', role: 'tablist', 'aria-label': 'Sign in or create an account' }, tab('signin', 'Sign in'), tab('signup', 'Create account')),
      form,
      h('p', { class: 'auth-foot' }, signup
        ? 'The hub is closed to the public. Accounts are for CORI portfolio founders, board members, staff and mentors.'
        : 'Forgot your password? Ask CORI staff to reset it.'));
  };
  draw();
}

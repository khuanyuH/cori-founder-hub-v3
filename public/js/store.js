// Shared app state and small cross-view services (toasts, intro/saved bookkeeping).
import { api } from './api.js';
import { h } from './dom.js';

export const state = {
  memberId: null,      // id of the signed-in member, or null
  me: null,            // { member, business, stats, has_password }
  intros: null,        // { incoming, outgoing }
  savedIds: new Set(), // person ids this member saved
  savedLoaded: false,
};

function reset() {
  state.memberId = null;
  state.me = null;
  state.intros = null;
  state.savedIds = new Set();
  state.savedLoaded = false;
}

/** Load the signed-in member from the session cookie. Returns null when nobody is signed in. */
export async function refreshMe() {
  try {
    state.me = await api('/me', { quiet401: true });
    state.memberId = state.me.member.id;
    return state.me;
  } catch (err) {
    if (err.status === 401) { reset(); return null; }
    throw err;
  }
}

export async function signOut() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* the cookie may already be gone */ }
  reset();
}

export function clearSession() { reset(); }

const listeners = new Set();
export function onIntrosChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function refreshIntros() {
  state.intros = await api('/intros');
  for (const fn of listeners) fn(state.intros);
  return state.intros;
}

export async function ensureSaved() {
  if (state.savedLoaded) return state.savedIds;
  const { results } = await api('/leads/saved');
  state.savedIds = new Set(results.map((r) => r.person.id));
  state.savedLoaded = true;
  return state.savedIds;
}

/** Open (pending/accepted) outgoing intro requests for a person, if any. */
export function openIntrosFor(personId) {
  const out = state.intros?.outgoing || [];
  return out.filter((i) => i.person_id === personId && (i.status === 'pending' || i.status === 'accepted'));
}

export function pendingIncomingCount() {
  return (state.intros?.incoming || []).filter((i) => i.status === 'pending').length;
}

export function toast(message, { error = false, action, timeout = 5000 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div', { class: `toast${error ? ' error' : ''}`, role: error ? 'alert' : null }, h('span', null, message));
  let timer;
  const close = () => { clearTimeout(timer); el.remove(); };
  if (action) {
    el.append(h('button', { type: 'button', onclick: () => { close(); action.fn(); } }, action.label));
  }
  el.append(h('button', { type: 'button', 'aria-label': 'Dismiss notification', onclick: close }, '×'));
  host.append(el);
  timer = setTimeout(close, error ? Math.max(timeout, 8000) : timeout);
}

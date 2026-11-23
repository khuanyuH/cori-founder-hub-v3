// App shell: hash router, masthead navigation and account menu.
import { h, replace } from './dom.js';
import { setUnauthorizedHandler } from './api.js';
import { state, refreshMe, refreshIntros, onIntrosChanged, pendingIncomingCount, toast, signOut, clearSession } from './store.js';
import { errorBox, roleLabel, avatar } from './components.js';
import { renderSignin } from './views/signin.js';
import { renderLeads } from './views/leads.js';
import { renderSearch } from './views/search.js';
import { renderNetwork } from './views/network.js';
import { renderImport } from './views/import.js';
import { renderIntros } from './views/intros.js';
import { renderProfile } from './views/profile.js';
import { renderForum } from './views/forum.js';
import { renderJobs } from './views/jobs.js';
import { renderAccount } from './views/account.js';
import { renderMember } from './views/member.js';

const NAV = [
  { route: 'leads', label: 'Leads' },
  { route: 'search', label: 'Search' },
  { route: 'talent', label: 'Talent' },
  { route: 'forum', label: 'Forum' },
  { route: 'jobs', label: 'Jobs' },
  { route: 'intros', label: 'Intros', badge: true },
];
const NAV_YOU = [
  { route: 'network', label: 'My network' },
  { route: 'import', label: 'Import contacts' },
  { route: 'profile', label: 'Business profile' },
  { route: 'account', label: 'Account and searches' },
];

const VIEWS = {
  signin: renderSignin,
  leads: renderLeads,
  search: (ctx) => renderSearch(ctx, 'search'),
  talent: (ctx) => renderSearch(ctx, 'talent'),
  network: renderNetwork,
  import: renderImport,
  intros: renderIntros,
  profile: renderProfile,
  forum: renderForum,
  jobs: renderJobs,
  account: renderAccount,
  members: renderMember,
};

const TITLES = {
  signin: 'Sign in', leads: 'Leads', search: 'Search', talent: 'Talent', network: 'My network',
  import: 'Import contacts', intros: 'Intros', profile: 'Business profile', forum: 'Forum', jobs: 'Jobs',
  account: 'Account', members: 'Member',
};

const main = document.getElementById('main');
const nudgeEl = document.getElementById('import-nudge');
const navEl = document.getElementById('main-nav');
const userEl = document.getElementById('user-menu');
let renderSeq = 0;
let cleanup = null;
let firstRender = true;
let booted = false;

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  return { name: parts[0] || 'leads', parts, params: new URLSearchParams(query || '') };
}

export function navigate(hash, { replace: rep = false } = {}) {
  if (rep) history.replaceState(null, '', hash);
  else if (location.hash !== hash) { location.hash = hash; return; }
  route();
}

function renderHeader() {
  const r = parseHash();
  document.body.classList.toggle('signed-out', !state.me);
  renderImportNudge();
  if (!state.me) { replace(userEl); replace(navEl); return; }
  const m = state.me.member;
  const pending = pendingIncomingCount();
  const link = (n) => h('li', null,
    h('a', { href: `#/${n.route}`, 'aria-current': r.name === n.route ? 'page' : null },
      n.label,
      n.badge && pending ? h('span', { class: 'nav-badge', 'aria-label': `${pending} pending` }, String(pending)) : null));
  replace(navEl,
    h('ul', { class: 'nav-primary' }, NAV.map(link)),
    h('ul', { class: 'nav-you', 'aria-label': 'Your hub' }, NAV_YOU.map(link)));

  const menu = h('details', { class: 'user-menu' },
    h('summary', { 'aria-label': `Account menu for ${m.name}` },
      avatar(m.name, 'sm'),
      h('span', { class: 'user-name' }, m.name),
      h('span', { class: 'user-caret', 'aria-hidden': 'true' }, '▾')),
    h('div', { class: 'menu' },
      h('p', { class: 'menu-who' }, h('strong', null, m.name), h('span', null, [roleLabel(m.role), m.org].filter(Boolean).join(' · '))),
      h('a', { href: `#/members/${m.id}` }, 'View my profile'),
      NAV_YOU.map((n) => h('a', { href: `#/${n.route}`, 'aria-current': r.name === n.route ? 'page' : null }, n.label)),
      h('button', { type: 'button', class: 'menu-out', onclick: doSignOut }, 'Sign out')));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) menu.open = false; });
  replace(userEl, menu);
}

/** A reminder on every tab until the member adds LinkedIn connections. Hidden inside the import wizard itself. */
function renderImportNudge() {
  const r = parseHash();
  const bySource = state.me?.stats?.by_source || {};
  const show = Boolean(state.me) && !bySource.linkedin && r.name !== 'import' && r.name !== 'signin';
  nudgeEl.hidden = !show;
  if (!show) { replace(nudgeEl); return; }
  const others = Number(state.me.stats.connections) > 0;
  replace(nudgeEl,
    h('div', { class: 'import-nudge-inner', role: 'region', 'aria-label': 'Add your LinkedIn connections' },
      h('div', { class: 'import-nudge-text' },
        h('strong', null, 'You have not added your LinkedIn connections yet.'),
        h('span', null, others
          ? ' LinkedIn is the largest source of introductions for most members. The hub walks you through each step.'
          : ' The hub works only when members share their networks. Founders cannot find an introduction through you until you do. The hub walks you through each step.')),
      h('a', { class: 'btn btn-primary', href: '#/import/linkedin' }, 'Add LinkedIn connections')));
}

async function doSignOut() {
  await signOut();
  toast('You are signed out.');
  navigate('#/signin');
}

document.addEventListener('click', (e) => {
  const open = userEl.querySelector('details[open]');
  if (open && !open.contains(e.target)) open.open = false;
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = userEl.querySelector('details[open]');
  if (open) { open.open = false; open.querySelector('summary').focus(); }
});

async function route() {
  const seq = ++renderSeq;
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const r = parseHash();
  const isCurrent = () => seq === renderSeq;

  if (!booted) {
    try {
      await refreshMe();
      booted = true;
      if (state.me) refreshIntros().catch(() => {});
    } catch (err) {
      if (!isCurrent()) return;
      renderHeader();
      replace(main, errorBox(err, () => route()));
      return;
    }
    if (!isCurrent()) return;
  }

  if (!state.me && r.name !== 'signin') {
    const back = location.hash && r.name !== 'leads' ? `?next=${encodeURIComponent(location.hash)}` : '';
    navigate(`#/signin${back}`, { replace: true });
    return;
  }
  if (state.me && r.name === 'signin') { navigate('#/leads', { replace: true }); return; }
  if (!VIEWS[r.name]) { navigate('#/leads', { replace: true }); return; }

  document.title = `${TITLES[r.name] || 'Hub'} · CORI Founder Hub`;
  renderHeader();
  replace(main);
  main.dataset.view = r.name;
  const ctx = { root: main, params: r.params, parts: r.parts, isCurrent, navigate, rerender: () => route(), setTitle: (t) => { document.title = `${t} · CORI Founder Hub`; } };
  try {
    const c = await VIEWS[r.name](ctx);
    if (isCurrent() && typeof c === 'function') cleanup = c;
  } catch (err) {
    if (!isCurrent()) return;
    replace(main, errorBox(err, () => route()));
  }
  if (!firstRender && isCurrent()) {
    const heading = main.querySelector('h1');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }
  firstRender = false;
  // Keep the intro badge fresh as people move around.
  if (state.me && r.name !== 'intros') refreshIntros().catch(() => {});
}

setUnauthorizedHandler(() => {
  if (!state.me) return;
  clearSession();
  toast('Your session ended. Please sign in again.', { error: true });
  navigate('#/signin', { replace: true });
});

onIntrosChanged(() => renderHeader());
window.addEventListener('hashchange', route);
window.addEventListener('hub:me-changed', () => renderHeader());

route();

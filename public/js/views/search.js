// Plain-language search over the pooled network. The Talent screen is the same view preset to talent mode.
import { h, replace, nextId, plural } from '../dom.js';
import { api, qs } from '../api.js';
import { state, ensureSaved, refreshIntros, toast } from '../store.js';
import { searchHref } from './account.js';
import { loading, errorBox, emptyState, resultCard } from '../components.js';

const MODES = [
  { id: 'leads', label: 'Leads', hint: 'Customers, associations, distributors, regulators and other connectors.' },
  { id: 'talent', label: 'Talent', hint: 'People you might hire or bring on as advisors or fractional help.' },
  { id: 'any', label: 'Anyone', hint: 'Everyone in the shared network, best matches first.' },
];

const EXAMPLES = {
  leads: ['dental association leaders in New England', 'small farm cooperatives', 'community college workforce deans', 'rural hospital CFO', 'state rural health office', 'agricultural extension agents'],
  talent: ['fractional CFO', 'marketing lead', 'accountant', 'head of sales with healthcare experience', 'grant writer'],
  any: ['bankers in Vermont', 'people at the State Office of Rural Health', 'angel investors', 'economic development directors'],
};

export async function renderSearch(ctx, routeName) {
  const { root, params } = ctx;
  const defaultMode = routeName === 'talent' ? 'talent' : 'leads';
  const mode = MODES.some((m) => m.id === params.get('mode')) ? params.get('mode') : defaultMode;
  const q = (params.get('q') || '').trim();
  const isTalent = routeName === 'talent';

  const inputId = nextId('q');
  const input = h('input', {
    id: inputId, type: 'search', name: 'q', value: q, autocomplete: 'off', maxlength: 500,
    placeholder: isTalent ? 'e.g. fractional CFO in New England' : 'e.g. dental association leaders in New England',
  });
  const modeName = nextId('mode');
  const modeField = h('fieldset', { class: 'segmented' },
    h('legend', null, 'Search for'),
    MODES.map((m) => h('label', { title: m.hint },
      h('input', { type: 'radio', name: modeName, value: m.id, checked: m.id === mode }),
      h('span', null, m.label))));
  const examplesSlot = h('div');
  const go = (query, m) => {
    const hash = `#/${routeName}${qs({ q: query, mode: m === defaultMode ? null : m })}`;
    ctx.navigate(hash);
  };
  const currentMode = () => modeField.querySelector('input:checked')?.value || mode;
  const form = h('form', { role: 'search', class: 'stack' },
    h('label', { for: inputId, class: 'visually-hidden' }, 'Search the shared network in plain language'),
    h('div', { class: 'search-form' }, input, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Search')),
    h('div', { class: 'row' }, modeField, h('span', { class: 'muted small', id: nextId('modehint') }, MODES.find((m) => m.id === mode).hint)),
    examplesSlot);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) { input.focus(); return; }
    go(query, currentMode());
  });
  const drawExamples = (m) => replace(examplesSlot,
    h('div', { class: 'filter-group' },
      h('span', { class: 'filter-label', id: `${inputId}-ex` }, 'Try one of these'),
      h('ul', { class: 'chips', 'aria-labelledby': `${inputId}-ex` }, EXAMPLES[m].map((ex) => h('li', null,
        h('button', { type: 'button', class: 'chip', onclick: () => { input.value = ex; go(ex, currentMode()); } }, ex))))));
  modeField.addEventListener('change', () => {
    const m = currentMode();
    form.querySelector('.row .muted').textContent = MODES.find((x) => x.id === m).hint;
    drawExamples(m);
    if (input.value.trim()) go(input.value.trim(), m);
  });
  drawExamples(mode);

  // The member's own pinned searches, one click away.
  const mineSlot = h('div');
  let savedList = [];
  const drawMine = () => replace(mineSlot, savedList.length ? h('div', { class: 'filter-group' },
    h('span', { class: 'filter-label' }, 'Your saved searches'),
    h('ul', { class: 'chips' }, savedList.slice(0, 8).map((s) => h('li', null, h('a', { class: 'chip chip-saved', href: searchHref(s) }, s.query))),
      h('li', null, h('a', { class: 'link-btn', href: '#/account' }, 'Manage')))) : null);
  form.append(mineSlot);
  const savedReady = api('/searches').then((d) => { savedList = d.saved; if (ctx.isCurrent()) drawMine(); }).catch(() => {});

  root.append(
    h('div', { class: 'page-head' }, h('div', null,
      h('h1', null, isTalent ? 'Talent' : 'Search the network'),
      h('p', null, isTalent
        ? 'Find people to hire or bring on as fractional help, advisors or board members, recommended by people you trust in the hub.'
        : 'Describe who you want to reach in plain words. The hub searches everyone known by any member and shows who can introduce you.'))),
    h('div', { class: 'card' }, form));

  const results = h('section', { class: 'section', 'aria-label': 'Search results' });
  root.append(results);

  if (!q) {
    results.append(emptyState(isTalent ? 'Who do you need?' : 'Who are you trying to reach?',
      'Type a role, an organisation type, an industry or a place, or start with one of the examples above. Results show who in the hub knows each person and how well.'));
    return;
  }

  results.append(loading(`Searching for “${q}”…`));
  let data;
  try {
    [data] = await Promise.all([
      api(`/search${qs({ q, mode, limit: 30 })}`),
      ensureSaved(),
      state.intros ? null : refreshIntros(),
    ]);
  } catch (err) {
    if (ctx.isCurrent()) replace(results, errorBox(err, () => ctx.rerender()));
    return;
  }
  if (!ctx.isCurrent()) return;
  const list = data.results || [];
  if (!list.length) {
    replace(results, emptyState(`No matches for “${q}”`, null,
      h('div', { class: 'muted', style: { textAlign: 'left', maxWidth: '520px', margin: '0 auto' } },
        h('p', null, 'Things to try:'),
        h('ul', null,
          h('li', null, 'Use fewer or broader words (for example "dental" instead of "dental hygienist supervisor").'),
          h('li', null, 'Drop the place name, or use a state or region ("New England", "Vermont").'),
          h('li', null, 'Describe the organisation instead of the job ("farm bureau", "community college").'),
          mode !== 'any' ? h('li', null, 'Search ', h('button', { type: 'button', class: 'btn btn-sm', onclick: () => go(q, 'any') }, 'Anyone'), ' instead of only ', mode === 'talent' ? 'talent' : 'leads', '.') : null,
          h('li', null, 'Ask members to ', h('a', { href: '#/import' }, 'import their networks'), ' so the shared network grows.')))));
    return;
  }
  const others = list.filter((r) => !(r.known_by || []).some((k) => k.member_id === state.memberId)).length;
  await savedReady;
  if (!ctx.isCurrent()) return;
  const findSaved = () => savedList.find((s) => s.mode === mode && s.query.toLowerCase() === q.toLowerCase());
  const saveBtn = h('button', { type: 'button', class: 'btn btn-sm' });
  const paintSave = () => { const on = Boolean(findSaved()); saveBtn.textContent = on ? 'Search saved' : 'Save this search'; saveBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); };
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      const cur = findSaved();
      if (cur) { await api(`/searches/${cur.id}`, { method: 'DELETE' }); savedList = savedList.filter((s) => s.id !== cur.id); toast('Search removed from your saved searches.'); }
      else { savedList.unshift(await api('/searches', { method: 'POST', body: { query: q, mode } })); toast('Search saved. Find it on this page and on your account page.'); }
      paintSave(); drawMine();
    } catch (err) { toast(err.message, { error: true }); }
    saveBtn.disabled = false;
  });
  paintSave();
  replace(results,
    h('div', { class: 'list-tools' },
      h('p', { class: 'muted small', role: 'status' },
        `${plural(list.length, 'result')} for “${q}”`, others < list.length ? ` (${list.length - others} already in your own network)` : '', '.'),
      saveBtn),
    h('div', { class: 'results' }, list.map((r) => resultCard(r))));
}

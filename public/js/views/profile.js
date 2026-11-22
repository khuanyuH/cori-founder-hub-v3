// Business profile: a short guided flow. (1) name and description, (2) who buys (suggested buyer types with the
// founder's own words as evidence, a searchable picker, a free-text "someone else"), (3) which kinds of leads,
// (4) optional geography and needs. A live "Who we will look for" preview sits alongside.
import { h, replace, nextId, debounce } from '../dom.js';
import { api } from '../api.js';
import { state, toast } from '../store.js';
import { leadTypeBadge, LEAD_TYPE_PLURAL, LEAD_TYPE_LABELS } from '../components.js';

const DEFAULT_LEAD_TYPES = ['customer', 'connector', 'partner'];
const LEAD_TYPE_OPTIONS = [
  { id: 'customer', label: 'Customers', hint: 'People who decide to buy at the organisations you sell to.' },
  { id: 'connector', label: 'Connectors', hint: 'People who reach many of your customers at once, for example an association director who reaches hundreds of your customers.' },
  { id: 'partner', label: 'Partners', hint: 'Vendors and advisers who already specialise in your customers and could refer or bundle you.' },
  { id: 'investor', label: 'Investors', hint: 'Funds and angels who back companies like yours.' },
];

let taxonomyCache = null;
async function loadTaxonomy() {
  if (!taxonomyCache) taxonomyCache = api('/taxonomy').catch((e) => { taxonomyCache = null; throw e; });
  return taxonomyCache;
}

/** Keeps keyboard focus on the "same" control after a container is redrawn. */
function keepFocus(container, draw) {
  const active = document.activeElement;
  const key = active && container.contains(active) ? active.dataset.focusKey : null;
  draw();
  if (key) container.querySelector(`[data-focus-key="${CSS.escape(key)}"]`)?.focus();
}

function stepHead(n, title, id, sub) {
  return h('div', { class: 'step-head' },
    h('span', { class: 'step-num', 'aria-hidden': 'true' }, String(n)),
    h('div', null, h('h2', { id }, h('span', { class: 'visually-hidden' }, `Step ${n}: `), title), sub ? h('p', { class: 'muted small' }, sub) : null));
}

export async function renderProfile(ctx) {
  const { root } = ctx;
  const biz = state.me?.business || {};
  const hasBiz = !!state.me?.business;
  const confirmed = new Set(Array.isArray(biz.customer_industries) ? biz.customer_industries : []);
  const leadTypes = new Set(Array.isArray(biz.lead_types) && biz.lead_types.length ? biz.lead_types : DEFAULT_LEAD_TYPES);
  const needsConfirm = hasBiz && !confirmed.size;
  let taxonomy = [];
  let byId = new Map();
  let suggestions = []; // [{ id, label, evidence }]

  const id = (k) => nextId(`biz-${k}`);
  const ids = { name: id('name'), description: id('desc'), target: id('target'), geography: id('geo'), needs: id('needs'), search: id('search') };
  const err = h('div');
  const saveBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, hasBiz ? 'Save changes' : 'Save and see my leads');
  const savedNote = h('span', { class: 'muted small', role: 'status' });

  const input = (key, attrs) => {
    const el = h(attrs.rows ? 'textarea' : 'input', { id: ids[key], name: key, ...(attrs.rows ? {} : { type: 'text' }), ...attrs });
    el.value = attrs.value || '';
    return el;
  };
  const nameEl = input('name', { maxlength: 200, required: true, placeholder: 'e.g. Mowline', autocomplete: 'organization', value: biz.name });
  const descEl = input('description', { rows: 3, maxlength: 4000, placeholder: 'e.g. Scheduling and route software for lawn care companies. Crews see the day\'s jobs on their phones.', 'aria-describedby': `${ids.description}-h`, value: biz.description });
  const targetEl = input('target', { maxlength: 1000, placeholder: 'e.g. quilting guilds, ski patrols', 'aria-describedby': `${ids.target}-h`, value: biz.target_customers });
  const geoEl = input('geography', { maxlength: 500, placeholder: 'e.g. New England, rural Midwest, or nationwide', value: biz.geography });
  const needsEl = input('needs', { rows: 2, maxlength: 1000, placeholder: 'e.g. fractional CFO; sales lead with industry experience', 'aria-describedby': `${ids.needs}-h`, value: biz.needs });

  // ---- Step 2: who buys ----
  const suggestBox = h('div', { class: 'suggest-box', 'aria-live': 'polite' });
  const chosenBox = h('div', { class: 'chosen-box' });
  const searchEl = h('input', { id: ids.search, type: 'search', placeholder: 'Search, e.g. farms, schools, insurers', autocomplete: 'off', 'aria-controls': `${ids.search}-list` });
  const pickerStatus = h('p', { class: 'muted small', role: 'status' });
  const pickerList = h('div', { class: 'picker', id: `${ids.search}-list`, role: 'group', 'aria-label': 'All buyer types' }, h('p', { class: 'loading' }, 'Loading buyer types…'));
  const checkboxes = new Map();

  const toggle = (tid, on) => {
    if (on ?? !confirmed.has(tid)) confirmed.add(tid); else confirmed.delete(tid);
    drawBuyers();
    schedulePreview();
    savedNote.textContent = '';
  };

  const drawSuggestions = () => keepFocus(suggestBox, () => {
    const list = suggestions.filter((s) => byId.has(s.id) || !taxonomy.length);
    if (!list.length) {
      replace(suggestBox, h('p', { class: 'muted small' }, descEl.value.trim()
        ? 'No buyer named in your description yet. Phrases like "for dairy farmers" or "sold to school districts" help, or pick from the list below.'
        : 'Describe your business in step 1 and the hub will suggest buyer types here.'));
      return;
    }
    replace(suggestBox,
      h('p', { class: 'small', style: { marginBottom: '.4rem' } }, 'Suggested from what you wrote. Tap to confirm the ones that are right.'),
      h('ul', { class: 'chips suggest-chips' }, list.map((s) => h('li', null,
        h('button', {
          type: 'button', class: 'chip chip-suggest', 'aria-pressed': confirmed.has(s.id) ? 'true' : 'false', 'data-focus-key': `s-${s.id}`,
          onclick: () => toggle(s.id),
        },
        h('span', { class: 'chip-main' },
          h('span', { class: 'chip-check', 'aria-hidden': 'true' }, confirmed.has(s.id) ? '✓' : '+'),
          h('span', { class: 'chip-label' }, s.label),
          confirmed.has(s.id) ? h('span', { class: 'chip-tag' }, 'Confirmed') : h('span', { class: 'chip-tag' }, 'Suggested')),
        s.evidence ? h('span', { class: 'chip-evidence' }, `because you wrote: “${s.evidence}”`) : null)))));
  });

  const drawChosen = () => keepFocus(chosenBox, () => {
    const list = [...confirmed];
    if (!list.length) {
      replace(chosenBox, h('p', { class: 'muted small' }, 'No buyer types confirmed yet.'));
      return;
    }
    replace(chosenBox,
      h('p', { class: 'small', style: { marginBottom: '.4rem' } }, h('strong', null, `Your buyers (${list.length})`)),
      h('ul', { class: 'chips' }, list.map((tid) => {
        const label = byId.get(tid)?.label || tid;
        return h('li', null, h('button', {
          type: 'button', class: 'chip chip-chosen', 'aria-label': `Remove ${label}`, 'data-focus-key': `c-${tid}`,
          onclick: () => {
            const items = [...chosenBox.querySelectorAll('button')];
            const at = items.findIndex((b) => b.dataset.focusKey === `c-${tid}`);
            toggle(tid, false);
            const after = [...chosenBox.querySelectorAll('button')];
            (after[Math.min(at, after.length - 1)] || searchEl).focus();
          },
        }, label, h('span', { 'aria-hidden': 'true', class: 'chip-x' }, '×')));
      })));
  });

  const drawBuyers = () => {
    drawSuggestions();
    drawChosen();
    for (const [tid, cb] of checkboxes) cb.checked = confirmed.has(tid);
  };

  const buildPicker = () => {
    const groups = new Map();
    for (const t of taxonomy) {
      if (!groups.has(t.group)) groups.set(t.group, []);
      groups.get(t.group).push(t);
    }
    replace(pickerList, [...groups.entries()].map(([group, items]) => {
      const gid = nextId('grp');
      return h('div', { class: 'picker-group', role: 'group', 'aria-labelledby': gid, dataset: { group } },
        h('h3', { class: 'picker-group-title', id: gid }, group),
        h('ul', { class: 'picker-items' }, items.map((t) => {
          const cb = h('input', { type: 'checkbox', value: t.id, onchange: (e) => toggle(t.id, e.target.checked) });
          cb.checked = confirmed.has(t.id);
          checkboxes.set(t.id, cb);
          return h('li', { dataset: { search: `${t.label} ${t.examples.join(' ')} ${group}`.toLowerCase() } },
            h('label', { class: 'pick' }, cb,
              h('span', null, h('span', { class: 'pick-label' }, t.label), h('span', { class: 'pick-examples' }, t.examples.join(', ')))));
        })));
    }));
  };

  const filterPicker = () => {
    const q = searchEl.value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/s$/, ''));
    let shown = 0;
    for (const g of pickerList.querySelectorAll('.picker-group')) {
      let any = false;
      for (const li of g.querySelectorAll('li')) {
        const ok = !words.length || words.every((w) => li.dataset.search.includes(w));
        li.hidden = !ok;
        if (ok) { any = true; shown++; }
      }
      g.hidden = !any;
    }
    pickerStatus.textContent = q ? (shown ? `${shown} matching buyer type${shown === 1 ? '' : 's'}.` : 'No buyer type matches. Try another word, or describe them under "Someone else".') : '';
  };
  searchEl.addEventListener('input', filterPicker);

  // ---- Step 3: lead types ----
  const leadTypeList = h('ul', { class: 'lead-type-list' }, LEAD_TYPE_OPTIONS.map((o) => {
    const cb = h('input', { type: 'checkbox', name: 'lead_types', value: o.id, 'aria-describedby': `lt-${o.id}-h` });
    cb.checked = leadTypes.has(o.id);
    cb.addEventListener('change', () => { if (cb.checked) leadTypes.add(o.id); else leadTypes.delete(o.id); schedulePreview(); savedNote.textContent = ''; });
    return h('li', null, h('label', { class: 'radio-card' }, cb,
      h('span', null, h('span', { class: 'pick-label' }, o.label), h('span', { class: 'pick-examples', id: `lt-${o.id}-h` }, o.hint))));
  }));

  const form = h('form', { class: 'card guided', novalidate: true },
    needsConfirm ? h('div', { class: 'alert alert-info', role: 'note' },
      h('strong', null, 'One more step: confirm who buys from you. '),
      'Tick the buyer types that fit in step 2 and save. Confirmed buyers keep your suggestions accurate.') : null,
    h('section', { class: 'step', 'aria-labelledby': 'step1-h' },
      stepHead(1, 'Your business', 'step1-h'),
      h('div', { class: 'field' }, h('label', { for: ids.name }, 'Business name'), nameEl),
      h('div', { class: 'field' },
        h('label', { for: ids.description }, 'What do you sell, and to whom?'),
        h('span', { class: 'hint', id: `${ids.description}-h` }, 'One short paragraph. Name your buyers plainly ("for dairy farmers", "sold to school districts").'),
        descEl)),
    h('section', { class: 'step', id: 'who-buys', 'aria-labelledby': 'step2-h' },
      stepHead(2, 'Who buys this?', 'step2-h', 'Confirm at least one buyer type, or describe them under "Someone else". The hub only looks for customers you confirm.'),
      suggestBox,
      chosenBox,
      h('div', { class: 'field', style: { marginTop: '.75rem' } },
        h('label', { for: ids.search }, 'Find a buyer type'),
        searchEl, pickerStatus),
      pickerList,
      h('div', { class: 'field', style: { marginTop: '1rem' } },
        h('label', { for: ids.target }, 'Someone else? ', h('span', { class: 'hint' }, '(optional)')),
        h('span', { class: 'hint', id: `${ids.target}-h` }, 'For buyers the list does not have. Separate several with commas.'),
        targetEl)),
    h('section', { class: 'step', 'aria-labelledby': 'step3-h' },
      stepHead(3, 'Which kinds of leads do you want?', 'step3-h'),
      h('fieldset', null, h('legend', { class: 'visually-hidden' }, 'Kinds of leads'), leadTypeList)),
    h('section', { class: 'step', 'aria-labelledby': 'step4-h' },
      stepHead(4, 'Where, and who else you need', 'step4-h', 'Both optional.'),
      h('div', { class: 'field' }, h('label', { for: ids.geography }, 'Where do you sell?'), geoEl),
      h('div', { class: 'field' },
        h('label', { for: ids.needs }, 'Hires or advisers you need'),
        h('span', { class: 'hint', id: `${ids.needs}-h` }, 'The hub adds these as talent searches.'),
        needsEl)),
    err,
    h('div', { class: 'row' }, saveBtn, savedNote));

  const previewBody = h('div', { 'aria-live': 'polite' });
  const preview = h('aside', { class: 'panel sticky', 'aria-labelledby': 'who-h' },
    h('h2', { id: 'who-h' }, 'Who we will look for'),
    h('p', { class: 'muted small' }, 'Updates as you go. These are the kinds of people the hub will suggest from the networks members have shared.'),
    previewBody);

  root.append(
    h('div', { class: 'page-head' }, h('div', null,
      h('h1', null, 'Your business'),
      h('p', null, 'Four short steps, about a minute. The hub then suggests customers, and connectors (associations, distributors, regulators) who reach many customers at once.'))),
    h('div', { class: 'split' }, form, preview));

  const values = () => ({
    name: nameEl.value.trim(),
    description: descEl.value.trim(),
    industry: biz.industry || '',
    target_customers: targetEl.value.trim(),
    geography: geoEl.value.trim(),
    needs: needsEl.value.trim(),
    customer_industries: [...confirmed],
    lead_types: LEAD_TYPE_OPTIONS.map((o) => o.id).filter((t) => leadTypes.has(t)),
  });

  let seq = 0;
  const updatePreview = async () => {
    const v = values();
    if (!v.description && !v.target_customers && !v.needs && !v.customer_industries.length) {
      suggestions = [];
      drawSuggestions();
      replace(previewBody, h('p', { class: 'muted' }, 'Start with step 1 to see who the hub will look for.'));
      return;
    }
    if (!v.lead_types.length) {
      replace(previewBody, h('p', { class: 'muted' }, 'Pick at least one kind of lead in step 3.'));
      return;
    }
    const my = ++seq;
    previewBody.setAttribute('aria-busy', 'true');
    try {
      const res = await api('/business/preview', { method: 'POST', body: v });
      if (my !== seq || !ctx.isCurrent()) return;
      previewBody.removeAttribute('aria-busy');
      suggestions = res.suggested_customers || [];
      drawSuggestions();
      replace(previewBody, personasList(res, v));
    } catch (e) {
      if (my !== seq || !ctx.isCurrent()) return;
      previewBody.removeAttribute('aria-busy');
      replace(previewBody, h('div', { class: 'alert alert-error', role: 'alert' }, `Preview unavailable: ${e.message}`));
    }
  };
  const schedulePreview = debounce(updatePreview, 400);
  for (const el of [nameEl, descEl, targetEl, geoEl, needsEl]) {
    el.addEventListener('input', () => { savedNote.textContent = ''; schedulePreview(); });
  }

  const showError = (msg, focusEl) => {
    replace(err, h('div', { class: 'alert alert-error', role: 'alert' }, msg));
    focusEl?.focus();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = values();
    replace(err);
    if (!v.name) return showError('Please give your business a name (step 1).', nameEl);
    if (!v.customer_industries.length && !v.target_customers) {
      return showError('Tell the hub who buys (step 2): confirm at least one buyer type, or describe them under "Someone else".', suggestBox.querySelector('button') || searchEl);
    }
    if (!v.lead_types.length) return showError('Pick at least one kind of lead (step 3).', leadTypeList.querySelector('input'));
    saveBtn.disabled = true;
    try {
      const res = await api('/business', { method: 'PUT', body: v });
      if (!ctx.isCurrent()) return;
      state.me = { ...state.me, business: res.business };
      suggestions = res.suggested_customers || suggestions;
      drawSuggestions();
      replace(previewBody, personasList(res, v));
      toast('Business profile saved.');
      if (!hasBiz || needsConfirm) { ctx.navigate('#/leads'); return; }
      replace(savedNote, 'Saved. ', h('a', { href: '#/leads' }, 'See your leads'));
    } catch (e2) {
      showError(e2.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  // Initial render: buyers first (from what we have), then the taxonomy, then the preview.
  drawBuyers();
  updatePreview();
  try {
    taxonomy = await loadTaxonomy();
    if (!ctx.isCurrent()) return () => schedulePreview.cancel();
    byId = new Map(taxonomy.map((t) => [t.id, t]));
    buildPicker();
    drawBuyers();
  } catch (e) {
    replace(pickerList, h('div', { class: 'alert alert-error', role: 'alert' }, `Could not load buyer types: ${e.message}`));
  }
  if (needsConfirm && ctx.isCurrent()) {
    document.getElementById('who-buys')?.scrollIntoView({ block: 'start' });
  }

  return () => schedulePreview.cancel();
}

function personasList(res, v) {
  const personas = res?.personas || [];
  const nodes = [];
  if (res?.needs_input) {
    nodes.push(h('div', { class: 'alert alert-warn' },
      h('strong', null, 'No buyer type yet. '),
      v.target_customers && !v.customer_industries.length
        ? `The hub could not match "${v.target_customers.slice(0, 80)}" to a buyer type. Pick the closest ones in step 2 to get customers and connectors.`
        : 'Confirm who buys in step 2 to get customers and connectors.'));
  }
  if (!personas.length) {
    if (!nodes.length) nodes.push(h('p', { class: 'muted' }, 'Nothing to look for yet.'));
    return h('div', null, nodes);
  }
  const counts = {};
  for (const p of personas) counts[p.lead_type] = (counts[p.lead_type] || 0) + 1;
  nodes.push(
    h('p', { class: 'small' }, Object.entries(counts).map(([t, n]) => `${n} ${(n === 1 ? (LEAD_TYPE_LABELS[t] || t) : (LEAD_TYPE_PLURAL[t] || t)).toLowerCase()}`).join(' · ')),
    h('ul', { style: { listStyle: 'none', padding: 0, margin: 0 }, class: 'stack' }, personas.map((p) => h('li', { class: 'persona' },
      leadTypeBadge(p.lead_type),
      h('h3', { style: { marginTop: '.4rem' } }, p.label),
      h('p', null, p.why),
      p.queries?.length ? h('p', { class: 'persona-queries' }, 'We will search for: ', p.queries.join('; ')) : null))));
  return h('div', null, nodes);
}

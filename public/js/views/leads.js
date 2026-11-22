// Home: proactive suggested leads derived from the member's business profile, plus saved leads.
import { h, replace, plural } from '../dom.js';
import { api } from '../api.js';
import { state, ensureSaved, refreshIntros } from '../store.js';
import { loading, errorBox, emptyState, resultCard, leadTypeBadge, LEAD_TYPE_PLURAL } from '../components.js';

const TYPE_ORDER = ['customer', 'connector', 'partner', 'investor', 'talent'];

export async function renderLeads(ctx) {
  const { root, params } = ctx;
  const tab = params.get('tab') === 'saved' ? 'saved' : 'suggested';
  const business = state.me?.business;

  if (!business) {
    root.append(
      h('div', { class: 'page-head' }, h('div', null,
        h('h1', null, 'Leads'),
        h('p', null, 'Warm introductions to customers and connectors, through people in the CORI network.'))),
      tabsNav(tab));
    if (tab === 'saved') {
      const body = h('div', null, loading('Loading saved leads…'));
      root.append(body);
      return renderSaved(ctx, body);
    }
    root.append(
      h('div', { class: 'card prompt-card' },
        h('h2', null, 'Tell the hub about your business first'),
        h('p', null, 'Describe what you sell, to whom, and where. The hub turns that into the kinds of people to look for (customers, associations and other connectors, partners, talent) and then suggests specific people that members of the hub know.'),
        h('p', { class: 'muted small' }, 'It takes about a minute. You can change it any time.'),
        state.me?.member?.role && state.me.member.role !== 'founder'
          ? h('p', { class: 'small' }, 'Not running a business? Your biggest contribution is your network: ',
            h('a', { href: '#/import' }, 'import your contacts'), ' and answer ', h('a', { href: '#/intros' }, 'intro requests'), ' from founders.')
          : null,
        h('div', { class: 'row' },
          h('a', { class: 'btn btn-primary', href: '#/profile' }, 'Describe your business'),
          h('a', { class: 'btn', href: '#/search' }, 'Or search the network'))));
    return;
  }

  root.append(
    h('div', { class: 'page-head' },
      h('div', null,
        h('h1', null, `Leads for ${business.name}`),
        h('p', null, 'People the hub thinks you should meet, and the members who can introduce you. Nobody is contacted until a member agrees to make the introduction.')),
      h('a', { class: 'btn btn-sm', href: '#/profile' }, 'Edit business profile')));

  const body = h('div', null, loading(tab === 'saved' ? 'Loading saved leads…' : 'Finding leads across the shared network…'));
  root.append(tabsNav(tab), body);

  if (tab === 'saved') return renderSaved(ctx, body);
  return renderSuggested(ctx, body);
}

function tabsNav(active) {
  return h('nav', { 'aria-label': 'Lead lists', class: 'tabs' },
    h('a', { class: 'btn btn-sm', href: '#/leads', 'aria-current': active === 'suggested' ? 'page' : null, 'aria-pressed': active === 'suggested' ? 'true' : 'false' }, 'Suggested'),
    h('a', { class: 'btn btn-sm', href: '#/leads?tab=saved', 'aria-current': active === 'saved' ? 'page' : null, 'aria-pressed': active === 'saved' ? 'true' : 'false' }, 'Saved'));
}

async function renderSuggested(ctx, body) {
  let data;
  try {
    [data] = await Promise.all([
      api('/leads/suggested?limit=40'),
      ensureSaved(),
      state.intros ? null : refreshIntros(),
    ]);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err.status === 409) {
      replace(body, h('div', { class: 'card prompt-card' }, h('p', null, err.message), h('a', { class: 'btn btn-primary', href: '#/profile' }, 'Describe your business')));
      return;
    }
    replace(body, errorBox(err, () => ctx.rerender()));
    return;
  }
  if (!ctx.isCurrent()) return;

  if (data.needs_input) {
    replace(body, h('div', { class: 'card prompt-card', role: 'region', 'aria-labelledby': 'needs-input-h' },
      h('h2', { id: 'needs-input-h' }, 'One step left: who buys from you?'),
      h('p', null, data.message || 'Pick at least one buyer type on your business profile and the hub will suggest customers and the connectors who reach them.'),
      h('p', { class: 'muted small' }, 'Confirming your buyers keeps suggestions accurate. It takes under a minute.'),
      h('div', { class: 'row' },
        h('a', { class: 'btn btn-primary', href: '#/profile' }, 'Choose who buys'),
        h('a', { class: 'btn', href: '#/search' }, 'Or search the network'))));
    return;
  }

  const personas = data.personas || [];
  const unconfirmed = !(state.me?.business?.customer_industries || []).length;
  const leads = [...(data.leads || [])];
  const filter = { persona: null, type: null };

  const personasSection = personasPanel(personas);
  const filtersSlot = h('div');
  const summary = h('p', { class: 'muted small', role: 'status' });
  const grid = h('div', { class: 'results' });
  const confirmNote = unconfirmed ? h('div', { class: 'alert alert-info' },
    h('strong', null, 'These leads use buyers read from your description. '),
    h('a', { href: '#/profile' }, 'Confirm who buys'), ' for sharper suggestions.') : null;
  replace(body, confirmNote, personasSection, filtersSlot, summary, grid);

  if (!leads.length) {
    replace(grid);
    grid.replaceWith(emptyState('No suggested leads yet',
      'Nobody in the shared network matches your business profile yet. Try adding more detail to your profile (target customers, geography), search in plain language, or ask members to import their networks.',
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('a', { class: 'btn btn-primary', href: '#/profile' }, 'Refine your profile'),
        h('a', { class: 'btn', href: '#/search' }, 'Search the network'))));
    summary.remove();
    return;
  }

  const draw = () => {
    // Filters with counts.
    const typeCounts = {};
    const personaCounts = {};
    for (const l of leads) {
      typeCounts[l.lead_type] = (typeCounts[l.lead_type] || 0) + 1;
      personaCounts[l.persona_id] = (personaCounts[l.persona_id] || 0) + 1;
    }
    const types = TYPE_ORDER.filter((t) => typeCounts[t]).concat(Object.keys(typeCounts).filter((t) => !TYPE_ORDER.includes(t)));
    // Long persona labels are truncated with an ellipsis; the full label stays in the title and the accessible name.
    const chip = (label, count, pressed, onclick) => h('li', null,
      h('button', { type: 'button', class: 'chip', title: label, 'aria-pressed': pressed ? 'true' : 'false', onclick },
        h('span', { class: 'chip-label' }, label), count != null ? h('span', { class: 'count' }, String(count)) : null));

    replace(filtersSlot,
      h('div', { class: 'filter-group', role: 'group', 'aria-label': 'Filter by lead type' },
        h('span', { class: 'filter-label', 'aria-hidden': 'true' }, 'Kind of lead'),
        h('ul', { class: 'chips chips-row' },
          chip('All', leads.length, !filter.type, () => { filter.type = null; draw(); }),
          types.map((t) => chip(LEAD_TYPE_PLURAL[t] || t, typeCounts[t], filter.type === t, () => { filter.type = filter.type === t ? null : t; draw(); })))),
      h('div', { class: 'filter-group', role: 'group', 'aria-label': 'Filter by who you are looking for' },
        h('span', { class: 'filter-label', 'aria-hidden': 'true' }, 'Looking for'),
        h('ul', { class: 'chips chips-row' },
          chip('Everyone', null, !filter.persona, () => { filter.persona = null; draw(); }),
          personas.filter((p) => personaCounts[p.id]).map((p) => chip(p.label, personaCounts[p.id], filter.persona === p.id,
            () => { filter.persona = filter.persona === p.id ? null : p.id; draw(); })))));

    const shown = leads.filter((l) => (!filter.type || l.lead_type === filter.type) && (!filter.persona || l.persona_id === filter.persona));
    const reachable = new Set();
    for (const l of shown) for (const k of l.known_by || []) if (k.member_id !== state.memberId) reachable.add(k.member_id);
    summary.textContent = shown.length === leads.length
      ? `${plural(leads.length, 'suggested lead')}, reachable through ${plural(reachable.size, 'hub member')}.`
      : `Showing ${shown.length} of ${leads.length} leads.`;

    replace(grid, shown.length ? shown.map((l) => resultCard(l, {
      showPersona: true,
      allowDismiss: true,
      onDismiss: (card, result) => {
        const idx = leads.indexOf(result);
        card.classList.add('removing');
        setTimeout(() => {
          if (idx >= 0) leads.splice(idx, 1);
          result._idx = idx;
          draw();
          grid.querySelector('.lead button')?.focus();
        }, 180);
      },
      onUndoDismiss: (result) => {
        const at = Math.min(Math.max(result._idx ?? 0, 0), leads.length);
        leads.splice(at, 0, result);
        draw();
      },
    })) : h('div', { class: 'state', style: { gridColumn: '1 / -1' } },
      h('p', null, 'No leads match these filters.'),
      h('button', { type: 'button', class: 'btn', onclick: () => { filter.type = null; filter.persona = null; draw(); } }, 'Clear filters')));
  };
  draw();
}

const PERSONAS_OPEN_KEY = 'hub.leads.personasOpen';

function personasPanel(personas) {
  if (!personas.length) return null;
  // Collapsed by default at every width so the leads come first; the member's choice is remembered.
  let open = false;
  try { open = localStorage.getItem(PERSONAS_OPEN_KEY) === '1'; } catch { /* storage unavailable */ }
  const labels = personas.map((p) => p.label).join(' · ');
  const details = h('details', { class: 'disclosure panel personas-panel', open, style: { marginBottom: '1.5rem' } },
    h('summary', null,
      h('span', { class: 'disclosure-title' }, `Who the hub is looking for (${personas.length})`),
      h('span', { class: 'disclosure-sub', title: labels }, labels)),
    h('p', { class: 'muted small', style: { margin: '.4rem 0 0' } }, 'Based on your business profile. Edit the profile to change these.'),
    h('div', { class: 'personas' }, personas.map((p) => h('div', { class: 'persona' },
      leadTypeBadge(p.lead_type),
      h('h3', { style: { marginTop: '.4rem' } }, p.label),
      h('p', null, p.why)))));
  details.addEventListener('toggle', () => {
    try { localStorage.setItem(PERSONAS_OPEN_KEY, details.open ? '1' : '0'); } catch { /* storage unavailable */ }
  });
  return details;
}

async function renderSaved(ctx, body) {
  let results;
  try {
    const [saved] = await Promise.all([api('/leads/saved'), state.intros ? null : refreshIntros()]);
    results = saved.results || [];
    state.savedIds = new Set(results.map((r) => r.person.id));
    state.savedLoaded = true;
  } catch (err) {
    if (ctx.isCurrent()) replace(body, errorBox(err, () => ctx.rerender()));
    return;
  }
  if (!ctx.isCurrent()) return;
  if (!results.length) {
    replace(body, emptyState('No saved leads yet', 'Use "Save" on any lead or search result to keep it here for later.',
      h('a', { class: 'btn btn-primary', href: '#/leads' }, 'See suggested leads')));
    return;
  }
  const grid = h('div', { class: 'results' });
  const draw = () => {
    const list = results.filter((r) => state.savedIds.has(r.person.id));
    if (!list.length) {
      replace(body, emptyState('No saved leads', 'You removed everything from this list.', h('a', { class: 'btn', href: '#/leads' }, 'See suggested leads')));
      return;
    }
    replace(grid, list.map((r) => resultCard(r, { onChange: draw })));
  };
  replace(body, h('p', { class: 'muted small' }, plural(results.length, 'saved lead')), grid);
  draw();
}

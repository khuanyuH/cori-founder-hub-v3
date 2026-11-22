// The member's own network: stats, sources (with removal), and a searchable, paginated contact table.
import { h, replace, nextId, debounce, plural, safeLinkedIn } from '../dom.js';
import { api, qs } from '../api.js';
import { refreshMe, toast } from '../store.js';
import { loading, errorBox, emptyState, strengthMeter, sourceLabel, confirmDialog, SOURCE_LABELS } from '../components.js';

const PAGE = 25;

export async function renderNetwork(ctx) {
  const { root } = ctx;
  root.append(h('div', { class: 'page-head' },
    h('div', null,
      h('h1', null, 'My network'),
      h('p', null, 'The people you have brought into the hub. Other members can see who you know (name, title, company, how well, your note) and ask you for an introduction. You decide.')),
    h('a', { class: 'btn btn-primary', href: '#/import' }, 'Import contacts')));

  const statsSlot = h('section', { 'aria-label': 'Network statistics' }, loading('Loading your network…'));
  const tableSection = h('section', { class: 'section', 'aria-labelledby': 'contacts-h' });
  root.append(statsSlot, tableSection);

  const drawStats = async () => {
    try {
      const me = await refreshMe();
      if (!ctx.isCurrent()) return;
      replace(statsSlot, statsView(me.stats, drawStats, () => table.reload()));
    } catch (err) {
      if (ctx.isCurrent()) replace(statsSlot, errorBox(err, drawStats));
    }
  };
  const table = contactsTable(ctx, tableSection);
  drawStats();
}

function statsView(stats, redraw, reloadTable) {
  const entries = Object.entries(stats.by_source || {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  const wrap = h('div', { class: 'stack' },
    h('div', { class: 'stats' },
      stat(stats.connections, 'people you know'),
      stat(entries.length, entries.length === 1 ? 'source imported' : 'sources imported'),
      stat(stats.pool_people, 'people in the shared network'),
      stat(stats.pool_members, 'members sharing networks')));

  if (!entries.length) {
    wrap.append(h('div', { class: 'card prompt-card' },
      h('h2', null, 'Your network is empty'),
      h('p', null, 'Import your LinkedIn connections first; it takes a few minutes and gives the hub the most to work with. Other sources (contacts, calendar, rosters) add strength.'),
      h('a', { class: 'btn btn-primary', href: '#/import/linkedin' }, 'Start with LinkedIn')));
    return wrap;
  }

  wrap.append(h('div', { class: 'card' },
    h('h2', null, 'Connections by source'),
    h('p', { class: 'muted small' }, 'A person can appear under several sources. Removing a source deletes only your links from that source; people nobody else knows leave the hub.'),
    h('ul', { class: 'source-bars' }, entries.map(([src, n]) => h('li', null,
      h('span', null, sourceLabel(src)),
      h('span', { class: 'bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${Math.round((n / max) * 100)}%` } })),
      h('span', { class: 'num' }, n.toLocaleString()),
      h('button', {
        type: 'button', class: 'btn btn-danger btn-sm',
        onclick: async (e) => {
          const btn = e.currentTarget;
          const ok = await confirmDialog({
            title: `Remove your ${sourceLabel(src)} contacts?`,
            message: `This removes ${plural(n, 'connection')} you imported from ${sourceLabel(src)}. People only you knew through this source leave the hub, and any vouch notes on these links are deleted. You can import the source again later.`,
            confirmLabel: `Remove ${sourceLabel(src)}`,
            danger: true,
          });
          if (!ok) return;
          btn.disabled = true;
          try {
            const { removed } = await api(`/network/source/${encodeURIComponent(src)}`, { method: 'DELETE' });
            toast(`Removed ${plural(removed, 'connection')} from ${sourceLabel(src)}.`);
            await redraw();
            reloadTable();
          } catch (err) {
            toast(err.message, { error: true });
            btn.disabled = false;
          }
        },
      }, 'Remove', h('span', { class: 'visually-hidden' }, ` ${sourceLabel(src)} contacts`)))))));
  return wrap;
}

function stat(value, label) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, Number(value || 0).toLocaleString()), h('div', { class: 'stat-label' }, label));
}

function contactsTable(ctx, section) {
  let offset = 0;
  let q = '';
  let source = '';
  let seq = 0;
  const searchId = nextId('nq');
  const sourceId = nextId('ns');
  const searchInput = h('input', { id: searchId, type: 'search', placeholder: 'Filter by name, title, company or place', autocomplete: 'off' });
  const sourceSelect = h('select', { id: sourceId },
    h('option', { value: '' }, 'All sources'),
    Object.entries(SOURCE_LABELS).map(([id, label]) => h('option', { value: id }, label)));
  const body = h('div', null, loading('Loading contacts…'));
  const status = h('p', { class: 'muted small', role: 'status' });

  section.append(
    h('h2', { id: 'contacts-h' }, 'Your contacts'),
    h('div', { class: 'table-tools' },
      h('label', { for: searchId, class: 'visually-hidden' }, 'Filter contacts'), searchInput,
      h('label', { for: sourceId, class: 'visually-hidden' }, 'Filter by source'), sourceSelect),
    status, body);

  const load = async () => {
    const my = ++seq;
    body.setAttribute('aria-busy', 'true');
    try {
      const data = await api(`/network${qs({ q, source, limit: PAGE, offset })}`);
      if (my !== seq || !ctx.isCurrent()) return;
      body.removeAttribute('aria-busy');
      if (!data.total) {
        status.textContent = '';
        replace(body, q || source
          ? emptyState('No contacts match', 'Try a different word or source.', h('button', { type: 'button', class: 'btn', onclick: () => { searchInput.value = ''; sourceSelect.value = ''; q = ''; source = ''; offset = 0; load(); } }, 'Clear filters'))
          : emptyState('No contacts yet', 'Import a source to see your contacts here.', h('a', { class: 'btn btn-primary', href: '#/import' }, 'Import contacts')));
        return;
      }
      const from = offset + 1;
      const to = offset + data.items.length;
      status.textContent = `Showing ${from}–${to} of ${data.total.toLocaleString()}${q || source ? ' matching' : ''} contacts.`;
      replace(body,
        h('div', { class: 'table-wrap' }, h('table', { class: 'responsive' },
          h('caption', { class: 'visually-hidden' }, 'Your contacts, strongest ties first'),
          h('thead', null, h('tr', null, ['Name', 'Title and company', 'Location', 'Source', 'How well', 'Your note'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, data.items.map((it) => {
            const p = it.person;
            const li = safeLinkedIn(p.linkedin_url);
            return h('tr', null,
              h('td', { class: 'primary' }, li ? h('a', { href: li, target: '_blank', rel: 'noopener noreferrer' }, p.full_name) : h('strong', null, p.full_name)),
              h('td', { 'data-label': 'Role' }, p.title || '', p.company ? h('span', { class: 'sub' }, p.company) : null),
              h('td', { 'data-label': 'Location' }, p.location || h('span', { class: 'muted' }, '—')),
              h('td', { 'data-label': 'Source' }, it.sources.map(sourceLabel).join(', ')),
              h('td', { 'data-label': 'How well' }, strengthMeter(it.strength)),
              h('td', { 'data-label': 'Note' }, it.note || h('span', { class: 'muted' }, '—')));
          })))),
        h('div', { class: 'pager' },
          h('button', { type: 'button', class: 'btn btn-sm', disabled: offset === 0, onclick: () => { offset = Math.max(0, offset - PAGE); load(); } }, 'Previous'),
          h('span', null, `Page ${Math.floor(offset / PAGE) + 1} of ${Math.max(1, Math.ceil(data.total / PAGE))}`),
          h('button', { type: 'button', class: 'btn btn-sm', disabled: to >= data.total, onclick: () => { offset += PAGE; load(); } }, 'Next')));
    } catch (err) {
      if (my !== seq || !ctx.isCurrent()) return;
      body.removeAttribute('aria-busy');
      replace(body, errorBox(err, load));
    }
  };
  const onSearch = debounce(() => { q = searchInput.value.trim(); offset = 0; load(); }, 250);
  searchInput.addEventListener('input', onSearch);
  sourceSelect.addEventListener('change', () => { source = sourceSelect.value; offset = 0; load(); });
  load();
  return { reload: () => { offset = 0; load(); } };
}


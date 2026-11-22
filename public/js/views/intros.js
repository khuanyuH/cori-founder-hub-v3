// Intro requests: incoming (you are the introducer) and outgoing (you asked).
import { h, replace, formatDate } from '../dom.js';
import { api } from '../api.js';
import { refreshIntros, toast } from '../store.js';
import { loading, errorBox, roleLabel } from '../components.js';

const STATUS_LABEL = { pending: 'Waiting for reply', accepted: 'Accepted', declined: 'Declined', done: 'Done' };

export async function renderIntros(ctx) {
  const { root } = ctx;
  root.append(h('div', { class: 'page-head' }, h('div', null,
    h('h1', null, 'Introductions'),
    h('p', null, 'Requests for you to introduce someone you know, and the introductions you have asked for. Accepting does not send anything: you make the introduction yourself, by email or in person, then mark it done.'))));
  const body = h('div', null, loading('Loading intro requests…'));
  root.append(body);

  const draw = async () => {
    let data;
    try {
      data = await refreshIntros();
    } catch (err) {
      if (ctx.isCurrent()) replace(body, errorBox(err, draw));
      return;
    }
    if (!ctx.isCurrent()) return;
    const pending = data.incoming.filter((i) => i.status === 'pending').length;
    replace(body,
      h('section', { 'aria-labelledby': 'incoming-h' },
        h('h2', { id: 'incoming-h', tabindex: '-1' }, 'Asked of you', pending ? h('span', { class: 'badge badge-pending', style: { marginLeft: '.5rem' } }, `${pending} pending`) : null),
        data.incoming.length
          ? h('div', { class: 'grid grid-2' }, data.incoming.map((i) => introCard(i, 'incoming', draw)))
          : h('div', { class: 'panel' }, h('p', { class: 'muted' }, 'No one has asked you for an introduction yet. Requests appear here when a founder finds someone in your network.'))),
      h('section', { class: 'section', 'aria-labelledby': 'outgoing-h' },
        h('h2', { id: 'outgoing-h', tabindex: '-1' }, 'Asked by you'),
        data.outgoing.length
          ? h('div', { class: 'grid grid-2' }, data.outgoing.map((i) => introCard(i, 'outgoing', draw)))
          : h('div', { class: 'panel' },
            h('p', { class: 'muted' }, 'You have not requested any introductions yet. Find a lead and ask a member who knows them.'),
            h('a', { class: 'btn btn-primary', href: '#/leads' }, 'Find leads'))));
  };
  await draw();
}

function introCard(intro, dir, redraw) {
  const p = intro.person || {};
  const other = dir === 'incoming' ? intro.requester : intro.introducer;
  const card = h('article', { class: 'card intro' });
  card.append(
    h('div', { class: 'lead-head' },
      h('div', null,
        h('h3', { class: 'lead-name' }, p.full_name || 'Unknown person'),
        h('p', { class: 'lead-role' }, [p.title, p.company].filter(Boolean).join(', ')),
        p.location ? h('p', { class: 'lead-loc' }, p.location) : null),
      h('span', { class: `badge badge-${intro.status}` }, STATUS_LABEL[intro.status] || intro.status)),
    h('p', { class: 'intro-meta' },
      dir === 'incoming'
        ? [h('strong', null, other?.name || 'A member'), other?.org ? ` (${other.org})` : '', ` asked you to introduce them · ${formatDate(intro.created_at)}`]
        : ['You asked ', h('strong', null, other?.name || 'a member'), other?.role ? ` (${roleLabel(other.role)})` : '', ` · ${formatDate(intro.created_at)}`]),
    intro.message ? h('blockquote', { class: 'intro-msg' }, intro.message) : h('p', { class: 'muted small' }, 'No message.'));

  const actions = h('div', { class: 'lead-actions' });
  const act = (status, label, cls = 'btn btn-sm') => h('button', {
    type: 'button', class: cls,
    onclick: async (e) => {
      const btn = e.currentTarget;
      for (const x of actions.querySelectorAll('button')) x.disabled = true;
      btn.textContent = 'Saving…';
      try {
        await api(`/intros/${intro.id}`, { method: 'PATCH', body: { status } });
        toast(status === 'accepted'
          ? `Accepted. Please introduce ${other?.name || 'them'} to ${p.full_name}, then mark it done.`
          : status === 'declined' ? 'Declined. The requester will see this.' : 'Marked as done.');
        await redraw();
        document.getElementById(dir === 'incoming' ? 'incoming-h' : 'outgoing-h')?.focus();
      } catch (err) {
        toast(err.message, { error: true });
        for (const x of actions.querySelectorAll('button')) x.disabled = false;
        btn.textContent = label;
      }
    },
  }, label);

  if (dir === 'incoming') {
    if (intro.status === 'pending') actions.append(act('accepted', 'Accept', 'btn btn-primary btn-sm'), act('declined', 'Decline'));
    if (intro.status === 'accepted') actions.append(act('done', 'Mark done', 'btn btn-primary btn-sm'), act('declined', 'Decline after all', 'btn btn-quiet btn-sm'));
  } else if (intro.status === 'accepted' || intro.status === 'pending') {
    actions.append(h('span', { class: 'muted small', style: { alignSelf: 'center' } },
      intro.status === 'accepted' ? `${other?.name || 'The introducer'} agreed and will connect you.` : 'Waiting for a reply.'));
    if (intro.status === 'accepted') actions.append(act('done', 'Mark done', 'btn btn-sm'));
  }
  if (actions.childNodes.length) card.append(actions);
  return card;
}


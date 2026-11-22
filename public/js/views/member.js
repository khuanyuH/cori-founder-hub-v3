// A member's profile page (#/members/<id>), or the member directory (#/members).
import { h, replace, plural, timeAgo, formatDate, safeUrl, safeLinkedIn, hostOf, richText } from '../dom.js';
import { api } from '../api.js';
import { state } from '../store.js';
import { loading, errorBox, emptyState, roleLabel, avatar } from '../components.js';
import { categoryLabel } from './forum.js';

export async function renderMember(ctx) {
  const { root } = ctx;
  const id = Number(ctx.parts[1]);
  if (!ctx.parts[1]) return renderDirectory(ctx);
  root.append(loading('Loading profile…'));
  let d;
  try { d = await api(`/members/${id}`); } catch (err) {
    if (!ctx.isCurrent()) return undefined;
    replace(root, err.status === 404 || err.status === 400 ? emptyState('Member not found', null, h('a', { class: 'btn', href: '#/members' }, 'See all members')) : errorBox(err, () => ctx.rerender()));
    return undefined;
  }
  if (!ctx.isCurrent()) return undefined;
  const m = d.member;
  ctx.setTitle(m.name);
  const li = safeLinkedIn(m.linkedin_url);
  const site = safeUrl(m.website_url);
  const stat = (n, label) => h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, Number(n).toLocaleString()), h('div', { class: 'stat-label' }, label));

  replace(root,
    h('p', null, h('a', { class: 'back-link', href: '#/members' }, '← Members')),
    h('div', { class: 'page-head' },
      h('div', { class: 'profile-head' }, avatar(m.name, 'xl'),
        h('div', null,
          h('p', { class: 'kicker' }, [roleLabel(m.role), m.org].filter(Boolean).join(' · ')),
          h('h1', null, m.name),
          m.headline ? h('p', null, m.headline) : null,
          h('p', { class: 'meta' }, m.location ? h('span', null, m.location) : null, h('span', null, `Joined ${formatDate(m.joined_at)}`),
            li ? h('a', { href: li, target: '_blank', rel: 'noopener noreferrer' }, 'LinkedIn ↗') : null,
            site ? h('a', { href: site, target: '_blank', rel: 'noopener noreferrer' }, `${hostOf(site)} ↗`) : null))),
      m.id === state.memberId ? h('a', { class: 'btn', href: '#/account' }, 'Edit profile') : null),
    h('div', { class: 'stats' }, stat(d.stats.connections, 'people in their network'), stat(d.stats.intros_made, 'introductions made'),
      stat(d.stats.posts, 'forum posts'), stat(d.stats.comments, 'forum replies')),
    h('div', { class: 'split section' },
      h('div', { class: 'stack' },
        m.bio ? h('section', null, h('h2', null, 'About'), richText(m.bio)) : null,
        d.business ? h('section', null, h('h2', null, d.business.name),
          d.business.description ? h('p', null, d.business.description) : null,
          h('dl', { class: 'facts-list' },
            d.business.geography ? [h('dt', null, 'Sells in'), h('dd', null, d.business.geography)] : null,
            d.business.needs ? [h('dt', null, 'Looking for'), h('dd', null, d.business.needs)] : null)) : null,
        !m.bio && !d.business ? h('p', { class: 'muted' }, m.id === state.memberId ? 'Add a headline and a short bio on your account page.' : `${m.name} did not add a bio yet.`) : null),
      h('div', { class: 'stack' },
        h('section', null, h('h2', null, 'Forum posts'),
          d.posts.length ? h('ul', { class: 'mini-list' }, d.posts.map((p) => h('li', null,
            h('a', { href: `#/forum/${p.id}` }, p.title),
            h('span', { class: 'muted small' }, `${categoryLabel(p.category)} · ${plural(p.comment_count, 'reply', 'replies')} · ${timeAgo(p.created_at)}`))))
            : h('p', { class: 'muted' }, 'No posts yet.')),
        h('section', null, h('h2', null, 'Open jobs'),
          d.jobs.length ? h('ul', { class: 'mini-list' }, d.jobs.map((j) => h('li', null,
            h('a', { href: `#/jobs/${j.id}` }, j.title),
            h('span', { class: 'muted small' }, [j.company, j.location].filter(Boolean).join(' · ')))))
            : h('p', { class: 'muted' }, 'No open jobs.')))));
  return undefined;
}

async function renderDirectory(ctx) {
  const { root } = ctx;
  const slot = h('div', null, loading('Loading members…'));
  root.append(h('div', { class: 'page-head' }, h('div', null, h('p', { class: 'kicker' }, 'Members'), h('h1', null, 'Who is in the hub'),
    h('p', null, 'Founders, board members, CORI staff and mentors who share their networks.'))), slot);
  let members;
  try { members = await api('/members'); } catch (err) { if (ctx.isCurrent()) replace(slot, errorBox(err, () => ctx.rerender())); return; }
  if (!ctx.isCurrent()) return;
  replace(slot, h('ul', { class: 'member-list' }, members.map((m) => h('li', null, h('a', { class: 'member-btn', href: `#/members/${m.id}` },
    avatar(m.name, 'lg'),
    h('span', { class: 'm-body' },
      h('span', { class: 'm-name' }, m.name),
      h('span', { class: 'm-org' }, m.headline || m.org || ''),
      h('span', { class: 'm-meta' }, h('span', { class: 'tag' }, roleLabel(m.role)), plural(m.connection_count, 'connection'))))))));
}

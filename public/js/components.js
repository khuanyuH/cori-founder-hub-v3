// Shared UI pieces: badges, strength meter, result (lead) cards, dialogs, and loading/empty/error states.
import { h, nextId, safeLinkedIn } from './dom.js';
import { api } from './api.js';
import { state, toast, openIntrosFor, refreshIntros } from './store.js';

export const SOURCE_LABELS = {
  linkedin: 'LinkedIn',
  google_contacts: 'Google Contacts',
  outlook_contacts: 'Outlook',
  vcard: 'Phone contacts',
  calendar: 'Calendar',
  email_headers: 'Email',
  manual: 'Added by hand',
  roster: 'Pasted list',
};

export const LEAD_TYPE_LABELS = {
  customer: 'Customer',
  connector: 'Connector',
  partner: 'Partner',
  investor: 'Investor',
  talent: 'Talent',
};
export const LEAD_TYPE_PLURAL = {
  customer: 'Customers',
  connector: 'Connectors',
  partner: 'Partners',
  investor: 'Investors',
  talent: 'Talent',
};

export const STRENGTH = {
  strong: { level: 3, label: 'Strong tie' },
  some: { level: 2, label: 'Some contact' },
  weak: { level: 1, label: 'Weak tie' },
};

export const ROLE_LABELS = { founder: 'Founder', board: 'Board', staff: 'CORI staff', mentor: 'Mentor', investor: 'Investor' };

export function sourceLabel(s) { return SOURCE_LABELS[s] || s; }
export function roleLabel(r) { return ROLE_LABELS[r] || r || ''; }

const AVATAR_TONES = ['teal', 'purple', 'red', 'yellow', 'green', 'ink'];

/** Hexagon with initials (the CORI mark is a hexagon). The tone is stable per name. */
export function avatar(name, size = 'md') {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] || '?') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return h('span', { class: `avatar avatar-${size} tone-${AVATAR_TONES[hash % AVATAR_TONES.length]}`, 'aria-hidden': 'true' }, initials);
}

/** "Name · Role" link to a member's profile. */
export function memberLink(m, { withRole = true } = {}) {
  if (!m) return h('span', { class: 'muted' }, 'a former member');
  return h('span', { class: 'byline' },
    h('a', { href: `#/members/${m.id}`, class: 'byline-name' }, m.name),
    withRole && m.role ? h('span', { class: 'byline-role' }, roleLabel(m.role)) : null);
}

export function leadTypeBadge(type) {
  if (!type) return null;
  return h('span', { class: `type-label type-${type}` }, LEAD_TYPE_LABELS[type] || type);
}

export function strengthMeter(strength) {
  const s = STRENGTH[strength] || STRENGTH.weak;
  return h('span', { class: 'strength' },
    h('span', { class: 'bars', 'data-level': s.level, 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    s.label);
}

export function loading(text = 'Loading…') {
  return h('p', { class: 'loading', role: 'status' }, text);
}

export function errorBox(err, retry) {
  const msg = err?.message || String(err);
  return h('div', { class: 'alert alert-error', role: 'alert' },
    h('strong', null, 'Sorry, something went wrong.'), h('br'), msg,
    retry ? h('div', null, h('button', { type: 'button', class: 'btn btn-sm', onclick: retry }, 'Try again')) : null);
}

export function emptyState(title, body, ...actions) {
  return h('div', { class: 'state' }, h('h2', null, title), body ? h('p', null, body) : null, ...actions);
}

// ---------- Dialogs ----------

/** Modal built on <dialog>: native focus handling and Esc to close. Returns { dialog, close }. */
export function openDialog({ title, body, actions, onClose, labelledBy }) {
  const titleId = labelledBy || nextId('dlg-title');
  const dlg = h('dialog', { 'aria-labelledby': titleId },
    h('div', { class: 'dialog-body' }, h('h2', { id: titleId }, title), body),
    actions ? h('div', { class: 'dialog-actions' }, actions) : null);
  const prevFocus = document.activeElement;
  document.body.append(dlg);
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (prevFocus && typeof prevFocus.focus === 'function' && document.contains(prevFocus)) prevFocus.focus();
    onClose?.(dlg.returnValue);
  });
  // Click on the backdrop closes the dialog.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('cancel'); });
  dlg.showModal();
  return { dialog: dlg, close: (v) => dlg.close(v) };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const ok = h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => { result = true; d.close('ok'); } }, confirmLabel);
    const cancel = h('button', { type: 'button', class: 'btn', onclick: () => d.close('cancel') }, 'Cancel');
    const d = openDialog({ title, body: h('p', null, message), actions: [cancel, ok], onClose: () => resolve(result) });
    cancel.focus();
  });
}

// ---------- Intro request ----------

function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }
function firstSentence(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  const m = t.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : t).trim().replace(/([^.!?])$/, '$1.');
}

const NON_TOPICAL = /^(strong tie|some contact|weak tie|already in your own network|based in|known by|saved by you|\d+ hub members|.*knows them)/i;

function whyText(result) {
  const reasons = (result.reasons || []).filter((r) => !NON_TOPICAL.test(r));
  if (!reasons.length) return '';
  const r = reasons.slice(0, 2).map((x) => x.replace(/:\s+/g, ', ')).join('; ');
  return r.charAt(0).toLowerCase() + r.slice(1);
}

export function draftIntroMessage(result, introducer) {
  const me = state.me?.member;
  const biz = state.me?.business;
  const p = result.person;
  const role = [p.title, p.company].filter(Boolean).join(' at ');
  const bizName = biz?.name || me?.org || '';
  const what = firstSentence(biz?.description);
  const why = whyText(result);
  // A description that is already a sentence ("We help...") stands alone; a noun phrase follows a colon.
  const intro = !what ? '.'
    : /^(we|our|i|my)\b/i.test(what) || (bizName && what.toLowerCase().startsWith(bizName.toLowerCase())) ? `. ${what}`
      : `: ${what.charAt(0).toLowerCase()}${what.slice(1)}`;
  const lines = [
    `Hi ${firstName(introducer.name)},`,
    '',
    `I'm ${firstName(me?.name)}${bizName ? ` from ${bizName}` : ''}${intro}`,
    '',
    `I saw in the CORI Founder Hub that you know ${p.full_name}${role ? ` (${role})` : ''}.`
      + (why ? ` Why I'm asking: ${why.charAt(0).toUpperCase()}${why.slice(1)}.` : ''),
    '',
    "Would you be open to a short introduction? I'm happy to send a two-line blurb you can forward.",
    '',
    'Thank you,',
    firstName(me?.name),
  ];
  return lines.join('\n');
}

/** Opens the "Request intro" dialog. Resolves with the created intro or null. */
export function requestIntroDialog(result) {
  return new Promise((resolve) => {
    const introducers = (result.known_by || []).filter((k) => k.member_id !== state.memberId);
    if (!introducers.length) { resolve(null); return; }
    let chosen = introducers[0];
    let edited = false;
    let created = null;
    const p = result.person;
    const msgId = nextId('intro-msg');
    const textarea = h('textarea', { id: msgId, rows: 11, required: true, maxlength: 4000 });
    textarea.value = draftIntroMessage(result, chosen);
    textarea.addEventListener('input', () => { edited = true; });
    const errorSlot = h('div');

    let picker = null;
    if (introducers.length > 1) {
      const name = nextId('introducer');
      picker = h('fieldset', null,
        h('legend', null, `Who should introduce you? ${introducers.length} members know ${p.full_name}.`),
        h('ul', { class: 'radio-list' }, introducers.map((k, i) => {
          const input = h('input', { type: 'radio', name, value: String(k.member_id), checked: i === 0 });
          input.addEventListener('change', () => {
            chosen = k;
            if (!edited) textarea.value = draftIntroMessage(result, chosen);
          });
          return h('li', null, h('label', { class: 'radio-card' }, input,
            h('span', null,
              h('span', { class: 'known-name' }, k.name), ' ',
              h('span', { class: 'known-role' }, roleLabel(k.role)), h('br'),
              strengthMeter(k.strength), ' ',
              h('span', { class: 'known-sources' }, `via ${k.sources.map(sourceLabel).join(', ')}`),
              k.note ? h('span', { class: 'known-note', style: { display: 'block' } }, `“${k.note}”`) : null)));
        })));
    } else {
      picker = h('p', null, h('strong', null, chosen.name), ` (${roleLabel(chosen.role)}) knows ${p.full_name}: `,
        strengthMeter(chosen.strength),
        chosen.note ? h('span', { class: 'known-note', style: { display: 'block' } }, `“${chosen.note}”`) : null);
    }

    const form = h('form', { id: nextId('intro-form') },
      h('p', { class: 'muted small' },
        `${p.full_name}${p.title ? `, ${p.title}` : ''}${p.company ? `, ${p.company}` : ''}`),
      picker,
      h('div', { class: 'field' },
        h('label', { for: msgId }, 'Your message to the introducer'),
        h('span', { class: 'hint' }, 'Prefilled from your business profile. Edit freely; it goes only to the member you pick, who decides whether to make the introduction.'),
        textarea),
      errorSlot);

    const send = h('button', { type: 'submit', class: 'btn btn-primary', form: form.id }, 'Send request');
    const cancel = h('button', { type: 'button', class: 'btn', onclick: () => d.close('cancel') }, 'Cancel');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = textarea.value.trim();
      if (!message) { errorSlot.replaceChildren(h('div', { class: 'alert alert-error', role: 'alert' }, 'Please write a short message.')); textarea.focus(); return; }
      send.disabled = true;
      send.textContent = 'Sending…';
      try {
        created = await api('/intros', { method: 'POST', body: { person_id: p.id, introducer_id: chosen.member_id, message } });
        await refreshIntros().catch(() => {});
        toast(`Intro request sent to ${chosen.name}.`);
        d.close('ok');
      } catch (err) {
        errorSlot.replaceChildren(h('div', { class: 'alert alert-error', role: 'alert' }, err.message));
        send.disabled = false;
        send.textContent = 'Send request';
      }
    });
    const d = openDialog({ title: `Request an intro to ${p.full_name}`, body: form, actions: [cancel, send], onClose: () => resolve(created) });
    (picker.querySelector?.('input') || textarea).focus();
  });
}

// ---------- Result / lead card ----------

/**
 * Render one Result (search hit, suggested lead, or saved lead).
 * opts: { showPersona, allowDismiss, onDismiss(card, result), onChange() }
 */
export function resultCard(result, opts = {}) {
  const p = result.person;
  const knownBy = result.known_by || [];
  const mine = knownBy.find((k) => k.member_id === state.memberId);
  const introducers = knownBy.filter((k) => k.member_id !== state.memberId);
  const nameId = nextId('lead');
  const card = h('article', { class: `card lead${mine ? ' lead--own' : ''}`, 'aria-labelledby': nameId, dataset: { personId: p.id } });

  const role = [p.title, p.company].filter(Boolean);
  const li = safeLinkedIn(p.linkedin_url);
  card.append(h('div', { class: 'lead-head' },
    h('div', null,
      h('h3', { class: 'lead-name', id: nameId }, p.full_name),
      role.length ? h('p', { class: 'lead-role' }, p.title || '', p.title && p.company ? ', ' : '', p.company ? h('strong', null, p.company) : '') : null,
      p.location ? h('p', { class: 'lead-loc' }, p.location) : null),
    h('div', { class: 'lead-badges' },
      leadTypeBadge(result.lead_type),
      mine ? h('span', { class: 'badge badge-own' }, 'In your network') : null)));

  if (opts.showPersona && result.persona) card.append(h('p', { class: 'lead-persona' }, `Looking for: ${result.persona}`));

  if (mine) {
    card.append(h('p', { class: 'own-note' },
      `You already know ${firstName(p.full_name)} (${(STRENGTH[mine.strength] || STRENGTH.weak).label.toLowerCase()}, via ${mine.sources.map(sourceLabel).join(', ')}). No intro needed: reach out directly.`));
  }

  const reasons = (result.reasons || []).filter((r) => !(mine && /already in your own network/i.test(r)));
  if (reasons.length) {
    card.append(h('div', null,
      h('p', { class: 'visually-hidden' }, 'Why this person'),
      h('ul', { class: 'reasons' }, reasons.map((r) => h('li', null, r)))));
  }

  if (introducers.length) {
    card.append(h('div', null,
      h('p', { class: 'known-label' }, introducers.length === 1 ? 'Who can introduce you' : `${introducers.length} members can introduce you`),
      h('ul', { class: 'known-list' }, introducers.map((k) => h('li', { class: 'known' },
        h('div', { class: 'known-top' },
          h('span', { class: 'known-name' }, k.name),
          h('span', { class: 'known-role' }, roleLabel(k.role)),
          strengthMeter(k.strength),
          h('span', { class: 'known-sources' }, k.sources.map(sourceLabel).join(' · '))),
        k.note ? h('p', { class: 'known-note' }, `“${k.note}”`) : null)))));
  }

  const actions = h('div', { class: 'lead-actions' });
  card.append(actions);

  const renderActions = () => {
    actions.replaceChildren();
    if (!mine && introducers.length) {
      const open = openIntrosFor(p.id);
      if (open.length) {
        actions.append(h('p', { class: 'intro-status' },
          `Intro ${open[0].status === 'accepted' ? 'accepted' : 'requested'} via ${open[0].introducer?.name || 'a member'}`));
        if (introducers.length > open.length) {
          actions.append(h('button', { type: 'button', class: 'btn btn-sm', onclick: doIntro }, 'Ask someone else'));
        }
      } else {
        actions.append(h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: doIntro }, 'Request intro'));
      }
    }
    if (li) {
      actions.append(h('a', { class: 'btn btn-quiet btn-sm', href: li, target: '_blank', rel: 'noopener noreferrer' },
        'LinkedIn', h('span', { class: 'visually-hidden' }, ` profile of ${p.full_name} (opens in a new tab)`)));
    }
    // Save and Dismiss stay together at the end of the row (and wrap as a pair on narrow cards).
    const end = h('span', { class: 'lead-actions-end' });
    actions.append(end);
    const saved = state.savedIds.has(p.id);
    end.append(h('button', { type: 'button', class: 'btn btn-sm', 'aria-pressed': saved ? 'true' : 'false', onclick: doSave },
      saved ? 'Saved' : 'Save', h('span', { class: 'visually-hidden' }, ` ${p.full_name}`)));
    if (opts.allowDismiss) {
      end.append(h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onclick: doDismiss },
        'Dismiss', h('span', { class: 'visually-hidden' }, ` ${p.full_name}`)));
    }
  };

  async function doIntro() {
    const created = await requestIntroDialog(result);
    if (created) {
      renderActions();
      // The button that opened the dialog is gone; keep keyboard focus on the card.
      const status = actions.querySelector('.intro-status');
      if (status) { status.setAttribute('tabindex', '-1'); status.focus(); }
    }
  }

  async function doSave(e) {
    const btn = e.currentTarget;
    const wasSaved = state.savedIds.has(p.id);
    btn.disabled = true;
    try {
      await api(`/leads/${p.id}/feedback`, { method: 'POST', body: { verdict: wasSaved ? 'clear' : 'saved' } });
      if (wasSaved) state.savedIds.delete(p.id); else state.savedIds.add(p.id);
      toast(wasSaved ? `Removed ${p.full_name} from saved leads.` : `Saved ${p.full_name}.`);
      renderActions();
      opts.onChange?.();
      actions.querySelector('[aria-pressed]')?.focus();
    } catch (err) {
      toast(err.message, { error: true });
      btn.disabled = false;
    }
  }

  async function doDismiss(e) {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await api(`/leads/${p.id}/feedback`, { method: 'POST', body: { verdict: 'dismissed' } });
      state.savedIds.delete(p.id);
      opts.onDismiss?.(card, result);
      toast(`Dismissed ${p.full_name}. You will not see them in suggestions.`, {
        action: {
          label: 'Undo',
          fn: async () => {
            try {
              await api(`/leads/${p.id}/feedback`, { method: 'POST', body: { verdict: 'clear' } });
              opts.onUndoDismiss?.(result);
            } catch (err) { toast(err.message, { error: true }); }
          },
        },
      });
    } catch (err) {
      toast(err.message, { error: true });
      btn.disabled = false;
    }
  }

  renderActions();
  return card;
}

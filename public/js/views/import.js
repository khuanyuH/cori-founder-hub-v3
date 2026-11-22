// Import wizard: per-source export instructions, upload, preview, confirm. Plus paste-a-list and add-one-person.
import { h, replace, nextId, plural } from '../dom.js';
import { api } from '../api.js';
import { refreshMe, toast } from '../store.js';
import { loading, errorBox, sourceLabel, SOURCE_LABELS } from '../components.js';

const MAX_BYTES = 200 * 1024 * 1024;
const b = (t) => h('strong', null, t);
// URLs and file names: plain emphasized text, not code styling.
const c = (t) => h('span', { class: 'path' }, t);

const SOURCES = [
  {
    id: 'linkedin',
    title: 'LinkedIn connections',
    exportFrom: 'LinkedIn',
    featured: true,
    summary: 'Your professional network. The single most useful source: start here.',
    accept: '.zip,.csv',
    upload: 'The LinkedIn .zip as is, or the Connections.csv inside it',
    steps: [
      ['On a ', b('desktop browser'), ' (the mobile app cannot do this), open ', c('linkedin.com/mypreferences/d/download-my-data'), '. Or click your photo (', b('Me'), ') > ', b('Settings & Privacy'), ' > ', b('Data privacy'), ' > ', b('Download your data'), '.'],
      ['Select the first option: ', b('"Download larger data archive, including connections..."'), '. If the second option ("Want something in particular?") shows a ', b('Connections'), ' box on your account, you can tick only that box instead. Many accounts do not show it.'],
      ['Click ', b('Request archive'), '. LinkedIn may ask for your password.'],
      ['LinkedIn emails you a download link. The larger archive can take up to 24 hours. A second email can arrive later with more files; the first one is enough if it holds ', c('Connections.csv'), '.'],
      ['Download the file from the email, or return to the same LinkedIn page and click ', b('Download archive'), '. ', b('The link expires after 72 hours.')],
      ['Upload the ', b('.zip as is'), ' in Step 2. The hub opens only ', c('Connections.csv'), ' and ignores every other file in the archive (messages, profile, invitations). To keep the rest off this site entirely, unzip the archive and upload only ', c('Connections.csv'), '.'],
    ],
    note: 'Most email addresses in this file are blank by design: LinkedIn only includes them when your connections allow it. The hub does not use contact emails for anything you or others can see.',
  },
  {
    id: 'google_contacts',
    title: 'Google Contacts',
    summary: 'People in your Gmail address book, including people you have emailed.',
    accept: '.csv,.vcf',
    upload: 'The exported contacts.csv (Google CSV) or a .vcf file',
    steps: [
      ['Go to ', c('contacts.google.com'), '.'],
      ['Click ', b('Export'), ' (in the left menu, or select contacts and use the ', b('⋮'), ' menu).'],
      ['Choose ', b('Google CSV'), ' (vCard also works) and click ', b('Export'), '.'],
      ['Upload the downloaded file in Step 2.'],
    ],
    note: 'Tip: also export "Other contacts" (in the left menu of Google Contacts). These are people you have emailed but never saved, and are often your real working relationships.',
  },
  {
    id: 'outlook_contacts',
    title: 'Outlook contacts',
    exportFrom: 'Outlook',
    summary: 'Your Outlook or Microsoft 365 address book.',
    accept: '.csv',
    upload: 'The exported contacts.csv',
    steps: [
      ['Open ', b('Outlook on the web'), ' and go to ', b('People'), '.'],
      ['Choose ', b('Manage contacts'), ' > ', b('Export contacts'), '.'],
      ['Pick all contacts, format ', b('CSV'), ', and click ', b('Export'), '.'],
      ['Upload the downloaded file in Step 2.'],
    ],
  },
  {
    id: 'vcard',
    title: 'Apple and phone contacts',
    exportFrom: 'your contacts app',
    summary: 'Contacts from a Mac, iPhone (via iCloud) or Android phone.',
    accept: '.vcf',
    upload: 'A .vcf file (one file with many contacts is fine)',
    steps: [
      [b('Mac Contacts:'), ' select all contacts, then ', b('File'), ' > ', b('Export'), ' > ', b('Export vCard'), '.'],
      [b('iCloud.com:'), ' open ', b('Contacts'), ', select all, then ', b('Export vCard'), '.'],
      [b('Android:'), ' open ', b('Contacts'), ' > ', b('Fix & manage'), ' > ', b('Export to file'), '.'],
      ['Upload the .vcf file in Step 2.'],
    ],
  },
  {
    id: 'calendar',
    title: 'Calendar',
    exportFrom: 'your calendar',
    summary: 'People you actually meet. Frequent meetings mean stronger relationships.',
    accept: '.ics',
    upload: 'An .ics calendar file',
    steps: [
      ['In ', b('Google Calendar'), ', open ', b('Settings'), ' > ', b('Import & export'), ' > ', b('Export'), '. (Google Takeout > Calendar also works.)'],
      ['Google downloads a .zip. Unzip it and pick the .ics file for your main calendar.'],
      ['Upload the .ics file in Step 2.'],
    ],
    note: 'Why bother: someone you have met 5 or more times counts as a strong tie, 2 to 4 times as some contact. Strong ties make your introductions more valuable to founders. Only names of meeting participants are used; your own address is left out if you gave it when you joined.',
  },
  {
    id: 'email_headers',
    title: 'Email correspondents',
    exportFrom: 'Gmail',
    summary: 'Who you correspond with, from the From/To/Cc lines only.',
    accept: '.mbox',
    upload: 'An .mbox file, up to 200 MB',
    steps: [
      ['Go to ', b('Google Takeout'), ' (', c('takeout.google.com'), '), click ', b('Deselect all'), ', then tick only ', b('Mail'), '.'],
      ['Optional: under "All Mail data included", pick a single label (for example Sent) to keep the file small.'],
      ['Create the export and download it when Google emails you, then unzip it.'],
      ['Upload the .mbox file in Step 2.'],
    ],
    note: 'Only the From, To and Cc headers are read. Message subjects and bodies are never read or stored. Mail archives are large: the limit is 200 MB per file, so export one label if yours is bigger. Automated senders (noreply, notifications) are skipped.',
  },
  {
    id: 'roster',
    title: 'Paste a list or roster',
    summary: 'Board lists, event attendee lists, CRM exports.',
    kind: 'paste',
  },
  {
    id: 'manual',
    title: 'Add one person',
    summary: 'Someone you know well and would vouch for. Counts as a strong tie.',
    kind: 'manual',
  },
];

export async function renderImport(ctx) {
  const sourceId = ctx.parts[1];
  const src = SOURCES.find((s) => s.id === sourceId);
  if (sourceId && src) return renderSource(ctx, src);
  return renderLanding(ctx);
}

function privacyPanel() {
  return h('aside', { class: 'panel privacy', 'aria-labelledby': 'privacy-h' },
    h('h2', { id: 'privacy-h' }, 'What happens to your contacts'),
    h('ul', null,
      h('li', null, 'Stored: name, title, company, location, LinkedIn URL, which source they came from, how strong the tie is, and any note you add.'),
      h('li', null, b('Contact email addresses and phone numbers are never shown to anyone'), ', including you and other members. Emails are kept only to avoid duplicates; phone numbers are not read at all.'),
      h('li', null, 'Other members can see that you know someone, so they can ask you for an introduction. The only action anyone can take is an intro request, which comes to you. You accept or decline.'),
      h('li', null, 'Nobody is contacted automatically. Everything runs on this hub; files are processed and then discarded.'),
      h('li', null, 'You can remove any source at any time from ', h('a', { href: '#/network' }, 'My network'), '.')));
}

function renderLanding(ctx) {
  ctx.root.append(
    h('div', { class: 'page-head' }, h('div', null,
      h('h1', null, 'Import your contacts'),
      h('p', null, 'The more of your network you bring, the more warm introductions founders can find, and the more they can help you in return. Start with LinkedIn; add others to show which relationships are strong.'))),
    h('div', { class: 'split' },
      h('div', { class: 'grid grid-3', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' } },
        SOURCES.map((s) => h('div', { class: `card source-card${s.featured ? ' featured' : ''}` },
          h('div', { class: 'card-title' }, h('h2', { style: { margin: 0 } }, s.title), s.featured ? h('span', { class: 'badge badge-start' }, 'Start here') : null),
          h('p', null, s.summary),
          h('a', { class: `btn btn-sm${s.featured ? ' btn-primary' : ''}`, href: `#/import/${s.id}` },
            s.kind === 'paste' ? 'Paste a list' : s.kind === 'manual' ? 'Add a person' : 'Import',
            h('span', { class: 'visually-hidden' }, ` ${s.title}`))))),
      h('div', { class: 'sticky' }, privacyPanel())));
}

function sourceHead(src) {
  return h('div', null,
    h('p', { class: 'small', style: { margin: '0 0 .75rem' } }, h('a', { class: 'back-link', href: '#/import' }, '← All sources')),
    h('div', { class: 'page-head' }, h('div', null,
      h('h1', null, src.title),
      h('p', null, src.summary))));
}

function stepper(active) {
  const steps = ['Export', 'Upload', 'Review', 'Done'];
  const idx = steps.indexOf(active);
  return h('ol', { class: 'stepper', 'aria-label': 'Import progress' }, steps.map((s, i) =>
    h('li', { 'aria-current': i === idx ? 'step' : null, class: i < idx ? 'done' : null },
      h('span', { class: 'step-dot', 'aria-hidden': 'true' }, i < idx ? '✓' : String(i + 1)),
      h('span', null, s), i < idx ? h('span', { class: 'visually-hidden' }, ' (done)') : null)));
}

// ---------- File sources ----------

function renderSource(ctx, src) {
  if (src.kind === 'paste') return renderPaste(ctx, src);
  if (src.kind === 'manual') return renderManual(ctx, src);
  const { root } = ctx;
  const stepSlot = h('div');
  const work = h('div', { class: 'stack' });
  root.append(sourceHead(src), stepSlot,
    h('div', { class: 'split' },
      exportSteps(src, work),
      h('div', { class: 'stack' }, work, privacyPanel())));

  let override = '';
  const showUpload = (errMsg) => {
    replace(stepSlot, stepper('Upload'));
    const inputId = nextId('file');
    const input = h('input', { id: inputId, type: 'file', accept: src.accept, 'aria-describedby': `${inputId}-d` });
    const zone = h('label', { class: 'dropzone', for: inputId },
      input,
      h('strong', null, 'Drop your file here, or click to choose'),
      h('span', { id: `${inputId}-d` }, `${src.upload}. Max 200 MB.`));
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const f = e.dataTransfer?.files?.[0];
      if (f) handleFile(f);
    });
    input.addEventListener('change', () => { if (input.files?.[0]) handleFile(input.files[0]); });
    const overrideId = nextId('as');
    const sel = h('select', { id: overrideId, style: { width: 'auto' } },
      h('option', { value: '' }, 'Detect automatically'),
      Object.entries(SOURCE_LABELS).filter(([id]) => !['manual', 'roster'].includes(id)).map(([id, label]) => h('option', { value: id, selected: override === id }, label)));
    sel.addEventListener('change', () => { override = sel.value; });
    replace(work, h('section', { class: 'card', 'aria-labelledby': 'upload-h' },
      h('h2', { id: 'upload-h' }, 'Step 2: upload'),
      errMsg ? h('div', { class: 'alert alert-error', role: 'alert' }, errMsg) : null,
      zone,
      h('div', { class: 'row', style: { marginTop: '.75rem' } },
        h('label', { for: overrideId, class: 'small' }, 'This file is from'), sel,
        h('span', { class: 'muted small' }, 'The hub recognises most files on its own. Change this only if it guesses wrong.')),
      h('p', { class: 'muted small', style: { marginTop: '.75rem' } }, 'Nothing is saved until you review and confirm.')));
  };

  const handleFile = async (file) => {
    if (file.size > MAX_BYTES) { showUpload(`“${file.name}” is ${(file.size / 1048576).toFixed(0)} MB. The limit is 200 MB; export a smaller part (for example one mail label).`); return; }
    replace(work, h('section', { class: 'card' }, loading(`Reading “${file.name}”…`)));
    replace(stepSlot, stepper('Review'));
    let preview;
    try {
      preview = await api('/import/preview', { method: 'POST', form: formFor(file, override) });
    } catch (err) {
      if (ctx.isCurrent()) showUpload(err.message);
      return;
    }
    if (!ctx.isCurrent()) return;
    showPreview(file, preview);
  };

  const showPreview = (file, preview) => {
    const confirmBtn = h('button', { type: 'button', class: 'btn btn-primary', disabled: !preview.parsed }, `Import ${plural(preview.parsed, 'contact')}`);
    const mismatch = preview.source !== src.id && !override;
    replace(work, h('section', { class: 'card', 'aria-labelledby': 'review-h' },
      h('h2', { id: 'review-h' }, 'Step 3: review before importing'),
      previewSummary(preview, file.name),
      mismatch ? h('div', { class: 'alert alert-warn' }, `This file looks like ${sourceLabel(preview.source)}, not ${sourceLabel(src.id)}. It will be imported as ${sourceLabel(preview.source)}. If that is wrong, choose a different file and set where it is from.`) : null,
      !preview.parsed ? h('div', { class: 'alert alert-error', role: 'alert' }, 'No usable contacts were found in this file. Check that it is the right export.') : null,
      h('div', { class: 'row', style: { marginTop: '1rem' } },
        confirmBtn,
        h('button', { type: 'button', class: 'btn', onclick: () => showUpload() }, 'Choose a different file'))));
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Importing…';
      try {
        const result = await api('/import', { method: 'POST', form: formFor(file, override || preview.source) });
        if (!ctx.isCurrent()) return;
        refreshMe().catch(() => {});
        showDone(result);
      } catch (err) {
        if (!ctx.isCurrent()) return;
        confirmBtn.disabled = false;
        confirmBtn.textContent = `Import ${plural(preview.parsed, 'contact')}`;
        work.querySelector('section').append(h('div', { class: 'alert alert-error', role: 'alert', style: { marginTop: '1rem' } }, err.message));
      }
    });
    confirmBtn.focus();
  };

  const showDone = (result) => {
    replace(stepSlot, stepper('Done'));
    replace(work, doneCard(result, () => showUpload()));
    work.querySelector('h2')?.focus();
  };

  showUpload();
}

// Step 1 card. On phones (CSS, <= 600px) the steps collapse behind a toggle so the upload box is close;
// they start open the first time a member opens this source and collapsed after that. Desktop is unaffected.
function exportSteps(src, uploadArea) {
  const seenKey = `hub.import.seen.${src.id}`;
  let seen = false;
  try { seen = localStorage.getItem(seenKey) === '1'; localStorage.setItem(seenKey, '1'); } catch { /* storage unavailable */ }
  const bodyId = nextId('export-steps');
  const toggle = h('button', { type: 'button', class: 'btn btn-sm btn-quiet export-toggle', 'aria-controls': bodyId });
  const card = h('section', { class: 'card export-card', 'aria-labelledby': 'export-h' },
    h('h2', { id: 'export-h' }, 'Step 1: export from ', src.exportFrom || src.title),
    h('div', { class: 'export-actions' },
      h('button', { type: 'button', class: 'btn btn-sm export-skip', onclick: () => {
        setOpen(false);
        uploadArea.scrollIntoView({ block: 'start' });
        uploadArea.querySelector('input[type="file"]')?.focus({ preventScroll: true });
      } }, 'I already have my file ↓'),
      toggle),
    h('div', { id: bodyId, class: 'export-body' },
      h('ol', { class: 'steps' }, src.steps.map((s) => h('li', null, s))),
      src.note ? h('p', { class: 'note-box' }, src.note) : null));
  const setOpen = (open) => {
    card.classList.toggle('collapsed', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide steps' : 'Show steps';
  };
  toggle.addEventListener('click', () => setOpen(card.classList.contains('collapsed')));
  setOpen(!seen);
  return card;
}

function formFor(file, source) {
  const fd = new FormData();
  fd.append('file', file, file.name);
  if (source) fd.append('source', source);
  return fd;
}

function previewSummary(preview, fileName) {
  const sample = preview.sample || [];
  const showDate = sample.some((r) => r.connected_on);
  const showCount = sample.some((r) => r.interaction_count);
  return h('div', null,
    h('div', { class: 'result-nums' },
      num(preview.parsed, 'contacts found'),
      num(preview.skipped ?? 0, 'rows skipped'),
      h('div', { class: 'stat' }, h('div', { class: 'stat-value', style: { fontSize: '1.05rem' } }, sourceLabel(preview.source)), h('div', { class: 'stat-label' }, 'where it came from'))),
    fileName ? h('p', { class: 'muted small' }, 'File: ', fileName) : null,
    preview.skipped ? h('p', { class: 'muted small' }, 'Skipped rows have no usable name (or are you).') : null,
    warnings(preview.warnings),
    sample.length ? h('div', null,
      h('h3', { style: { marginTop: '1.25rem' } }, `First ${sample.length} contacts`),
      h('div', { class: 'table-wrap' }, h('table', { class: 'responsive' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Name'), h('th', { scope: 'col' }, 'Title'), h('th', { scope: 'col' }, 'Company'),
          showDate ? h('th', { scope: 'col' }, 'Connected') : null, showCount ? h('th', { scope: 'col' }, 'Interactions') : null)),
        h('tbody', null, sample.map((r) => h('tr', null,
          h('td', { class: 'primary' }, r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ')),
          h('td', { 'data-label': 'Title' }, r.title || '—'),
          h('td', { 'data-label': 'Company' }, r.company || '—'),
          showDate ? h('td', { 'data-label': 'Connected' }, r.connected_on || '—') : null,
          showCount ? h('td', { 'data-label': 'Interactions' }, String(r.interaction_count || 0)) : null)))))) : null);
}

function warnings(list) {
  if (!list || !list.length) return null;
  return h('div', { class: 'alert alert-warn' }, h('strong', null, 'A few notes about this file'), h('ul', null, list.map((w) => h('li', null, w))));
}

function num(n, label) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, Number(n || 0).toLocaleString()), h('div', { class: 'stat-label' }, label));
}

function doneCard(result, again) {
  return h('section', { class: 'card', 'aria-labelledby': 'done-h' },
    h('h2', { id: 'done-h', tabindex: '-1' }, `Imported from ${sourceLabel(result.source)}`),
    h('div', { class: 'alert alert-ok' }, `${plural(result.parsed, 'contact')} processed. Thank you: founders can now find introductions through you.`),
    h('div', { class: 'result-nums' },
      num(result.new_people, 'new to the hub'),
      num(result.new_connections, 'new connections for you'),
      num(result.already_known, 'already known'),
      num(result.skipped ?? 0, 'skipped')),
    h('p', { class: 'muted small' }, '"New to the hub" means nobody else had brought this person in yet. "Already known" means you were already connected to them from this source.'),
    warnings(result.warnings),
    h('div', { class: 'row' },
      h('a', { class: 'btn btn-primary', href: '#/network' }, 'See my network'),
      h('a', { class: 'btn', href: '#/leads' }, 'See leads'),
      again ? h('button', { type: 'button', class: 'btn', onclick: again }, 'Import another file') : h('a', { class: 'btn', href: '#/import' }, 'Import another source')));
}

// ---------- Paste a list ----------

function renderPaste(ctx, src) {
  const { root } = ctx;
  const stepSlot = h('div', null, stepper('Upload'));
  const taId = nextId('paste');
  const ta = h('textarea', { id: taId, rows: 12, placeholder: 'Ruth Example, Director of Member Services, State Dental Society\nSam Sample - Dean of Workforce at Lakes Community College', 'aria-describedby': `${taId}-h` });
  const work = h('div');
  const err = h('div');
  const previewBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Preview');
  const form = h('form', { class: 'card' },
    h('div', { class: 'field' },
      h('label', { for: taId }, 'One person per line'),
      h('span', { class: 'hint', id: `${taId}-h` }, 'Format: ', c('Name, Title, Company'), ' or ', c('Name - Title at Company'), '. A CSV with a header row (Name, Title, Company or Organization) also works. Do not paste email addresses or phone numbers; they are removed anyway.'),
      ta),
    err,
    h('div', { class: 'row' }, previewBtn));
  root.append(sourceHead(src), stepSlot,
    h('div', { class: 'split' }, h('div', { class: 'stack' }, form, work), h('div', { class: 'sticky' }, privacyPanel())));

  let lastText = '';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = ta.value;
    replace(err);
    if (!text.trim()) { replace(err, h('div', { class: 'alert alert-error', role: 'alert' }, 'Paste at least one line.')); ta.focus(); return; }
    previewBtn.disabled = true;
    replace(work, h('div', { class: 'card' }, loading('Reading your list…')));
    try {
      const preview = await api('/import/paste', { method: 'POST', body: { text, preview: true } });
      if (!ctx.isCurrent()) return;
      lastText = text;
      replace(stepSlot, stepper('Review'));
      const confirmBtn = h('button', { type: 'button', class: 'btn btn-primary', disabled: !preview.parsed }, `Import ${plural(preview.parsed, 'person', 'people')}`);
      replace(work, h('section', { class: 'card', 'aria-labelledby': 'review-h' },
        h('h2', { id: 'review-h' }, 'Review before importing'),
        previewSummary(preview),
        h('div', { class: 'row', style: { marginTop: '1rem' } }, confirmBtn, h('span', { class: 'muted small' }, 'Edit the text above and preview again to fix anything.'))));
      confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Importing…';
        try {
          const result = await api('/import/paste', { method: 'POST', body: { text: lastText } });
          if (!ctx.isCurrent()) return;
          refreshMe().catch(() => {});
          replace(stepSlot, stepper('Done'));
          ta.value = '';
          replace(work, doneCard(result, null));
          work.querySelector('h2')?.focus();
        } catch (e2) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Import';
          work.firstChild.append(h('div', { class: 'alert alert-error', role: 'alert', style: { marginTop: '1rem' } }, e2.message));
        }
      });
      confirmBtn.focus();
    } catch (e2) {
      if (ctx.isCurrent()) replace(work, errorBox(e2));
    } finally {
      previewBtn.disabled = false;
    }
  });
}

// ---------- Add one person ----------

function renderManual(ctx, src) {
  const { root } = ctx;
  const ids = { n: nextId('mn'), t: nextId('mt'), co: nextId('mc'), l: nextId('ml'), u: nextId('mu'), note: nextId('mnote') };
  const err = h('div');
  const out = h('div');
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Add to my network');
  const form = h('form', { class: 'card' },
    h('div', { class: 'form-row' },
      h('div', { class: 'field' }, h('label', { for: ids.n }, 'Full name'), h('input', { id: ids.n, name: 'full_name', type: 'text', required: true, maxlength: 200 })),
      h('div', { class: 'field' }, h('label', { for: ids.l }, 'Location ', h('span', { class: 'hint' }, '(optional)')), h('input', { id: ids.l, name: 'location', type: 'text', maxlength: 200, placeholder: 'e.g. Concord, NH' }))),
    h('div', { class: 'form-row' },
      h('div', { class: 'field' }, h('label', { for: ids.t }, 'Title'), h('input', { id: ids.t, name: 'title', type: 'text', maxlength: 200 })),
      h('div', { class: 'field' }, h('label', { for: ids.co }, 'Organisation'), h('input', { id: ids.co, name: 'company', type: 'text', maxlength: 200 }))),
    h('div', { class: 'field' }, h('label', { for: ids.u }, 'LinkedIn profile URL ', h('span', { class: 'hint' }, '(optional, helps avoid duplicates)')),
      h('input', { id: ids.u, name: 'linkedin_url', type: 'url', maxlength: 500, placeholder: 'https://www.linkedin.com/in/…' })),
    h('div', { class: 'field' }, h('label', { for: ids.note }, 'How do you know them?'),
      h('span', { class: 'hint', id: `${ids.note}-h` }, 'This is your vouch. Founders see it next to your name, for example: "Served together on the state oral-health task force. Happy to introduce."'),
      h('textarea', { id: ids.note, name: 'note', rows: 3, maxlength: 2000, 'aria-describedby': `${ids.note}-h` })),
    h('p', { class: 'muted small' }, 'No email or phone needed: introductions go through you.'),
    err,
    submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v).trim()]).filter(([, v]) => v));
    replace(err);
    if (!body.full_name) { replace(err, h('div', { class: 'alert alert-error', role: 'alert' }, 'Full name is required.')); return; }
    submit.disabled = true;
    try {
      const res = await api('/contacts', { method: 'POST', body });
      if (!ctx.isCurrent()) return;
      refreshMe().catch(() => {});
      toast(`Added ${body.full_name} to your network.`);
      replace(out, h('div', { class: 'alert alert-ok', role: 'status' },
        `${body.full_name} is now in your network as a strong tie. `,
        res.created ? 'They are new to the hub.' : 'Other members already knew them; your vouch was added.', ' ',
        h('a', { href: '#/network' }, 'See my network')));
      form.reset();
      form.querySelector('input')?.focus();
    } catch (e2) {
      replace(err, h('div', { class: 'alert alert-error', role: 'alert' }, e2.message));
    } finally {
      submit.disabled = false;
    }
  });
  root.append(sourceHead(src),
    h('div', { class: 'split' }, h('div', { class: 'stack' }, form, out), h('div', { class: 'sticky' }, privacyPanel())));
}

// Jobs board. Routes: #/jobs, #/jobs/new, #/jobs/<id>, #/jobs/<id>/edit. Applying happens on the company's site.
import { h, replace, nextId, plural, timeAgo, richText, safeUrl, hostOf } from '../dom.js';
import { api, qs } from '../api.js';
import { state, toast } from '../store.js';
import { loading, errorBox, emptyState, memberLink, avatar, confirmDialog } from '../components.js';

const OPTIONS = {
  workplace: [['onsite', 'On site'], ['hybrid', 'Hybrid'], ['remote', 'Remote']],
  employment_type: [['full_time', 'Full time'], ['part_time', 'Part time'], ['contract', 'Contract'], ['fractional', 'Fractional'], ['internship', 'Internship']],
  job_function: [['engineering', 'Engineering'], ['product', 'Product'], ['design', 'Design'], ['sales', 'Sales'], ['marketing', 'Marketing'],
    ['operations', 'Operations'], ['finance', 'Finance'], ['customer', 'Customer success'], ['people', 'People and HR'], ['other', 'Other']],
};
const label = (key, id) => OPTIONS[key].find(([v]) => v === id)?.[1] || id;

function salaryText(j) {
  const k = (n) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
  if (j.salary_min && j.salary_max) return j.salary_min === j.salary_max ? k(j.salary_min) : `${k(j.salary_min)} to ${k(j.salary_max)}`;
  if (j.salary_min) return `From ${k(j.salary_min)}`;
  if (j.salary_max) return `Up to ${k(j.salary_max)}`;
  return '';
}

function facts(j) {
  const place = label('workplace', j.workplace);
  // "Remote / Remote" reads as a mistake: skip the workplace when the location already says it.
  const showPlace = !(j.location && j.location.toLowerCase().includes(place.toLowerCase()));
  return [j.location, showPlace ? place : '', label('employment_type', j.employment_type), salaryText(j), j.equity ? `${j.equity} equity` : '']
    .filter(Boolean);
}

function saveButton(j, onChange) {
  const btn = h('button', { type: 'button', class: 'btn btn-sm', 'aria-pressed': j.saved ? 'true' : 'false' }, j.saved ? 'Saved' : 'Save');
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    try {
      const res = await api(`/jobs/${j.id}/save`, { method: 'POST', body: { saved: !j.saved } });
      j.saved = res.saved;
      btn.textContent = j.saved ? 'Saved' : 'Save';
      btn.setAttribute('aria-pressed', j.saved ? 'true' : 'false');
      onChange?.();
    } catch (err) { toast(err.message, { error: true }); }
    btn.disabled = false;
  });
  return btn;
}

function applyLink(j, cls = 'btn btn-primary') {
  const href = safeUrl(j.apply_url);
  if (!href) return null;
  return h('a', { class: cls, href, target: '_blank', rel: 'noopener noreferrer' },
    'Apply', h('span', { class: 'ext', 'aria-hidden': 'true' }, ' ↗'), h('span', { class: 'visually-hidden' }, ` on ${hostOf(href)} (opens in a new tab)`));
}

export async function renderJobs(ctx) {
  const sub = ctx.parts[1];
  if (sub === 'new') return renderEditor(ctx, null);
  if (sub && /^\d+$/.test(sub)) return ctx.parts[2] === 'edit' ? renderEditor(ctx, Number(sub)) : renderJob(ctx, Number(sub));
  return renderList(ctx);
}

// ---------- List ----------
async function renderList(ctx) {
  const { root, params } = ctx;
  const view = ['saved', 'mine'].includes(params.get('view')) ? params.get('view') : 'all';
  const f = { q: (params.get('q') || '').trim() };
  for (const key of Object.keys(OPTIONS)) f[key] = OPTIONS[key].some(([v]) => v === params.get(key)) ? params.get(key) : '';
  const go = (over = {}) => ctx.navigate(`#/jobs${qs({ view: view === 'all' ? null : view, ...f, ...over })}`);

  const qId = nextId('jq');
  const select = (key, all) => {
    const id = nextId(key);
    const sel = h('select', { id }, h('option', { value: '' }, all), OPTIONS[key].map(([v, l]) => h('option', { value: v, selected: f[key] === v }, l)));
    sel.addEventListener('change', () => go({ [key]: sel.value }));
    return h('div', { class: 'field' }, h('label', { for: id }, { job_function: 'Role', workplace: 'Workplace', employment_type: 'Type' }[key]), sel);
  };
  const qInput = h('input', { id: qId, type: 'search', value: f.q, placeholder: 'Title, company or place', maxlength: 200 });
  const filterForm = h('form', { class: 'job-filters', role: 'search' },
    h('div', { class: 'field field-grow' }, h('label', { for: qId }, 'Search jobs'), qInput),
    select('job_function', 'All roles'), select('workplace', 'Anywhere'), select('employment_type', 'All types'),
    h('button', { type: 'submit', class: 'btn' }, 'Search'));
  filterForm.addEventListener('submit', (e) => { e.preventDefault(); go({ q: qInput.value.trim() }); });

  const statement = h('h1', { class: 'statement' }, 'Jobs at portfolio companies');
  const listSlot = h('div', null, loading('Loading jobs…'));
  const tab = (id, text) => h('a', { href: `#/jobs${qs({ view: id === 'all' ? null : id })}`, 'aria-current': view === id ? 'true' : null }, text);
  root.append(
    h('section', { class: 'hero' },
      h('div', null,
        h('p', { class: 'kicker' }, 'Jobs'),
        statement,
        h('p', { class: 'hero-sub' }, 'Open roles at companies in the CORI network, posted by the founders. You apply on the company’s own site.')),
      h('a', { class: 'btn btn-primary', href: '#/jobs/new' }, 'Post a job')),
    filterForm,
    h('div', { class: 'list-tools' },
      h('div', { class: 'sort-tabs', role: 'group', 'aria-label': 'Which jobs' }, tab('all', 'All open jobs'), tab('saved', 'Saved'), tab('mine', 'Posted by you')),
      h('span', { class: 'list-count muted small', role: 'status' })),
    listSlot);

  let data;
  try {
    data = await api(`/jobs${qs({ ...f, saved: view === 'saved' ? 1 : null, mine: view === 'mine' ? 1 : null, limit: 100 })}`);
  } catch (err) {
    if (ctx.isCurrent()) replace(listSlot, errorBox(err, () => ctx.rerender()));
    return;
  }
  if (!ctx.isCurrent()) return;
  if (data.open_jobs) statement.textContent = `${plural(data.open_jobs, 'open role')} at ${plural(data.open_companies, 'company', 'companies')}.`;
  root.querySelector('.list-count').textContent = plural(data.total, 'job');

  const filtered = f.q || f.job_function || f.workplace || f.employment_type;
  if (!data.items.length) {
    const [title, body] = view === 'saved' ? ['No saved jobs', 'Save a job to find it here later.']
      : view === 'mine' ? ['You have not posted a job', 'Post an opening at your company. It takes about two minutes.']
        : filtered ? ['No jobs match these filters', 'Clear a filter or use a broader search.']
          : ['No open jobs yet', 'Be the first to post an opening at your company.'];
    replace(listSlot, emptyState(title, body,
      filtered ? h('a', { class: 'btn', href: `#/jobs${qs({ view: view === 'all' ? null : view })}` }, 'Clear filters') : h('a', { class: 'btn btn-primary', href: '#/jobs/new' }, 'Post a job')));
    return;
  }
  replace(listSlot, h('ol', { class: 'job-list' }, data.items.map((j) => h('li', { class: `job-row${j.status === 'closed' ? ' job-row--closed' : ''}` },
    avatar(j.company, 'lg'),
    h('div', { class: 'job-row-main' },
      h('p', { class: 'job-company' }, j.company, h('span', { class: 'tag' }, label('job_function', j.job_function)),
        j.status === 'closed' ? h('span', { class: 'badge badge-declined' }, 'Closed') : null),
      h('h2', { class: 'job-title' }, h('a', { href: `#/jobs/${j.id}` }, j.title)),
      h('p', { class: 'facts' }, facts(j).map((x) => h('span', null, x))),
      h('p', { class: 'meta' }, h('span', null, `Posted ${timeAgo(j.created_at)} by`), memberLink(j.poster, { withRole: false }))),
    h('div', { class: 'job-row-actions' },
      j.mine ? h('a', { class: 'btn btn-sm', href: `#/jobs/${j.id}/edit` }, 'Edit') : saveButton(j, () => { if (view === 'saved') ctx.rerender(); }),
      h('a', { class: 'btn btn-sm btn-primary', href: `#/jobs/${j.id}` }, 'View'))))));
}

// ---------- One job ----------
async function renderJob(ctx, id) {
  const { root } = ctx;
  root.append(loading('Loading job…'));
  let j;
  try { j = await api(`/jobs/${id}`); } catch (err) {
    if (!ctx.isCurrent()) return;
    replace(root, h('p', null, h('a', { class: 'back-link', href: '#/jobs' }, '← Jobs')),
      err.status === 404 ? emptyState('This job is gone', 'The company removed the posting.', h('a', { class: 'btn', href: '#/jobs' }, 'See open jobs')) : errorBox(err, () => ctx.rerender()));
    return;
  }
  if (!ctx.isCurrent()) return;
  ctx.setTitle(`${j.title} at ${j.company}`);
  const site = safeUrl(j.company_url);
  const applyHost = hostOf(j.apply_url);

  const setStatus = async (status) => {
    try { await api(`/jobs/${id}`, { method: 'PATCH', body: { status } }); toast(status === 'closed' ? 'Job closed. It no longer shows on the board.' : 'Job reopened.'); ctx.rerender(); } catch (err) { toast(err.message, { error: true }); }
  };
  const owner = j.mine ? h('div', { class: 'owner-bar' },
    h('span', null, j.status === 'closed' ? 'You closed this job. Members cannot see it on the board.' : 'You posted this job.'),
    h('a', { class: 'btn btn-sm', href: `#/jobs/${id}/edit` }, 'Edit'),
    j.status === 'open'
      ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => setStatus('closed') }, 'Close job')
      : h('button', { type: 'button', class: 'btn btn-sm', onclick: () => setStatus('open') }, 'Reopen'),
    h('button', {
      type: 'button', class: 'btn btn-sm btn-danger',
      onclick: async () => {
        if (!await confirmDialog({ title: 'Delete this job?', message: 'The posting is removed for everyone. This cannot be undone.', confirmLabel: 'Delete job', danger: true })) return;
        try { await api(`/jobs/${id}`, { method: 'DELETE' }); toast('Job deleted.'); ctx.navigate('#/jobs?view=mine'); } catch (err) { toast(err.message, { error: true }); }
      },
    }, 'Delete')) : null;

  const row = (k, v) => (v ? [h('dt', null, k), h('dd', null, v)] : null);
  replace(root,
    h('p', null, h('a', { class: 'back-link', href: '#/jobs' }, '← Jobs')),
    owner,
    h('div', { class: 'job-full' },
      h('article', { class: 'job-full-main' },
        h('p', { class: 'job-company' }, avatar(j.company, 'md'), j.company, j.status === 'closed' ? h('span', { class: 'badge badge-declined' }, 'Closed') : null),
        h('h1', null, j.title),
        h('p', { class: 'facts' }, facts(j).map((x) => h('span', null, x))),
        h('h2', null, 'The job'),
        richText(j.description),
        j.company_blurb ? [h('h2', null, `About ${j.company}`), richText(j.company_blurb)] : null,
        site ? h('p', null, h('a', { href: site, target: '_blank', rel: 'noopener noreferrer' }, hostOf(site), h('span', { 'aria-hidden': 'true' }, ' ↗'))) : null),
      h('aside', { class: 'job-full-side' },
        h('div', { class: 'apply-box' },
          j.status === 'open' ? applyLink(j, 'btn btn-primary btn-block') : h('p', { class: 'muted' }, 'This job is closed.'),
          j.status === 'open' && applyHost ? h('p', { class: 'hint' }, `You apply on ${applyHost}. The hub does not collect applications.`) : null,
          j.mine ? null : saveButton(j)),
        h('dl', { class: 'facts-list' },
          row('Role', label('job_function', j.job_function)),
          row('Location', j.location),
          row('Workplace', label('workplace', j.workplace)),
          row('Type', label('employment_type', j.employment_type)),
          row('Salary', salaryText(j)),
          row('Equity', j.equity),
          row('Posted', timeAgo(j.created_at))),
        h('div', { class: 'poster-box' },
          h('p', { class: 'side-title' }, 'Posted by'),
          h('p', { class: 'meta' }, avatar(j.poster?.name, 'sm'), memberLink(j.poster)),
          j.poster?.headline ? h('p', { class: 'small muted' }, j.poster.headline) : null))));
}

// ---------- Post / edit ----------
async function renderEditor(ctx, id) {
  const { root } = ctx;
  let job = null;
  if (id) {
    try { job = await api(`/jobs/${id}`); } catch (err) { replace(root, errorBox(err, () => ctx.rerender())); return; }
    if (!ctx.isCurrent()) return;
    if (!job.mine) { ctx.navigate(`#/jobs/${id}`, { replace: true }); return; }
  }
  const biz = state.me?.business;
  const v = (k, def = '') => (job ? (job[k] ?? '') : def);
  const fields = {};
  const input = (k, text, attrs = {}, hint = null, value = v(k)) => {
    const fid = nextId(k);
    const el = attrs.rows ? h('textarea', { id: fid, ...attrs }) : h('input', { id: fid, type: 'text', ...attrs });
    el.value = value == null ? '' : String(value);
    fields[k] = el;
    return h('div', { class: 'field' }, h('label', { for: fid }, text, attrs.required ? null : h('span', { class: 'hint' }, ' (optional)')), hint ? h('span', { class: 'hint' }, hint) : null, el);
  };
  const select = (k, text, def) => {
    const fid = nextId(k);
    const el = h('select', { id: fid }, OPTIONS[k].map(([val, l]) => h('option', { value: val, selected: v(k, def) === val }, l)));
    fields[k] = el;
    return h('div', { class: 'field' }, h('label', { for: fid }, text), el);
  };
  const errorSlot = h('div');
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, id ? 'Save changes' : 'Post job');
  const form = h('form', { class: 'form-narrow', novalidate: true },
    h('fieldset', { class: 'form-section' }, h('legend', null, 'The role'),
      input('title', 'Job title', { required: true, maxlength: 160, placeholder: 'e.g. Account Executive' }),
      h('div', { class: 'form-row' }, select('job_function', 'Role type', 'other'), select('employment_type', 'Employment type', 'full_time')),
      h('div', { class: 'form-row' }, input('location', 'Location', { maxlength: 160, placeholder: 'e.g. Keene, NH' }), select('workplace', 'Workplace', 'onsite')),
      h('div', { class: 'form-row' },
        input('salary_min', 'Salary from (USD per year)', { inputmode: 'numeric', maxlength: 12, placeholder: '70000' }),
        input('salary_max', 'Salary to', { inputmode: 'numeric', maxlength: 12, placeholder: '95000' })),
      input('equity', 'Equity', { maxlength: 80, placeholder: 'e.g. 0.25% - 0.5%' }),
      input('description', 'Job description', { required: true, rows: 12, maxlength: 12000 },
        'What the person will do and what you look for. Blank lines make paragraphs. Lines that start with "-" make a list.')),
    h('fieldset', { class: 'form-section' }, h('legend', null, 'The company'),
      input('company', 'Company name', { required: true, maxlength: 160 }, null, v('company', biz?.name || state.me?.member?.org || '')),
      input('company_blurb', 'About the company', { rows: 4, maxlength: 1200 }, 'One short paragraph. What you sell and to whom.', v('company_blurb', biz?.description || '')),
      input('company_url', 'Company website', { type: 'url', maxlength: 500, placeholder: 'https://' })),
    h('fieldset', { class: 'form-section' }, h('legend', null, 'How to apply'),
      input('apply_url', 'Application link', { required: true, type: 'url', maxlength: 1000, placeholder: 'https://yourcompany.com/careers/this-job' },
        'Where candidates apply: your careers page or applicant tracking system. The hub sends people there. It does not collect applications.')),
    errorSlot,
    h('div', { class: 'row' }, submit, h('a', { class: 'btn btn-quiet', href: id ? `#/jobs/${id}` : '#/jobs' }, 'Cancel')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(fields).map(([k, el]) => [k, el.value.trim()]));
    const need = [['title', 'Enter the job title.'], ['description', 'Describe the job.'], ['company', 'Enter the company name.'], ['apply_url', 'Add the link where people apply.']];
    for (const [k, msg] of need) {
      if (!body[k]) { replace(errorSlot, h('div', { class: 'alert alert-error', role: 'alert' }, msg)); fields[k].focus(); return; }
    }
    submit.disabled = true;
    try {
      const saved = await api(id ? `/jobs/${id}` : '/jobs', { method: id ? 'PATCH' : 'POST', body });
      toast(id ? 'Job updated.' : 'Job posted.');
      ctx.navigate(`#/jobs/${saved.id}`);
    } catch (err) {
      replace(errorSlot, h('div', { class: 'alert alert-error', role: 'alert' }, err.message));
      submit.disabled = false;
    }
  });
  replace(root,
    h('p', null, h('a', { class: 'back-link', href: id ? `#/jobs/${id}` : '#/jobs' }, id ? '← Back to the job' : '← Jobs')),
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'Jobs'),
      h('h1', null, id ? 'Edit job' : 'Post a job'),
      h('p', null, 'Every member can read the posting. Candidates apply through your own link.'))),
    form);
}

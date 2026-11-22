// DOM helpers. All text goes in through text nodes or attributes, never innerHTML, so API data is always escaped.

/**
 * Create an element. attrs: class, dataset, style (object), on<Event> handlers, booleans (true -> empty attr).
 * Children: strings/numbers become text nodes; null/false are skipped; arrays are flattened.
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of [children].flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function replace(el, ...children) {
  clear(el);
  return append(el, children);
}

let uid = 0;
export function nextId(prefix = 'id') {
  uid += 1;
  return `${prefix}-${uid}`;
}

/** Escape helper for the rare case a string must be built (not used for DOM insertion in this app). */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

/** Only allow http(s) links to LinkedIn profiles (guards against javascript: URLs in data). */
export function safeLinkedIn(url) {
  if (!url || typeof url !== 'string') return null;
  const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(u);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    if (!/(^|\.)linkedin\.com$/i.test(parsed.hostname)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function plural(n, one, many = `${one}s`) {
  return `${Number(n).toLocaleString()} ${n === 1 ? one : many}`;
}

export function formatDate(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "3 hours ago" style time for forum and job lists. Falls back to a date after 30 days. */
export function timeAgo(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return String(s);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  if (days <= 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return formatDate(s);
}

/** Only http(s) links leave the app (guards against javascript: URLs in data). */
export function safeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/**
 * Render member-written text: blank lines split paragraphs, lines starting with "- " become a list,
 * and bare http(s) links become anchors. Everything goes through text nodes, never innerHTML.
 */
export function richText(text) {
  const out = [];
  const linkify = (line) => {
    const parts = [];
    let last = 0;
    for (const m of line.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
      const raw = m[0].replace(/[.,;:!?]+$/, '');
      const href = safeUrl(raw);
      if (!href) continue;
      if (m.index > last) parts.push(line.slice(last, m.index));
      parts.push(h('a', { href, target: '_blank', rel: 'noopener noreferrer nofollow' }, raw));
      last = m.index + raw.length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return parts;
  };
  for (const block of String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;
    let para = [];
    let items = [];
    const flushPara = () => { if (para.length) { out.push(h('p', null, para.flatMap((l, i) => (i ? [h('br'), ...linkify(l)] : linkify(l))))); para = []; } };
    const flushList = () => { if (items.length) { out.push(h('ul', null, items.map((l) => h('li', null, linkify(l))))); items = []; } };
    for (const l of lines) {
      const m = l.match(/^\s*[-*•]\s+(.*)$/);
      if (m) { flushPara(); items.push(m[1]); } else { flushList(); para.push(l); }
    }
    flushPara(); flushList();
  }
  return h('div', { class: 'prose' }, out);
}

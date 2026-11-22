// .mbox (Google Takeout) reader. Streams line by line and reads ONLY the From/To/Cc headers.
// Message bodies are never decoded or stored: in body state we only look for the next "From " separator.
import { makeRecord, companyFromEmail, isNoReply, isRealName, normaliseDisplayName } from './common.js';

export const MBOX_MAX_BYTES = 200 * 1024 * 1024;
const MAX_HEADER_BYTES = 256 * 1024;
const WANTED = new Set(['from', 'to', 'cc']);
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** Decode RFC 2047 encoded words (=?charset?Q|B?text?=). */
export function decodeEncodedWords(s) {
  return s
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([QqBb])\?([^?]*)\?=/g, (_, charset, enc, text) => {
      try {
        let buf;
        if (enc.toUpperCase() === 'B') buf = Buffer.from(text, 'base64');
        else {
          const bytes = [];
          const t = text.replace(/_/g, ' ');
          for (let i = 0; i < t.length; i++) {
            if (t[i] === '=' && /^[0-9A-F]{2}$/i.test(t.slice(i + 1, i + 3))) {
              bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2;
            } else bytes.push(t.charCodeAt(i) & 0xff);
          }
          buf = Buffer.from(bytes);
        }
        return /8859|latin|windows-1252/i.test(charset) ? buf.toString('latin1') : buf.toString('utf8');
      } catch {
        return text;
      }
    });
}

/** Split an address-list header on commas outside quotes, <> and (). */
export function parseAddressList(value) {
  const parts = [];
  let cur = '';
  let q = false; let angle = 0; let paren = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '\\' && q) { cur += ch + (value[i + 1] || ''); i++; continue; }
    if (ch === '"') q = !q;
    else if (!q && ch === '<') angle++;
    else if (!q && ch === '>') angle = Math.max(0, angle - 1);
    else if (!q && ch === '(') paren++;
    else if (!q && ch === ')') paren = Math.max(0, paren - 1);
    if (ch === ',' && !q && !angle && !paren) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  const out = [];
  for (let p of parts) {
    p = p.trim().replace(/^[^:<"]*:(?=.*@)/, ''); // drop "group-name:" prefixes
    if (!p) continue;
    let email = null; let name = null;
    const angleM = p.match(/<([^>]*)>/);
    if (angleM) {
      const m = angleM[1].match(EMAIL_RE);
      email = m ? m[0] : null;
      name = p.slice(0, angleM.index).trim();
    } else {
      const m = p.match(EMAIL_RE);
      email = m ? m[0] : null;
      const c = p.match(/\(([^)]*)\)/);
      name = c ? c[1] : null;
    }
    if (!email) continue;
    name = name ? normaliseDisplayName(decodeEncodedWords(name).replace(/\\"/g, '"')) : null;
    out.push({ email: email.toLowerCase(), name });
  }
  return out;
}

export function createMboxParser(opts = {}) {
  const self = new Set((opts.selfEmails || []).filter(Boolean).map((e) => e.toLowerCase()));
  const people = new Map(); // email -> { names: Map, messages }
  let state = 'start'; // start | headers | body
  let prevBlank = true;
  let headers = [];
  let headerBytes = 0;
  let messages = 0;
  let bytesRead = 0;
  let truncated = false;
  let leftover = null;

  function finishHeaders() {
    const seen = new Map();
    let current = null;
    const fields = [];
    for (const h of headers) {
      if (/^[ \t]/.test(h) && current) { current.value += ' ' + h.trim(); continue; }
      const idx = h.indexOf(':');
      if (idx <= 0) { current = null; continue; }
      const name = h.slice(0, idx).trim().toLowerCase();
      if (!WANTED.has(name)) { current = null; continue; }
      current = { name, value: h.slice(idx + 1) };
      fields.push(current);
    }
    for (const f of fields) {
      for (const a of parseAddressList(f.value)) {
        if (!seen.has(a.email) || (!seen.get(a.email) && a.name)) seen.set(a.email, a.name);
      }
    }
    messages++;
    for (const [email, name] of seen) {
      let p = people.get(email);
      if (!p) { p = { names: new Map(), messages: 0 }; people.set(email, p); }
      p.messages++;
      if (name) p.names.set(name, (p.names.get(name) || 0) + 1);
    }
    headers = [];
    headerBytes = 0;
  }

  function onLine(lineBuf) {
    // Strip trailing \r
    let end = lineBuf.length;
    if (end && lineBuf[end - 1] === 0x0d) end--;
    const isFromSep = end >= 5 && lineBuf[0] === 0x46 && lineBuf[1] === 0x72 && lineBuf[2] === 0x6f &&
      lineBuf[3] === 0x6d && lineBuf[4] === 0x20; // "From "
    if (isFromSep && (state === 'start' || (state === 'body' && prevBlank))) {
      if (state === 'headers') finishHeaders();
      state = 'headers';
      prevBlank = false;
      return;
    }
    if (state === 'headers') {
      if (end === 0) { finishHeaders(); state = 'body'; prevBlank = true; return; }
      if (headerBytes < MAX_HEADER_BYTES) {
        headers.push(lineBuf.toString('utf8', 0, end));
        headerBytes += end;
      }
      return;
    }
    // body (or junk before the first separator): never decoded
    prevBlank = end === 0;
  }

  return {
    push(chunk) {
      if (truncated) return;
      let buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (bytesRead + buf.length > MBOX_MAX_BYTES) {
        buf = buf.subarray(0, MBOX_MAX_BYTES - bytesRead);
        truncated = true;
      }
      bytesRead += buf.length;
      if (leftover) { buf = Buffer.concat([leftover, buf]); leftover = null; }
      let start = 0;
      let nl;
      while ((nl = buf.indexOf(0x0a, start)) !== -1) {
        onLine(buf.subarray(start, nl));
        start = nl + 1;
      }
      if (start < buf.length) {
        // Body lines can be long; only the first bytes matter there.
        const rest = buf.subarray(start);
        leftover = state === 'body' && rest.length > 64 ? Buffer.from(rest.subarray(0, 64)) : Buffer.from(rest);
      }
    },
    end() {
      if (leftover && leftover.length) onLine(leftover);
      leftover = null;
      if (state === 'headers') finishHeaders();
      const warnings = [];
      if (truncated) warnings.push('This mail file is over 200 MB, so only the first 200 MB were read. To include everyone, export one mail label at a time.');
      if (!self.size && messages >= 5) {
        for (const [email, p] of people) {
          if (p.messages / messages >= 0.6) {
            self.add(email);
            warnings.push('One email address appears on most messages, so the hub assumed it is yours and left it out.');
          }
        }
      }
      const records = [];
      let skipped = 0;
      for (const [email, p] of people) {
        if (self.has(email)) continue;
        const name = [...p.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        if (isNoReply(email) || !isRealName(name, email)) { skipped++; continue; }
        records.push(makeRecord('email_headers', {
          full_name: name, email, company: companyFromEmail(email), interaction_count: p.messages,
        }));
      }
      if (!messages) warnings.push('No emails were found in this file. Check that it is the .mbox file from Google Takeout.');
      return { records, warnings, skipped, messages };
    },
  };
}

/** Parse an in-memory mbox buffer, in chunks. */
export function parseMbox(input, opts = {}) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  const p = createMboxParser(opts);
  const CHUNK = 1 << 20;
  for (let i = 0; i < buf.length; i += CHUNK) p.push(buf.subarray(i, i + CHUNK));
  return p.end();
}

/** Parse from a Readable stream (e.g. fs.createReadStream) without loading it into memory. */
export async function parseMboxStream(readable, opts = {}) {
  const p = createMboxParser(opts);
  for await (const chunk of readable) p.push(chunk);
  return p.end();
}

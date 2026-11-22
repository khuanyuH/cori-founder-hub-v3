// vCard (.vcf) 2.1 / 3.0 / 4.0, multi-card files, folded lines, quoted-printable.
import { toText, makeRecord, hasName } from './common.js';

/** Split text into unfolded content lines (RFC 6350 / 5545 folding + QP soft breaks). */
export function unfoldLines(text) {
  const raw = text.replace(/\r\n|\r/g, '\n').split('\n');
  const out = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else if (out.length && /ENCODING=QUOTED-PRINTABLE/i.test(out[out.length - 1].split(':')[0]) &&
      out[out.length - 1].endsWith('=')) {
      out[out.length - 1] = out[out.length - 1].slice(0, -1) + line;
    } else {
      out.push(line);
    }
  }
  return out.filter((l) => l.length);
}

/** Parse "GROUP.NAME;P1=a;P2=b:value" -> { name, params, value } */
export function parseContentLine(line) {
  // Find the first ':' that is not inside a double-quoted param value.
  let inQuote = false;
  let idx = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ':' && !inQuote) { idx = i; break; }
  }
  if (idx < 0) return null;
  const head = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const parts = head.split(';');
  const name = parts[0].replace(/^[^.]*\./, '').toUpperCase();
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq < 0) { (params.TYPE ||= []).push(p.toUpperCase()); continue; }
    const k = p.slice(0, eq).toUpperCase();
    const v = p.slice(eq + 1).replace(/^"|"$/g, '');
    (params[k] ||= []).push(...(k === 'CN' ? [v] : v.split(',')));
  }
  return { name, params, value };
}

function decodeQP(s, charset) {
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(s.charCodeAt(i) & 0xff);
  }
  const buf = Buffer.from(bytes);
  return /8859|latin/i.test(charset || '') ? buf.toString('latin1') : buf.toString('utf8');
}

function unescapeValue(v) {
  return v.replace(/\\n/gi, ' ').replace(/\\([,;\\:])/g, '$1');
}

/** Split a structured value on unescaped ';'. */
function splitStructured(v) {
  const out = [];
  let cur = '';
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\' && i + 1 < v.length) { cur += v[i] + v[i + 1]; i++; continue; }
    if (v[i] === ';') { out.push(cur); cur = ''; continue; }
    cur += v[i];
  }
  out.push(cur);
  return out.map(unescapeValue);
}

export function parseVcard(input) {
  const lines = unfoldLines(toText(input));
  const records = [];
  const warnings = [];
  let skipped = 0;
  let card = null;
  for (const line of lines) {
    const cl = parseContentLine(line);
    if (!cl) continue;
    if (cl.name === 'BEGIN' && /^VCARD$/i.test(cl.value.trim())) { card = { urls: [] }; continue; }
    if (cl.name === 'END' && /^VCARD$/i.test(cl.value.trim())) {
      if (card) {
        const rec = makeRecord('vcard', {
          full_name: card.fn,
          first_name: card.given,
          last_name: card.family,
          company: card.org,
          title: card.title,
          email: card.email,
          linkedin_url: card.urls.find((u) => /linkedin\.com\//i.test(u)) || null,
          location: [card.city, card.region].filter(Boolean).join(', ') || null,
        });
        if (hasName(rec)) records.push(rec); else skipped++;
      }
      card = null;
      continue;
    }
    if (!card) continue;
    let value = cl.value;
    if ((cl.params.ENCODING || []).some((e) => /QUOTED-PRINTABLE/i.test(e))) {
      value = decodeQP(value, (cl.params.CHARSET || [])[0]);
    }
    switch (cl.name) {
      case 'FN': card.fn = unescapeValue(value); break;
      case 'N': {
        const [family, given] = splitStructured(value);
        card.family = family; card.given = given;
        break;
      }
      case 'ORG': card.org = splitStructured(value)[0]; break;
      case 'TITLE': card.title = unescapeValue(value); break;
      case 'EMAIL': if (!card.email) card.email = value.replace(/^mailto:/i, '').trim(); break;
      case 'URL': card.urls.push(unescapeValue(value)); break;
      case 'X-SOCIALPROFILE': card.urls.push(unescapeValue(value)); break;
      case 'ADR': {
        if (card.city || card.region) break;
        const parts = splitStructured(value); // PO;ext;street;locality;region;postal;country
        card.city = parts[3] || null; card.region = parts[4] || null;
        break;
      }
      default: break;
    }
  }
  if (!records.length) warnings.push('No contacts with a name were found in this file. Check that it is the contacts file you exported.');
  return { records, warnings, skipped };
}

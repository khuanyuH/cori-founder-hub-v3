// Pasted rosters (board lists, attendee lists) and CSV/TSV files with arbitrary headers.
// Also the `manual` source (one contact + vouch note as JSON).
import { toText, parseCsvRows, makeRecord, hasName, clean } from './common.js';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const EMAIL_RE_G = new RegExp(EMAIL_RE.source, 'g');
const PHONE_RE_G = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const URL_RE = /https?:\/\/\S+|(?:www\.)?linkedin\.com\/\S+/i;
const TITLE_WORDS = /\b(ceo|cfo|coo|cto|cmo|cio|chief|president|vice|vp|svp|evp|director|manager|head|lead|founder|co-founder|owner|partner|principal|chair|chairman|chairwoman|chairperson|trustee|treasurer|secretary|officer|executive|engineer|analyst|consultant|advisor|adviser|coordinator|specialist|administrator|dean|professor|superintendent|commissioner|mayor|senator|representative|dds|dmd|md|rn|np|hygienist|dentist|physician|nurse|attorney|counsel|associate|board member|member|fellow|intern|student|teacher|instructor|editor|producer|designer|developer|scientist|researcher|agent|broker|banker|accountant|controller|farmer|rancher|grower)\b/i;

const HEADER_MAP = [
  ['full_name', /^(full ?name|name|display name|contact|attendee|person|member)$/i],
  ['first_name', /^(first ?name|given ?name|first)$/i],
  ['last_name', /^(last ?name|surname|family ?name|last)$/i],
  ['title', /^(title|job ?title|position|role|designation)$/i],
  ['company', /^(company|organi[sz]ation|org|employer|affiliation|institution|business|firm|agency)( name)?$/i],
  ['linkedin_url', /^(linkedin|linkedin url|profile|profile url|url)$/i],
  ['email', /^(e-?mail|e-?mail address)$/i],
  ['location', /^(location|city|state|region|town|city\/state)$/i],
  ['note', /^(note|notes|comment|comments)$/i],
];

function mapHeaders(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const t = h.replace(/^﻿/, '').trim();
    for (const [field, re] of HEADER_MAP) {
      if (re.test(t) && map[field] === undefined) { map[field] = i; break; }
    }
  });
  return map;
}

function looksLikeHeader(cells) {
  const map = mapHeaders(cells);
  return (map.full_name !== undefined || map.first_name !== undefined) &&
    Object.keys(map).length >= 2;
}

function stripContact(s) {
  return (s || '').replace(EMAIL_RE_G, ' ').replace(PHONE_RE_G, ' ').replace(/[<>()]/g, ' ').replace(/\s+/g, ' ').trim();
}

const PARTICLES = new Set(['de', 'da', 'di', 'del', 'della', 'der', 'den', 'van', 'von', 'la', 'le', 'du', 'dos', 'das', 'bin', 'al', 'el', 'ter']);
const NOT_NAME = /\b(board|directors?|committee|council|members|attendees?|list|roster|inc|llc|ltd|corp|association|society|department|university|college|hospital|bank|staff|team|officers|agenda|minutes)\b/i;

/** Heuristic: 1-6 words, letters present, each word capitalised or a name particle. */
export function looksLikePersonName(name) {
  if (!name || !/\p{L}/u.test(name)) return false;
  const words = name.split(/\s+/);
  if (words.length > 6) return false;
  if (NOT_NAME.test(name)) return false;
  return words.every((w) => PARTICLES.has(w.toLowerCase()) || /^\p{Lu}/u.test(w.replace(/^[^\p{L}]+/u, '')));
}

function splitTitleCompany(rest) {
  const at = rest.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
  if (at) return { title: at[1], company: at[2] };
  const parts = rest.split(/\s*[,;|\t–—]\s*|\s+-\s+/).filter(Boolean);
  if (parts.length >= 2) return { title: parts[0], company: parts.slice(1).join(', ') };
  if (TITLE_WORDS.test(rest)) return { title: rest, company: null };
  return { title: null, company: rest };
}

/** Parse one free-text roster line into a record (or null). */
export function parseRosterLine(line) {
  let raw = line.replace(/^\s*(?:[-*•●]|\d+[.)])\s+/, '').trim(); // bullets / numbering
  if (!raw || raw.startsWith('#')) return null;
  const email = (raw.match(EMAIL_RE) || [null])[0];
  const urlM = raw.match(URL_RE);
  const linkedin = urlM && /linkedin\.com\//i.test(urlM[0]) ? urlM[0] : null;
  if (urlM) raw = raw.replace(urlM[0], ' ');
  raw = raw.replace(EMAIL_RE_G, ' ').replace(PHONE_RE_G, ' ').replace(/[<>]/g, ' ').replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ').replace(/(\s*[,;|]\s*)+$/, '').replace(/(\s*[,;|]\s*){2,}/g, ', ').trim();
  if (!raw) return null;

  let name; let title = null; let company = null;
  const paren = raw.match(/^([^(,]+?)\s*\((.+)\)$/);         // "Name (Title, Company)"
  const dash = raw.match(/^(.+?)\s+[-–—|]\s+(.+)$/); // "Name - Title at Company"
  if (paren) {
    name = paren[1];
    ({ title, company } = splitTitleCompany(paren[2]));
  } else if (dash) {
    name = dash[1];
    ({ title, company } = splitTitleCompany(dash[2]));
  } else if (/[\t,;]/.test(raw)) {                             // "Name, Title, Company"
    const parts = raw.split(/\s*[\t,;]\s*/).filter(Boolean);
    name = parts[0];
    if (parts.length >= 3) { title = parts[1]; company = parts.slice(2).join(', '); } else if (parts.length === 2) ({ title, company } = splitTitleCompany(parts[1]));
  } else {
    name = raw;
  }
  name = clean(name.replace(/^(dr|mr|mrs|ms|mx|prof)\.?\s+/i, '').replace(/[()]/g, ''));
  if (!looksLikePersonName(name)) return null;
  return makeRecord('roster', { full_name: name, title, company, email, linkedin_url: linkedin });
}

/** Pasted text (or a CSV/TSV file with any headers) -> ContactRecord[] (source 'roster'). */
export function parsePastedText(text) {
  return parseRosterText(text).records;
}

export function parseRosterText(input) {
  const text = toText(input).replace(/\r\n|\r/g, '\n');
  const lines = text.split('\n').filter((l) => l.trim());
  const warnings = [];
  let skipped = 0;
  const records = [];
  if (!lines.length) return { records, warnings: ['There was nothing to import: the list is empty.'], skipped };

  // Delimited with a recognisable header row?
  const firstLine = lines[0];
  const delim = firstLine.includes('\t') ? '\t' : (firstLine.includes(',') ? ',' : null);
  if (delim) {
    const rows = delim === '\t'
      ? lines.map((l) => l.split('\t'))
      : parseCsvRows(text);
    if (rows.length && looksLikeHeader(rows[0])) {
      const map = mapHeaders(rows[0]);
      const get = (r, f) => (map[f] !== undefined ? clean(r[map[f]]) : null);
      for (const r of rows.slice(1)) {
        const rec = makeRecord('roster', {
          full_name: get(r, 'full_name') ? stripContact(get(r, 'full_name')) : null,
          first_name: get(r, 'first_name'),
          last_name: get(r, 'last_name'),
          title: get(r, 'title'),
          company: get(r, 'company'),
          linkedin_url: get(r, 'linkedin_url') && /linkedin\.com\//i.test(get(r, 'linkedin_url')) ? get(r, 'linkedin_url') : null,
          email: get(r, 'email') && EMAIL_RE.test(get(r, 'email')) ? get(r, 'email').match(EMAIL_RE)[0] : null,
          location: get(r, 'location'),
        });
        if (hasName(rec)) records.push(rec); else skipped++;
      }
      return { records, warnings, skipped };
    }
  }
  for (const line of lines) {
    // Skip an obvious header line like "Name, Title, Company"
    if (looksLikeHeader(line.split(/\s*[\t,;]\s*/))) continue;
    const rec = parseRosterLine(line);
    if (rec && hasName(rec)) records.push(rec); else skipped++;
  }
  return { records, warnings, skipped };
}

/** Manual entry JSON: one contact plus a vouch note. */
export function parseManual(input) {
  let obj = input;
  if (typeof input === 'string' || Buffer.isBuffer(input)) {
    try { obj = JSON.parse(toText(input)); } catch { return { records: [], warnings: ['Something went wrong reading this person\'s details. Please try again.'], skipped: 1 }; }
  }
  const list = Array.isArray(obj) ? obj : [obj];
  const records = [];
  let skipped = 0;
  for (const o of list) {
    const rec = makeRecord('manual', {
      full_name: o?.full_name || o?.name,
      first_name: o?.first_name,
      last_name: o?.last_name,
      company: o?.company,
      title: o?.title,
      linkedin_url: o?.linkedin_url,
      location: o?.location,
      email: o?.email,
      note: o?.note,
    });
    if (hasName(rec)) records.push(rec); else skipped++;
  }
  return { records, warnings: [], skipped };
}

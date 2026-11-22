// Importer entry point: source detection, parsing, and applying records to the database.
import path from 'node:path';
import { toText } from './common.js';
import { parseLinkedIn, isZip, zipHasConnections } from './linkedin.js';
import { parseGoogleContacts, parseOutlookContacts } from './contacts_csv.js';
import { parseVcard } from './vcard.js';
import { parseCalendar } from './calendar.js';
import { parseMbox, MBOX_MAX_BYTES } from './mbox.js';
import { parseRosterText, parsePastedText as parsePasted, parseManual } from './roster.js';
import { upsertPerson, addConnection, withTransaction, stmt, SOURCES } from '../db.js';

export { SOURCES, MBOX_MAX_BYTES };
// Uploads are held in memory. HUB_MAX_UPLOAD_MB lowers the cap on a small server (never above the 200 MB mbox cap).
const envMb = Number(process.env.HUB_MAX_UPLOAD_MB);
export const MAX_UPLOAD_BYTES = Number.isFinite(envMb) && envMb > 0
  ? Math.min(Math.round(envMb * 1024 * 1024), MBOX_MAX_BYTES)
  : MBOX_MAX_BYTES;

function headText(buffer, n = 8192) {
  const b = Buffer.isBuffer(buffer) ? buffer.subarray(0, n) : Buffer.from(String(buffer).slice(0, n));
  return toText(b);
}

function csvHeaderLine(text) {
  const lines = text.replace(/\r\n|\r/g, '\n').split('\n');
  // LinkedIn preamble: find the row starting with First Name.
  const li = lines.find((l) => /^﻿?"?First Name"?,/i.test(l));
  return { first: lines.find((l) => l.trim()) || '', liHeader: li || null };
}

function hasPersonName(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const str = (v) => typeof v === 'string' && v.trim().length > 0;
  return str(o.full_name) || str(o.first_name) || str(o.last_name);
}

/** JSON that parses to a contact object, or an array of contact objects, with full_name or first/last name. */
export function looksLikeManualJson(buffer) {
  let obj;
  try { obj = JSON.parse(toText(Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer)))); } catch { return false; }
  if (Array.isArray(obj)) return obj.length > 0 && obj.every((o) => o && typeof o === 'object' && !Array.isArray(o)) && obj.some(hasPersonName);
  return hasPersonName(obj);
}

/** -> source id or null */
export function detectSource(filename, buffer) {
  const ext = path.extname(filename || '').toLowerCase();
  if (!buffer || !buffer.length) return null;
  if (ext === '.zip' || (Buffer.isBuffer(buffer) && isZip(buffer))) {
    return zipHasConnections(buffer) ? 'linkedin' : null;
  }
  const head = headText(buffer);
  const trimmed = head.trimStart();
  if (ext === '.vcf' || ext === '.vcard' || /^BEGIN:VCARD/i.test(trimmed)) return 'vcard';
  if (ext === '.ics' || ext === '.ical' || /^BEGIN:VCALENDAR/i.test(trimmed)) return 'calendar';
  if (ext === '.mbox' || /^From \S+/.test(head)) return 'email_headers';
  if (ext === '.json' || /^[[{]/.test(trimmed)) {
    // Only a contact (or a list of contacts) is a manual import; package.json and other JSON are not.
    if (looksLikeManualJson(buffer)) return 'manual';
    if (ext === '.json') return null;
  }
  const { first, liHeader } = csvHeaderLine(head);
  if (liHeader && (/Connected On/i.test(liHeader) || (/\bURL\b/.test(liHeader) && /Position/.test(liHeader)))) return 'linkedin';
  if (/^Notes:/i.test(first) && liHeader) return 'linkedin';
  const h = first;
  if (/Given Name|Organization 1 - Name|E-mail 1 - Value|Organization Name|Organization Title|Name Prefix,/i.test(h) &&
    !/E-mail Address/i.test(h)) return 'google_contacts';
  if (/E-mail Address/i.test(h) || (/Job Title/i.test(h) && /\bCompany\b/i.test(h) && /First Name/i.test(h))) return 'outlook_contacts';
  if (['.csv', '.tsv', '.txt', ''].includes(ext)) return 'roster';
  return null;
}

/**
 * -> { source, records: ContactRecord[], warnings: string[], skipped }
 * opts.selfEmails: the uploading member's own email(s), excluded from calendar/email imports.
 */
export async function parseFile(filename, buffer, hint, opts = {}) {
  const source = hint || detectSource(filename, buffer);
  if (!source) {
    return { source: null, records: [], warnings: ['The hub could not tell where this file came from. Choose it under "This file is from" and try again.'], skipped: 0 };
  }
  if (!SOURCES.includes(source)) {
    return { source: null, records: [], warnings: ['This kind of file is not supported. Choose a different source under "This file is from".'], skipped: 0 };
  }
  let out;
  switch (source) {
    case 'linkedin': out = parseLinkedIn(buffer); break;
    case 'google_contacts': out = parseGoogleContacts(buffer); break;
    case 'outlook_contacts': out = parseOutlookContacts(buffer); break;
    case 'vcard': out = parseVcard(buffer); break;
    case 'calendar': out = parseCalendar(buffer, opts); break;
    case 'email_headers': out = parseMbox(buffer, opts); break;
    case 'manual': out = parseManual(buffer); break;
    case 'roster': out = parseRosterText(buffer); break;
    default: out = { records: [], warnings: [], skipped: 0 };
  }
  return { source, records: out.records, warnings: out.warnings || [], skipped: out.skipped || 0 };
}

export function parsePastedText(text) {
  return parsePasted(text);
}

/** Default strength per contract. */
export function defaultStrength(source, interactionCount = 0) {
  switch (source) {
    case 'manual': return 'strong';
    case 'calendar':
    case 'email_headers':
      if (interactionCount >= 5) return 'strong';
      if (interactionCount >= 2) return 'some';
      return 'weak';
    case 'google_contacts':
    case 'outlook_contacts':
    case 'vcard':
      return 'some';
    default:
      return 'weak';
  }
}

/** Strip the email from a record (for previews). */
export function publicRecord(rec) {
  const { email, ...rest } = rec;
  return rest;
}

/**
 * Write records into the pool for one member.
 * -> { parsed, new_people, new_connections, already_known, skipped }
 *   new_people: people rows created; new_connections: edges created;
 *   already_known: records whose person this member was already connected to (any source) before this record.
 */
export function importRecords(db, memberId, records, source, { skipped = 0 } = {}) {
  const stats = { parsed: records.length, new_people: 0, new_connections: 0, already_known: 0, skipped };
  const member = stmt(db, 'SELECT name, email FROM members WHERE id = ?').get(memberId);
  const memberName = (member?.name || '').trim().toLowerCase();
  const memberEmail = (member?.email || '').trim().toLowerCase();
  withTransaction(db, () => {
    for (const rec of records) {
      const src = rec.source && SOURCES.includes(rec.source) ? rec.source : source;
      if (!rec.full_name && !rec.first_name && !rec.last_name) { stats.skipped++; continue; }
      if ((memberEmail && rec.email && rec.email.toLowerCase() === memberEmail) ||
        (memberName && (rec.full_name || '').trim().toLowerCase() === memberName && !rec.company)) {
        stats.skipped++; // the member themselves
        continue;
      }
      const { personId, created } = upsertPerson(db, rec);
      if (created) stats.new_people++;
      else {
        const known = stmt(db, 'SELECT 1 FROM connections WHERE member_id = ? AND person_id = ? LIMIT 1').get(memberId, personId);
        if (known) stats.already_known++;
      }
      const res = addConnection(db, {
        memberId,
        personId,
        source: src,
        strength: defaultStrength(src, rec.interaction_count),
        interactionCount: rec.interaction_count || 0,
        connectedOn: rec.connected_on,
        note: rec.note,
        privateEmail: rec.email,
      });
      if (res.created) stats.new_connections++;
    }
  });
  return stats;
}

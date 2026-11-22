// LinkedIn "Connections.csv" (or the full LinkedIn data-export .zip that contains it).
import { unzipSync } from 'fflate';
import { toText, parseCsvRows, rowsToObjects, pick, makeRecord, hasName, toIsoDate } from './common.js';

export function isZip(buffer) {
  return Boolean(buffer && buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05) );
}

/** Extract Connections.csv text from a LinkedIn export zip, or null. */
export function connectionsFromZip(buffer) {
  let found = null;
  const files = unzipSync(new Uint8Array(buffer), {
    filter: (f) => {
      const ok = /(^|\/)connections\.csv$/i.test(f.name);
      if (ok && !found) found = f.name;
      return ok;
    },
  });
  const names = Object.keys(files);
  if (!names.length) return null;
  // Prefer the shallowest match.
  names.sort((a, b) => a.split('/').length - b.split('/').length);
  return toText(Buffer.from(files[names[0]]));
}

export function zipHasConnections(buffer) {
  try {
    let hit = false;
    unzipSync(new Uint8Array(buffer), {
      filter: (f) => { if (/(^|\/)connections\.csv$/i.test(f.name)) hit = true; return false; },
    });
    return hit;
  } catch {
    return false;
  }
}

export function parseLinkedIn(input) {
  const warnings = [];
  let text;
  if (Buffer.isBuffer(input) && isZip(input)) {
    text = connectionsFromZip(input);
    if (text == null) return { records: [], warnings: ['This .zip does not include your connections list (Connections.csv). Request the larger LinkedIn archive, which includes connections, and upload that.'], skipped: 0 };
  } else {
    text = toText(input);
  }
  const rows = parseCsvRows(text);
  const headerIdx = rows.findIndex((r) => (r[0] || '').replace(/^﻿/, '').trim().toLowerCase() === 'first name');
  if (headerIdx < 0) {
    return { records: [], warnings: ['This does not look like a LinkedIn connections file. Upload the LinkedIn .zip, or the Connections.csv inside it.'], skipped: 0 };
  }
  // LinkedIn puts a few "Notes" lines above the header row; skipping them is normal, so no warning.
  const { objects } = rowsToObjects(rows.slice(headerIdx));
  const records = [];
  let skipped = 0;
  for (const o of objects) {
    const rec = makeRecord('linkedin', {
      first_name: pick(o, ['First Name']),
      last_name: pick(o, ['Last Name']),
      linkedin_url: pick(o, ['URL', 'Profile URL']),
      email: pick(o, ['Email Address', 'E-mail Address', 'Email']),
      company: pick(o, ['Company']),
      title: pick(o, ['Position', 'Title']),
      connected_on: toIsoDate(pick(o, ['Connected On'])),
    });
    if (!hasName(rec)) { skipped++; continue; }
    records.push(rec);
  }
  return { records, warnings, skipped };
}

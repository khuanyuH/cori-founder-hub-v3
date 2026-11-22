// Google Contacts CSV (old "Google CSV" and new 2020+ headers) and Outlook CSV exports.
import { toText, parseCsvRows, rowsToObjects, pick, pickAll, makeRecord, hasName } from './common.js';

function linkedinFrom(values) {
  return values.find((v) => /linkedin\.com\//i.test(v)) || null;
}

function locationFrom(city, region, formatted) {
  const parts = [city, region].filter(Boolean);
  if (parts.length) return parts.join(', ');
  if (formatted) {
    // Use only the last line(s) of a formatted address (city/region), never the street.
    const lines = formatted.split(/\n|\r/).map((s) => s.trim()).filter(Boolean);
    const cityLine = lines.length > 1 ? lines[lines.length - 2] : null;
    return cityLine ? cityLine.replace(/\s+\d{5}(-\d{4})?$/, '') : null;
  }
  return null;
}

export function parseGoogleContacts(input) {
  const { headers, objects } = rowsToObjects(parseCsvRows(toText(input)));
  const warnings = [];
  const isOld = headers.includes('Given Name') || headers.includes('Organization 1 - Name');
  const records = [];
  let skipped = 0;
  for (const o of objects) {
    const first = pick(o, ['First Name', 'Given Name']);
    const last = pick(o, ['Last Name', 'Family Name']);
    const full = pick(o, ['Name', 'Display Name']) ||
      [first, pick(o, ['Middle Name', 'Additional Name']), last].filter(Boolean).join(' ') ||
      pick(o, ['File As']);
    const rec = makeRecord('google_contacts', {
      first_name: first,
      last_name: last,
      full_name: full,
      company: pick(o, ['Organization Name', 'Organization 1 - Name', 'Company']),
      title: pick(o, ['Organization Title', 'Organization 1 - Title', 'Job Title']),
      email: pick(o, ['E-mail 1 - Value', 'Email 1 - Value', 'E-mail Address']),
      linkedin_url: linkedinFrom(pickAll(o, /^Website \d+ - Value$/i)),
      location: locationFrom(
        pick(o, ['Address 1 - City']),
        pick(o, ['Address 1 - Region']),
        pick(o, ['Address 1 - Formatted']),
      ),
    });
    if (!hasName(rec)) { skipped++; continue; }
    records.push(rec);
  }
  if (!records.length && objects.length) warnings.push('No contacts with a name were found in this Google Contacts file. Check that you exported it as Google CSV.');
  return { records, warnings, skipped, variant: isOld ? 'google_old' : 'google_new' };
}

export function parseOutlookContacts(input) {
  const { objects } = rowsToObjects(parseCsvRows(toText(input)));
  const warnings = [];
  const records = [];
  let skipped = 0;
  for (const o of objects) {
    const rec = makeRecord('outlook_contacts', {
      first_name: pick(o, ['First Name']),
      last_name: pick(o, ['Last Name']),
      full_name: pick(o, ['Display Name', 'Name']),
      company: pick(o, ['Company']),
      title: pick(o, ['Job Title']),
      email: pick(o, ['E-mail Address', 'Email Address', 'E-mail 1 Address']),
      linkedin_url: linkedinFrom(pickAll(o, /^(Web Page|Personal Web Page|Business Web Page)$/i)),
      location: locationFrom(
        pick(o, ['Business City', 'Home City', 'Other City']),
        pick(o, ['Business State', 'Home State', 'Other State']),
        null,
      ),
    });
    if (!hasName(rec)) { skipped++; continue; }
    records.push(rec);
  }
  if (!records.length && objects.length) warnings.push('No contacts with a name were found in this Outlook file. Check that it is the exported contacts file.');
  return { records, warnings, skipped };
}

// iCalendar (.ics) export: collect ATTENDEE / ORGANIZER across events.
import { toText, makeRecord, companyFromEmail, isNoReply, isRealName, normaliseDisplayName, toIsoDate, clean } from './common.js';
import { unfoldLines, parseContentLine } from './vcard.js';

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

/**
 * @param input Buffer|string
 * @param opts { selfEmails?: string[] }  emails of the uploading member, excluded
 */
export function parseCalendar(input, opts = {}) {
  const lines = unfoldLines(toText(input));
  const warnings = [];
  const self = new Set((opts.selfEmails || []).filter(Boolean).map((e) => e.toLowerCase()));
  const people = new Map(); // email -> { names: Map<name,count>, events, first }
  let inEvent = false;
  let eventEmails = null;
  let eventNames = null;
  let eventDate = null;
  let eventCount = 0;

  for (const line of lines) {
    const cl = parseContentLine(line);
    if (!cl) continue;
    if (cl.name === 'X-WR-CALNAME' && EMAIL_RE.test(cl.value.trim()) ) {
      self.add(cl.value.trim().toLowerCase());
    }
    if (cl.name === 'BEGIN' && cl.value.trim().toUpperCase() === 'VEVENT') {
      inEvent = true; eventEmails = new Set(); eventNames = new Map(); eventDate = null;
      continue;
    }
    if (cl.name === 'END' && cl.value.trim().toUpperCase() === 'VEVENT') {
      if (inEvent) {
        eventCount++;
        for (const email of eventEmails) {
          let p = people.get(email);
          if (!p) { p = { names: new Map(), events: 0, first: null }; people.set(email, p); }
          p.events++;
          const nm = eventNames.get(email);
          if (nm) p.names.set(nm, (p.names.get(nm) || 0) + 1);
          if (eventDate && (!p.first || eventDate < p.first)) p.first = eventDate;
        }
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;
    if (cl.name === 'DTSTART') { eventDate = toIsoDate(cl.value.trim()); continue; }
    if (cl.name !== 'ATTENDEE' && cl.name !== 'ORGANIZER') continue;
    const email = cl.value.trim().replace(/^mailto:/i, '').toLowerCase();
    if (!EMAIL_RE.test(email)) continue;
    eventEmails.add(email); // a repeated attendee in one event counts once
    const cn = normaliseDisplayName((cl.params.CN || [])[0]);
    if (cn && !eventNames.has(email)) eventNames.set(email, cn);
  }

  // Heuristic when the owner's email is unknown: an address on (almost) every event is the owner.
  if (!self.size && eventCount >= 5) {
    for (const [email, p] of people) {
      if (p.events / eventCount >= 0.8) {
        self.add(email);
        warnings.push('One email address appears on nearly every meeting, so the hub assumed it is yours and left it out.');
      }
    }
  }

  const records = [];
  let skipped = 0;
  for (const [email, p] of people) {
    if (self.has(email)) continue;
    const name = [...p.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    if (isNoReply(email) || !isRealName(name, email) || /calendar|resource\.calendar/i.test(email)) {
      skipped++;
      continue;
    }
    records.push(makeRecord('calendar', {
      full_name: clean(name),
      email,
      company: companyFromEmail(email),
      interaction_count: p.events,
      connected_on: p.first,
    }));
  }
  if (!eventCount) warnings.push('No meetings were found in this file. Check that it is the .ics file for your main calendar.');
  return { records, warnings, skipped };
}

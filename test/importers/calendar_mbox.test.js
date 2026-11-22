import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { parseFile, detectSource, defaultStrength } from '../../server/importers/index.js';
import { parseCalendar } from '../../server/importers/calendar.js';
import { parseMbox, parseMboxStream, parseAddressList } from '../../server/importers/mbox.js';
import { fixture } from '../fixtures/helpers.js';

test('calendar: counts shared events, repeated attendees count once, self excluded', async () => {
  const buf = fixture('calendar.ics');
  assert.equal(detectSource('calendar.ics', buf), 'calendar');
  const out = await parseFile('calendar.ics', buf, undefined, { selfEmails: ['owner@myco.example'] });
  const by = Object.fromEntries(out.records.map((r) => [r.email, r]));
  assert.equal(by['lucinda@nhdental.example'].interaction_count, 4, 'repeated ATTENDEE lines and case variants count once per event');
  assert.equal(by['lucinda@nhdental.example'].full_name, 'Lucinda Farrowby');
  assert.equal(by['lucinda@nhdental.example'].company, 'Nhdental', 'company guessed from domain');
  assert.equal(by['lucinda@nhdental.example'].connected_on, '2025-11-20', 'earliest shared event');
  assert.equal(by['theo@prairie-implement.example'].interaction_count, 2, 'folded mailto value');
  assert.equal(by['theo@prairie-implement.example'].company, 'Prairie Implement');
  assert.equal(by['marlon.quist@gmail.com'].full_name, 'Marlon Quist', '"Last, First" CN normalised');
  assert.equal(by['marlon.quist@gmail.com'].company, null, 'free-mail domain gives no company');
  assert.ok(!by['owner@myco.example'], 'own email excluded');
  assert.ok(!by['noreply@calendar.example'], 'noreply skipped');
  assert.ok(!by['nameless@somewhere.example'], 'no CN skipped');
  assert.ok(!by['jane.doe@corp.example'], 'CN equal to email skipped');
  assert.equal(out.records.length, 3);
  assert.equal(out.skipped, 3);
  assert.equal(defaultStrength('calendar', 4), 'some');
  assert.equal(defaultStrength('calendar', 5), 'strong');
  assert.equal(defaultStrength('calendar', 1), 'weak');
});

test('calendar: X-WR-CALNAME email is treated as the owner when no member email is known', () => {
  const out = parseCalendar(fixture('calendar.ics'));
  assert.ok(!out.records.some((r) => r.email === 'owner@myco.example'));
});

test('calendar: an address on nearly every event is assumed to be the owner', () => {
  const ev = (i, extra) => `BEGIN:VEVENT\nUID:${i}\nDTSTART:2026010${i}T100000Z\nATTENDEE;CN=Me Myself:mailto:me@mine.example\n${extra}\nEND:VEVENT`;
  const ics = ['BEGIN:VCALENDAR',
    ev(1, 'ATTENDEE;CN=Pat Lindell:mailto:pat@lindell.example'),
    ev(2, 'ATTENDEE;CN=Pat Lindell:mailto:pat@lindell.example'),
    ev(3, 'ATTENDEE;CN=Ro Vance:mailto:ro@vance.example'),
    ev(4, 'ATTENDEE;CN=Ro Vance:mailto:ro@vance.example'),
    ev(5, 'ATTENDEE;CN=Sy Kerr:mailto:sy@kerr.example'),
    'END:VCALENDAR'].join('\n');
  const out = parseCalendar(Buffer.from(ics));
  assert.deepEqual(out.records.map((r) => r.email).sort(), ['pat@lindell.example', 'ro@vance.example', 'sy@kerr.example']);
  assert.ok(out.warnings.length >= 1);
});

test('mbox: reads only From/To/Cc headers and ignores bodies', async () => {
  const buf = fixture('mail.mbox');
  assert.equal(detectSource('All mail Including Spam and Trash.mbox', buf), 'email_headers');
  const out = await parseFile('mail.mbox', buf, undefined, { selfEmails: ['owner@myco.example'] });
  const emails = out.records.map((r) => r.email).sort();
  assert.deepEqual(emails, ['jose.arbelo@heartlandag.example', 'rosalind.wexley@cedarvalley.example', 'tamsin@ozarkhealth.example']);
  const all = JSON.stringify(out);
  assert.ok(!all.includes('hidden.example'), 'addresses inside bodies are never read');
  assert.ok(!all.includes('Bodyperson'));
  const ros = out.records.find((r) => r.email.startsWith('rosalind'));
  assert.equal(ros.interaction_count, 3, 'message count');
  assert.equal(ros.full_name, 'Rosalind Wexley', 'quoted "Last, First" and base64 encoded-word names');
  assert.equal(out.records.find((r) => r.email.startsWith('jose')).full_name, 'José Arbelo', 'Q encoded-word');
  assert.equal(out.records.find((r) => r.email.startsWith('tamsin')).full_name, "Tamsin O'Rourke", 'folded To header');
  assert.equal(out.skipped, 1, 'notifications@ address skipped');
  assert.equal(defaultStrength('email_headers', 3), 'some');
});

test('mbox: streaming in tiny chunks gives the same result as in-memory parsing; CRLF works', async () => {
  const buf = Buffer.from(fixture('mail.mbox').toString('utf8').replace(/\n/g, '\r\n'));
  const a = parseMbox(buf, { selfEmails: ['owner@myco.example'] });
  const chunks = [];
  for (let i = 0; i < buf.length; i += 7) chunks.push(buf.subarray(i, i + 7));
  const b = await parseMboxStream(Readable.from(chunks), { selfEmails: ['owner@myco.example'] });
  assert.deepEqual(b.records, a.records);
  assert.equal(a.messages, 3);
  assert.equal(a.records.length, 3);
});

test('mbox: long body lines are not buffered and cannot fake a header', () => {
  const huge = 'x'.repeat(3 * 1024 * 1024);
  const text = `From a@b Mon Jan 1 00:00:00 2026\nFrom: Kit Arden <kit@arden.example>\nTo: me@mine.example\n\n${huge} From: Fake Person <fake@fake.example>\n`;
  const out = parseMbox(Buffer.from(text), { selfEmails: ['me@mine.example'] });
  assert.deepEqual(out.records.map((r) => r.email), ['kit@arden.example']);
});

test('address list parsing', () => {
  const list = parseAddressList(' "Doe, Jane" <JANE@x.example>, bob@y.example (Bob Smith), Group: a@z.example;, <c@d.example>');
  assert.deepEqual(list.map((a) => a.email), ['jane@x.example', 'bob@y.example', 'a@z.example', 'c@d.example']);
  assert.equal(list[0].name, 'Jane Doe');
  assert.equal(list[1].name, 'Bob Smith');
});

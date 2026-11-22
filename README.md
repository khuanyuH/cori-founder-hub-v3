# CORI Founder Hub v3

A closed, local-first hub where CORI portfolio founders, board members, staff and mentors pool their
networks so founders can find **warm introductions** to customers and connectors (associations,
distributors, regulators), plus talent. Members sign in with an account, keep their own saved searches,
ask each other questions in a **forum**, and post openings on a **jobs board**.

## Run it

Requires Node 24 (uses the built-in `node:sqlite`). No external services, works offline.

```sh
npm install
npm run seed     # recreates data/hub.db with synthetic demo data (8 members, ~1,500 people)
npm start        # http://localhost:4310
npm test         # node --test, uses temp databases only
```

- `HUB_DB=/path/to/file.db` overrides the database location (default `data/hub.db`).
- `PORT` overrides the port (default 4310).
- `ANTHROPIC_API_KEY` is optional; everything works without it.
- Sign in at `/#/signin`. After `npm run seed`, every demo member signs in with the email in
  `server/seed/data.js` (`MEMBERS`) and the shared password `DEMO_PASSWORD` in the same file.
- `HUB_INVITE_CODE=<code>` makes sign-up ask for that code (recommended for any shared deployment).
- Deploying to a live site: see `DEPLOY.md` and `render.yaml` (`HUB_TRUST_PROXY`, `HUB_MAX_UPLOAD_MB`).
- `HUB_DEMO_AUTH=1` re-enables the old `X-Member-Id` header and `POST /api/members`. The test suite uses it. Do not set it on a shared server.

## Accounts, profiles and saved searches

- **Sign up / sign in.** Email plus password (at least 8 characters). Passwords are hashed with scrypt.
  The session is a random token in an `HttpOnly`, `SameSite=Lax` cookie (`hub_session`, 30 days); the
  database stores only the SHA-256 of the token. Ten failed sign-ins for one email in 15 minutes lock that email out for the rest of the window.
- **Existing members** (created before accounts existed) have no password. They claim their row by
  signing up with the email already on file. Anyone who knows that email can claim it first, so set
  `HUB_INVITE_CODE`, or set passwords yourself: `npm run passwd -- --list`, then
  `npm run passwd -- --member 3 --email person@company.com --password "..."`. The same command resets a forgotten password.
- **Profile.** `Account and searches` in the account menu: name, role, organisation, location, headline, bio,
  LinkedIn and website links, and password change. Other members see the profile at `/#/members/<id>`
  with the member's forum posts and open jobs. Member emails are never returned by the API.
- **Searches.** Every search is recorded in the member's private recent list (latest 50). "Save this search"
  pins a search; saved searches show under the search box and on the account page.

## Forum

`/#/forum`. Members post a question or an update under one of eight topics, reply in threads (up to six
levels), and upvote posts and replies (one vote per member; authors start with their own vote). Sort by
Active, Newest or Most upvoted; filter by topic; search titles and bodies. Authors edit and delete their
own posts and replies; members with the `staff` role can delete any. A deleted reply keeps its place so
the replies under it stay readable. The privacy scrubber also runs on forum text: an email address or a
phone number typed into a post shows as `[hidden]`.

## Jobs board

`/#/jobs`. A member posts an opening: title, role type, employment type, location, workplace, optional
salary range and equity, a description, a company blurb (prefilled from the business profile), and an
**application link**. The hub never collects applications: "Apply" opens the company's own page in a new
tab. Only `http(s)` links are accepted. Browse with search and three filters, save jobs, and manage your
own postings (edit, close, reopen, delete). Closed jobs leave the board but stay visible to the poster.

## Design

One look, named Almanac: dark masthead, slab-serif headlines, ruled ledgers and square corners, in CORI
colors. All styles live in `public/styles.css`. The hub uses fonts already on the computer; CORI's
"Bitter" serif is used when it is installed.

## Importing a network: what each source needs

Upload on the Import page (or `POST /api/import`). The hub detects the source from the file; you can
also pick it. Everything is processed locally.

| Source | What to upload | How to export it |
|---|---|---|
| LinkedIn | `Connections.csv` or the whole export `.zip` | LinkedIn > Me > Settings & Privacy > Data privacy > Download your data > "Download larger data archive". The email can take up to 24 hours; upload the zip as is (only `Connections.csv` is read). |
| Google Contacts | `contacts.csv` | contacts.google.com > Export > "Google CSV". Old and new header formats both work. |
| Outlook | `contacts.csv` | Outlook on the web: People > Manage contacts > Export contacts. Desktop: File > Open & Export > Import/Export > Export to a file > CSV. |
| vCard | `.vcf` | Apple Contacts: select all > File > Export > Export vCard. Phones and most CRMs export `.vcf` too. |
| Calendar | `.ics` | Google Calendar: Settings > Import & export > Export (unzip, upload your calendar's `.ics`). Outlook: save calendar as iCalendar. People you shared meetings with are counted; 5+ shared events = strong tie. |
| Email (headers only) | `.mbox` | Google Takeout > Mail > All mail. Only `From`/`To`/`Cc` headers are read; message bodies are never read or stored. Max 200 MB. |
| Roster / paste | pasted text or any CSV | Board lists, event attendee lists. One person per line: `Name, Title, Company` or `Name - Title at Company`. CSVs with any headers (Name/Title/Company/Organization...) work. |
| Manual | form | Add one person with a vouch note ("happy to introduce"). Counts as a strong tie. |

Default tie strength: manual = strong; calendar/email = strong at 5+ interactions, some at 2-4, else
weak; Google/Outlook/vCard = some; LinkedIn/roster = weak. Your own address is excluded from calendar
and email imports. Automated senders (noreply, notifications...) and entries without a real name are
skipped. People are de-duplicated across members and sources (LinkedIn URL, else email, else
first+last+company), so the same person known by three members is one row with three introducers.

Import responses: `new_people` = people new to the whole pool, `new_connections` = new
(you, person, source) links, `already_known` = records for people you were already connected to,
`skipped` = rows without a usable name (or yourself).

Remove a source any time (Network page, or `DELETE /api/network/source/:source`).

## How people are classified (and re-classified)

Every person gets `industries`, `org_type`, `job_function` and `seniority` from `server/matching/enrich.js`
when they are imported. Evidence, strongest first:

1. A built-in table of a few hundred well-known US employers (`server/matching/companies.js`: consulting,
   banks, PE/VC/hedge funds/trading firms, big tech, big law, accounting, pharma, insurers, health systems,
   federal agencies and the military, media, major nonprofits, retailers, ag and food majors). Matching
   ignores case, punctuation, "& Company"/Inc/LLC/LLP suffixes and knows common aliases
   ("JPMorgan Chase" = "J.P. Morgan").
2. Student, campus and alumni groups ("Yale Computer Society") are education, never trade associations.
   Sports leagues, unions, historical/arts/advocacy societies and legal-aid societies are not either.
   A **trade/professional association** needs a positive signal: an industry or profession term the
   taxonomy knows ("Dental Society", "Bankers Association", "Farm Bureau") or a chamber/business-league form.
3. Generic cues: "School of X", "University", "College", "Institute" -> higher education; "Capital",
   "Ventures", "Asset Management", "Equity" -> investment; "Partners"/"Advisors" -> investment only with
   a finance title. Then industry words in the company name, then in the title.

Students, candidates, interns, incoming hires, fellows/trainees and volunteers are detected from the
title at search time; they rank far down for customer/connector/partner/investor leads with an honest
first reason ("Student: not a buyer, but may know people in the field"). Talent search still shows them.
Partner suggestions need a business-development, founder/owner or leadership role. Search results are
spread across organisations (the k-th person at the same firm scores 0.85^k).

After the classifier changes, re-classify the rows already in the database:

```sh
npm run reenrich                 # all people; prints before/after counts
npm run reenrich -- --member 9   # also print counts for one member's contacts
```

It recomputes the four fields for every person and rebuilds `people_fts` in one transaction. It is
idempotent and safe while the server is running, but **restart the server** afterwards so search uses
the new code. With `ANTHROPIC_API_KEY` set (and without `--no-llm`), companies the heuristics cannot
classify are first sent to the model **by name only**, in batches; answers are cached in the
`company_classifications` table and used only where the heuristics found nothing. Imports and searches
never call the model for this.

`npm run eval` runs the ranking benchmark (`eval/`), including real-world-style hard cases and a
buyer-inference check on invented one-paragraph descriptions (`eval/buyers.js`).

## Business profile: who buys

The Business profile page is a four-step guided flow (about a minute): name and description; **who
buys** (buyer types the hub suggests from your words, each with the phrase that justifies it, e.g.
"because you wrote: 'for dairy farmers'", plus a searchable list of every buyer type and a free-text
"someone else"); which kinds of leads you want (customers, connectors, partners, investors); optional
geography and hires. At least one confirmed buyer type or a free-text buyer is required to save.

- **Confirmed buyer types** (`businesses.customer_industries`) are the only source of customer,
  connector and partner suggestions. The description can still add talent and investor searches.
- Without confirmed types, the hub infers buyers only from explicit statements ("for X", "helps X",
  "sold to X", "used by X", "X use it to", "<X> software", plural buyer nouns, or the "someone else"
  text). Words that describe the technology or your own category ("AI", "satellite", "collagen",
  "robots", "SaaS", "remediation") never create customers. There is no keyword "Likely buyers" fallback.
- With no confident buyer, `GET /api/leads/suggested` returns `needs_input: true`, no leads and a message,
  and the Leads page links to the profile. Older profiles keep working (buyers are read from their
  "who are your customers" text) and are asked to confirm.
- `GET /api/taxonomy` lists the buyer types (`id`, `label`, `group`, `examples`). Buyer types live in
  `server/matching/taxonomy.js`; inference is in `server/matching/buyers.js`.
- Existing databases get the two new columns automatically on start (`ALTER TABLE ... ADD COLUMN`,
  nothing is recreated). After upgrading, run `npm run reenrich` once so existing contacts are tagged
  with the new buyer types (landscaping, home services, dairy and livestock, data centers, architecture
  and engineering, small business, museums and galleries), then restart the server.

## Privacy model

- **No API response ever contains a contact's email address or phone number.** Emails are kept only in
  `connections.private_email`, used solely to de-duplicate people; phone numbers are never parsed.
  Text fields and notes are scrubbed of anything that looks like an email or phone number on the way
  in, and every JSON response passes through a final scrubber. `test/api/privacy.test.js` enforces this.
- Member emails are not returned by the API either.
- Email imports read headers only; bodies are skipped byte-for-byte without being decoded.
- Other members see who you know (name, company, title, how strongly, your vouch note) so they can ask
  you for an introduction. The only action on a person is "request intro", which goes to you; you
  accept or decline.
- The repository contains only synthetic data. Demo emails use the reserved `.example` domain.
- Everything runs on your machine; no data leaves it.

## Layout

```
server/index.js          Express app (API under /api, static files from public/)
server/db.js             node:sqlite, schema, upsertPerson/addConnection (dedup, enrichment, FTS sync)
server/importers/        one parser per source + detectSource/parseFile/importRecords
server/routes/           HTTP API
server/matching/         enrichment (enrich.js, companies.js), search, lead suggestions, reenrich CLI
server/seed/             deterministic synthetic seed
public/                  frontend (plain HTML/CSS/JS)
test/                    node:test suites and synthetic fixtures
```

# CORI Founder Hub v3: build contract

Shared contract for the agents that build this app. The orchestrator owns this file and `server/schema.sql`.

## Product

A closed hub for CORI (Center on Rural Innovation) portfolio founders, board members, staff, and mentors.
Priority 1 is **lead generation through warm introductions**. Motivating case: a portfolio company sold software
to dental offices. Months later it learned that a board member knew someone at the New Hampshire dental association.
The hub must surface that kind of link on day one.

- Members upload their networks (LinkedIn first, other sources too). The networks pool.
- A member searches the pool in plain language ("dental association leaders in New England").
- A member describes their business once. The hub then **proactively suggests leads**: direct customers,
  and also *connectors* (associations, trade groups, distributors, regulators) who reach many customers.
- Each result shows **who in the hub knows the person** and how strongly. The only action is "request intro".
- Priority 2 (lighter): talent search ("fractional CFO", "marketing lead") over the same pool.
- Out of scope for this draft: forum/Q&A board, real authentication, deployment.

## Hard rules

- Zero external services required. `npm install && npm run seed && npm start` must work offline. Port **4310**.
- Node 24, ESM (`"type": "module"`). Database: built-in `node:sqlite` (`DatabaseSync`). Verify FTS5 works in it first;
  if it does not, use `better-sqlite3` and say so in your report. Web server: Express. Uploads: `multer` (memory storage).
- No build step for the frontend. Plain HTML/CSS/JS in `public/`, served by Express.
- **Privacy:** no API response ever contains an email address or phone number of a contact. `connections.private_email`
  is stored only for dedup. A test must assert this.
- **No real personal data in the repo.** Seed and fixtures are synthetic (invented names). Do not read or copy
  `../CORI-Founder-Hub/connections_data/Connections.csv` contents into any file. You may read only its first 5 lines to learn the format.
- Demo auth: the client sends header `X-Member-Id: <id>`. Missing/unknown id -> 401 on member-scoped routes.
- An optional `ANTHROPIC_API_KEY` env var may enable LLM features. Everything must work without it. No key is set on this machine.
- Tests: `npm test` runs `node --test`. Tests use a temp database file, never `data/hub.db`.
- DB path: `process.env.HUB_DB || data/hub.db`.

## File ownership (do not edit files you do not own)

| Owner | Files |
|---|---|
| orchestrator | `CONTRACT.md`, `server/schema.sql` |
| backend agent | `package.json`, `server/index.js`, `server/db.js`, `server/routes/**`, `server/importers/**`, `server/seed/**`, `test/importers/**`, `test/api/**`, `test/fixtures/**`, `README.md` |
| matching agent | `server/matching/**`, `test/matching/**`, `eval/**` |
| frontend agent | `public/**` |

## Module interfaces

### `server/db.js` (backend agent)
```js
export function openDb(path?)          // opens, applies schema.sql, returns DatabaseSync
export function upsertPerson(db, rec)  // -> { personId, created }  ; computes dedup_key, calls enrichPerson, syncs people_fts
export function addConnection(db, { memberId, personId, source, strength, interactionCount, connectedOn, note, privateEmail }) // -> { created }
```
`people_fts` rowid = `people.id`. The `tags` column holds industries, org_type, and job_function joined by spaces.
dedup_key: normalized LinkedIn URL (lowercase, no protocol/www/query/trailing slash); else lowercase email; else `first|last|company` lowercase.
If a later record matches on email or `first|last|company` and adds a LinkedIn URL, keep the one person row.

### `server/importers/index.js` (backend agent)
```js
export function detectSource(filename, buffer)          // -> source id or null
export async function parseFile(filename, buffer, hint?) // -> { source, records: ContactRecord[], warnings: string[] }
export function parsePastedText(text)                    // -> ContactRecord[]  (source 'roster')
```
`ContactRecord = { first_name, last_name, full_name, company, title, linkedin_url, email, location, connected_on, interaction_count, note, source }`

Sources to support:
| source id | Input | Notes |
|---|---|---|
| `linkedin` | `Connections.csv`, or the LinkedIn export **.zip** that contains it | Preamble "Notes:" lines sit before the header row. Find the row that starts with `First Name`. Date format `19 Apr 2026`. |
| `google_contacts` | Google Contacts CSV export | Columns vary by export version (`Name`, `Given Name`, `First Name`, `Organization 1 - Name`, `Organization Name`, `Organization Title`, `E-mail 1 - Value`). Handle both old and new header sets. |
| `outlook_contacts` | Outlook CSV export | `First Name`, `Last Name`, `Company`, `Job Title`, `E-mail Address`. |
| `vcard` | `.vcf` (Apple Contacts, Outlook, phones) | Multi-card files. `FN`, `N`, `ORG`, `TITLE`, `EMAIL`, `URL`, `ADR`. Handle line folding. |
| `calendar` | `.ics` export | Collect `ATTENDEE`/`ORGANIZER` across events. `interaction_count` = number of events shared. Name from `CN=`, company guessed from email domain (skip free-mail domains). Exclude the uploading member's own email. |
| `email_headers` | `.mbox` (Google Takeout) | Read **only** `From`/`To`/`Cc` headers, never bodies. `interaction_count` = message count. Stream it; files are large. Cap at 200 MB. |
| `manual` | JSON from a form | One contact plus a vouch note. |
| `roster` | Pasted text or CSV with any headers | Board lists, event attendee lists. One person per line: `Name, Title, Company` or `Name - Title at Company`. |

Default strength: `manual` strong. `calendar`/`email_headers`: >=5 interactions strong, 2-4 some, else weak.
`google_contacts`/`outlook_contacts`/`vcard`: some. `linkedin`/`roster`: weak. Records that have no name are skipped.
Calendar/email records with no real name (name equals the email, or `noreply`-style addresses) are skipped.

### `server/matching/index.js` (matching agent)
```js
export function enrichPerson({ full_name, company, title, location })
  // pure, sync, fast -> { industries: string[], org_type, job_function, seniority }
export async function search(db, { query, mode = 'leads', memberId, limit = 25 })
  // mode: 'leads' | 'talent' | 'any' -> Result[]
export async function suggestLeads(db, { memberId, limit = 30 })
  // reads the member's businesses row -> { personas: Persona[], leads: (Result & { persona, lead_type })[] }
export function explainBusiness(business) // -> Persona[]   (no db; used for the profile-page preview)
```
```
Result  = { person: { id, full_name, company, title, location, linkedin_url, industries, org_type, job_function, seniority },
            score: number (0..1), reasons: string[],            // human-readable, e.g. "Works at a dental association"
            known_by: [{ member_id, name, role, strength, sources: string[], note }] }  // strongest first
Persona = { id, label, lead_type: 'customer'|'connector'|'partner'|'investor'|'talent', why: string, queries: string[] }
```
Rules: never return people that only the requesting member knows *as an intro target*; still include them with
`known_by` containing the member, flagged by `reasons` ("Already in your own network"), ranked below others.
Exclude leads the member dismissed (`lead_feedback.verdict='dismissed'`). Ranking blends topical relevance,
connection strength, and number of introducers. `suggestLeads` must diversify: not all leads from one persona.

### HTTP API (backend agent). JSON everywhere. Errors: `{ error: string }` with a 4xx/5xx status.
| Method + path | Body / query | Response |
|---|---|---|
| GET `/api/members` | | `[{ id, name, org, role, connection_count }]` (no auth) |
| POST `/api/members` | `{ name, email?, org?, role? }` | member (no auth) |
| GET `/api/me` | | `{ member, business \| null, stats: { connections, by_source: {..}, pool_people, pool_members } }` |
| PUT `/api/business` | `{ name, description, industry, target_customers, geography, needs }` | `{ business, personas }` |
| POST `/api/business/preview` | same | `{ personas }` (no write) |
| POST `/api/import/preview` | multipart `file`, optional `source` | `{ source, parsed, warnings, sample: ContactRecord[<=10] without email }` |
| POST `/api/import` | multipart `file`, optional `source` | `{ source, parsed, new_people, new_connections, already_known, skipped, warnings }` |
| POST `/api/import/paste` | `{ text, preview?: boolean }` | same shape as import (or preview) |
| POST `/api/contacts` | `{ full_name, company, title, linkedin_url?, location?, note? }` | `{ person_id, created }` (source `manual`) |
| GET `/api/network` | `?q=&source=&limit=&offset=` | `{ total, items: [{ person, sources, strength, note }] }` (the member's own contacts) |
| DELETE `/api/network/source/:source` | | `{ removed }` (removes the member's edges from that source) |
| GET `/api/search` | `?q=&mode=leads\|talent\|any&limit=` | `{ query, results: Result[] }` |
| GET `/api/leads/suggested` | `?limit=` | `{ personas, leads }` ; 409 `{ error }` if the member has no business profile |
| POST `/api/leads/:personId/feedback` | `{ verdict: 'saved'\|'dismissed'\|'clear' }` | `{ ok: true }` |
| GET `/api/leads/saved` | | `{ results: Result[] }` |
| POST `/api/intros` | `{ person_id, introducer_id, message }` | intro |
| GET `/api/intros` | | `{ incoming: Intro[], outgoing: Intro[] }` with `person`, `requester`, `introducer` objects embedded |
| PATCH `/api/intros/:id` | `{ status }` | intro (only the introducer may accept/decline; requester may mark done) |
| GET `/api/health` | | `{ ok: true }` |

### Seed (`npm run seed`, backend agent)
Synthetic and deterministic (fixed RNG seed). Recreates `data/hub.db`.
- About 8 members: 4 founders with business profiles, 2 board members, 1 CORI staff, 1 mentor. Rural-innovation flavour.
- One founder runs **"BrightChair"**: scheduling and billing software for dental offices, New England.
- One board member's network contains a director at the **"New Hampshire Dental Society"** and other association contacts.
  Searching or suggesting leads as the BrightChair founder must surface that person, known by the board member.
- Other founders: for example ag-tech for small farms, telehealth for rural clinics, a workforce-training SaaS for community colleges.
- About 1,500 people total, 150 to 400 per member, with realistic overlap (some people known by 2 to 3 members).
  Mix of industries, associations, government, hospitals, banks, investors, and ordinary corporate roles as noise.
- A mix of sources and strengths so the UI shows variety.

## Addendum 2 (2026-11-12): guided business profile

Why: a test with 49 real startup descriptions showed that the engine misreads the buyer when it infers from free text.
13 of 49 fell back to a keyword persona "Likely buyers" that returned junk. Incidental words set wrong customers
("satellite" -> aerospace buyers for a farm irrigation product).

- `businesses.customer_industries` (JSON array of taxonomy ids) holds the buyer types that the founder **confirmed**.
  `businesses.lead_types` (JSON array) holds the wanted lead types. `db.js` migrates existing databases with
  `ALTER TABLE ... ADD COLUMN` when the columns are missing. Never recreate an existing database.
- When `customer_industries` is non-empty: customer and connector personas come **only** from it. Description text
  may still add talent and investor personas and may refine wording. It never adds a customer industry.
- When it is empty: the engine may infer, but only from explicit buyer statements ("for dentists", "helps farmers",
  "sells to hospitals", "used by utilities"). Each inferred industry carries the evidence phrase. No "Likely buyers"
  keyword fallback exists. With no confident inference, personas are empty and `needs_input` is true.
- `GET /api/taxonomy` (no auth) -> `[{ id, label, group, examples: string[] }]` : buyer types a founder can pick, in plain words.
- `POST /api/business/preview` and `PUT /api/business` accept `customer_industries` and `lead_types`, and return
  `{ personas, suggested_customers: [{ id, label, evidence }], needs_input: boolean }` (PUT also returns `business`).
- `GET /api/leads/suggested` returns `{ personas, leads, needs_input, message? }`. With `needs_input` true, `leads` is empty.
- `GET /api/me` returns the two new fields on `business` as arrays.

## Addendum 3 (2026-11-16): accounts, saved searches, forum, jobs board

This addendum replaces two earlier lines: "Out of scope: forum/Q&A board, real authentication" and "Demo auth".

- **Auth.** Session cookie `hub_session` (HttpOnly, SameSite=Lax). Missing or expired session -> 401 on member-scoped routes.
  `HUB_DEMO_AUTH=1` restores the `X-Member-Id` header and `POST /api/members` for tests only.
  `HUB_INVITE_CODE` (optional) gates sign-up. `members.password_hash` is never returned.
- `GET /api/members` needs a session (open only in demo mode). Member objects gain `headline`.
- The response scrubber keeps digits inside `http(s)` links (a posting id is not a phone number). Emails are still removed everywhere.

| Method + path | Body / query | Response |
|---|---|---|
| GET `/api/auth/config` | | `{ demo_auth, min_password, invite_required }` (no auth) |
| POST `/api/auth/signup` | `{ name, email, password, org?, role?, invite_code? }` | 201 `{ member, claimed }` + cookie. A member without a password is claimed by its email. |
| POST `/api/auth/login` | `{ email, password }` | `{ member }` + cookie; 401 wrong; 429 after 10 failures in 15 min |
| POST `/api/auth/logout` | | `{ ok }` |
| POST `/api/auth/password` | `{ current, next }` | `{ ok }`; other sessions end |
| GET `/api/me` | | adds profile fields on `member` and `has_password` |
| PATCH `/api/me` | `{ name?, role?, org?, headline?, bio?, location?, linkedin_url?, website_url? }` | `{ member }` |
| GET `/api/members/:id` | | `{ member, business, stats, posts, jobs }` |
| GET `/api/searches` | | `{ saved: [{ id, query, mode, created_at }], recent: [{ ..., result_count }] }` |
| POST `/api/searches` | `{ query, mode }` | saved search (idempotent) |
| DELETE `/api/searches/:id`, DELETE `/api/searches/history` | | |
| GET `/api/forum/posts` | `?sort=hot\|new\|top&category=&q=&author=&limit=&offset=` | `{ total, sort, items, category_counts }` |
| POST `/api/forum/posts` | `{ title, body?, category }` | post |
| GET / PATCH / DELETE `/api/forum/posts/:id` | | `{ post, comments }` / post / `{ ok }` (author; staff may delete) |
| POST `/api/forum/posts/:id/comments` | `{ body, parent_id? }` | comment |
| DELETE `/api/forum/comments/:id` | | soft delete |
| POST `/api/forum/vote` | `{ target_type: 'post'\|'comment', target_id, value: 1\|0 }` | `{ score, my_vote }` |
| GET `/api/jobs` | `?q=&job_function=&workplace=&employment_type=&saved=1&mine=1` | `{ total, items, open_jobs, open_companies }` |
| POST `/api/jobs` | job fields; `apply_url` required, http(s) only | job |
| GET / PATCH / DELETE `/api/jobs/:id` | PATCH also takes `status: 'open'\|'closed'` | job (poster only; staff may delete) |
| POST `/api/jobs/:id/save` | `{ saved?: boolean }` | `{ saved }` |

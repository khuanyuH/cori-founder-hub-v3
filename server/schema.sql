-- CORI Founder Hub v3 schema (SQLite). Owned by the orchestrator. Do not change
-- column names without updating CONTRACT.md.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- A hub user: founder, board member, CORI staff, mentor, or investor.
CREATE TABLE IF NOT EXISTS members (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,
  org         TEXT,                 -- company or affiliation
  role        TEXT NOT NULL DEFAULT 'founder', -- founder|board|staff|mentor|investor
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  -- Account and public profile (Addendum 3). password_hash is NEVER returned by any API response.
  password_hash TEXT,               -- scrypt$<salt hex>$<hash hex>; NULL = account not claimed yet
  headline    TEXT,                 -- one line, e.g. "Founder, BrightChair. Dental software."
  bio         TEXT,
  location    TEXT,
  linkedin_url TEXT,
  website_url TEXT
);

-- What a member's business sells and to whom. Drives proactive lead suggestions.
CREATE TABLE IF NOT EXISTS businesses (
  id              INTEGER PRIMARY KEY,
  member_id       INTEGER NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,             -- free text: what the product does
  industry        TEXT,             -- free text: e.g. "dental practice software"
  target_customers TEXT,            -- free text: who buys, e.g. "dental offices, DSOs"
  geography       TEXT,             -- free text: e.g. "New England"
  needs           TEXT,             -- free text: hiring or other needs, e.g. "fractional CFO"
  -- Guided profile: taxonomy industry ids the founder CONFIRMED as buyers. When non-empty,
  -- customer and connector personas come only from this list (no inference from description).
  customer_industries TEXT NOT NULL DEFAULT '[]',  -- JSON array of taxonomy industry ids
  lead_types      TEXT NOT NULL DEFAULT '["customer","connector","partner"]', -- JSON array of wanted lead types
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per real-world person in the pooled network. Shared across members.
CREATE TABLE IF NOT EXISTS people (
  id           INTEGER PRIMARY KEY,
  full_name    TEXT NOT NULL,
  first_name   TEXT,
  last_name    TEXT,
  company      TEXT,
  title        TEXT,
  linkedin_url TEXT,
  location     TEXT,
  dedup_key    TEXT NOT NULL UNIQUE, -- normalized linkedin url, else email, else "first|last|company"
  -- Derived by matching.enrichPerson() at insert/update time:
  industries   TEXT NOT NULL DEFAULT '[]', -- JSON array of taxonomy industry ids
  org_type     TEXT,                -- company|association|government|nonprofit|education|healthcare_provider|investor|other
  job_function TEXT,                -- sales|marketing|finance|engineering|operations|legal|hr|product|executive|clinical|other
  seniority    TEXT,                -- owner|c_level|vp|director|manager|ic|unknown
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- An edge: member knows person, via one source. Several sources per pair are allowed.
CREATE TABLE IF NOT EXISTS connections (
  id                INTEGER PRIMARY KEY,
  member_id         INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  person_id         INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  source            TEXT NOT NULL,  -- linkedin|google_contacts|outlook_contacts|vcard|calendar|email_headers|manual|roster
  strength          TEXT NOT NULL DEFAULT 'weak', -- strong|some|weak
  interaction_count INTEGER NOT NULL DEFAULT 0,
  connected_on      TEXT,           -- ISO date if known
  note              TEXT,           -- member's own note / vouch
  private_email     TEXT,           -- NEVER returned by any API response
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (member_id, person_id, source)
);
CREATE INDEX IF NOT EXISTS idx_connections_person ON connections(person_id);
CREATE INDEX IF NOT EXISTS idx_connections_member ON connections(member_id);

-- Full-text index over people. Kept in sync by the code that writes people.
CREATE VIRTUAL TABLE IF NOT EXISTS people_fts USING fts5(
  full_name, company, title, location, tags,   -- tags = industries + org_type + job_function as words
  content='', contentless_delete=1, tokenize='porter unicode61'
);

CREATE TABLE IF NOT EXISTS intro_requests (
  id            INTEGER PRIMARY KEY,
  requester_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  introducer_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  person_id     INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending|accepted|declined|done
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A member's verdict on a suggested lead. Dismissed leads do not return.
CREATE TABLE IF NOT EXISTS lead_feedback (
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  person_id  INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  verdict    TEXT NOT NULL,         -- saved|dismissed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, person_id)
);

-- ---------------------------------------------------------------------------
-- Addendum 3 (2026-11-16): accounts, saved searches, forum, jobs board.
-- ---------------------------------------------------------------------------

-- Login sessions. The cookie holds a random token; only its SHA-256 is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_member ON sessions(member_id);

-- Searches a member pinned to run again.
CREATE TABLE IF NOT EXISTS saved_searches (
  id         INTEGER PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  query      TEXT NOT NULL,
  mode       TEXT NOT NULL DEFAULT 'leads', -- leads|talent|any
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (member_id, query, mode)
);

-- Recent searches per member (trimmed to the latest 50 by the API).
CREATE TABLE IF NOT EXISTS search_history (
  id           INTEGER PRIMARY KEY,
  member_id    INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  query        TEXT NOT NULL,
  mode         TEXT NOT NULL DEFAULT 'leads',
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_search_history_member ON search_history(member_id, id);

-- Forum: posts, threaded comments, one upvote per member per item.
CREATE TABLE IF NOT EXISTS forum_posts (
  id         INTEGER PRIMARY KEY,
  author_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  category   TEXT NOT NULL DEFAULT 'general', -- help|advice|fundraising|sales|hiring|product|wins|general
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_forum_posts_author ON forum_posts(author_id);

CREATE TABLE IF NOT EXISTS forum_comments (
  id         INTEGER PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES forum_comments(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0, -- 1 = body hidden, replies kept
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_forum_comments_post ON forum_comments(post_id);

CREATE TABLE IF NOT EXISTS forum_votes (
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,   -- post|comment
  target_id   INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_forum_votes_target ON forum_votes(target_type, target_id);

-- Jobs board. Applications happen off-site: apply_url points at the company's own application page.
CREATE TABLE IF NOT EXISTS jobs (
  id              INTEGER PRIMARY KEY,
  poster_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  company         TEXT NOT NULL,
  company_url     TEXT,
  company_blurb   TEXT,             -- what the company does, one short paragraph
  location        TEXT,             -- free text, e.g. "Keene, NH"
  workplace       TEXT NOT NULL DEFAULT 'onsite',     -- onsite|hybrid|remote
  employment_type TEXT NOT NULL DEFAULT 'full_time',  -- full_time|part_time|contract|fractional|internship
  job_function    TEXT NOT NULL DEFAULT 'other',      -- engineering|product|design|sales|marketing|operations|finance|customer|people|other
  salary_min      INTEGER,          -- USD per year, optional
  salary_max      INTEGER,
  equity          TEXT,             -- free text, e.g. "0.25% - 1.0%"
  description     TEXT NOT NULL,
  apply_url       TEXT NOT NULL,    -- external http(s) link
  status          TEXT NOT NULL DEFAULT 'open',       -- open|closed
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, id);

CREATE TABLE IF NOT EXISTS saved_jobs (
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, job_id)
);

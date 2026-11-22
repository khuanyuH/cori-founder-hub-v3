// Shared test helpers (not a test file itself). Every test uses a fresh temp database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function fixture(name) {
  return fs.readFileSync(path.join(HERE, name));
}

export function tempDbPath(label = 'hub') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cori-hub-test-${label}-`));
  return path.join(dir, 'test.db');
}

export async function openTempDb(label) {
  const { openDb } = await import('../../server/db.js');
  const p = tempDbPath(label);
  return { db: openDb(p), path: p };
}

/** Start the app on an ephemeral port with a temp DB. */
export async function startTestServer({ seed = false, label = 'api', demoAuth = true } = {}) {
  // The older suites sign in with the demo X-Member-Id header. Auth tests pass demoAuth: false.
  process.env.HUB_DEMO_AUTH = demoAuth ? '1' : '0';
  const { openDb } = await import('../../server/db.js');
  const { createApp } = await import('../../server/index.js');
  const dbPath = tempDbPath(label);
  const db = openDb(dbPath);
  let seeded = null;
  if (seed) {
    const { seedDatabase } = await import('../../server/seed/index.js');
    seeded = seedDatabase(db);
  }
  const app = createApp(db);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const bodies = []; // every response body text, for the privacy test

  async function call(method, url, { member, json, form, cookie } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (member) headers['X-Member-Id'] = String(member);
    let body;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const res = await fetch(base + url, { method, headers, body });
    const text = await res.text();
    bodies.push({ method, url, text });
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    const setCookie = res.headers.getSetCookie?.() || [];
    return { status: res.status, data, text, cookie: setCookie.map((c) => c.split(';')[0]).join('; ') || null, setCookie };
  }

  function upload(url, member, filename, buffer, fields = {}) {
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return call('POST', url, { member, form });
  }

  async function close() {
    await new Promise((r) => server.close(r));
    db.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }

  return { base, db, dbPath, call, upload, close, bodies, seeded };
}

export const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
export const PHONE_PATTERN = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;

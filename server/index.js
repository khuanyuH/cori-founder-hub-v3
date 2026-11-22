// CORI Founder Hub v3 server: JSON API under /api and static files from public/.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, ROOT, matching } from './db.js';
import { apiRouter } from './routes/index.js';

export const PUBLIC_DIR = path.join(ROOT, 'public');

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  // Behind a host's HTTPS proxy (Render), HUB_TRUST_PROXY=1 lets Express see the original scheme,
  // so the session cookie gets its Secure flag. Leave it unset when the server is reached directly.
  if (process.env.HUB_TRUST_PROXY) app.set('trust proxy', Number(process.env.HUB_TRUST_PROXY) || 1);
  app.use('/api', apiRouter(db));
  app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));
  // Plain 404 for anything else (no placeholder page).
  app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found');
  });
  return app;
}

export function start({ port = Number(process.env.PORT) || 4310, dbPath } = {}) {
  const db = openDb(dbPath);
  const app = createApp(db);
  const server = app.listen(port, (err) => {
    if (err) {
      // Express 5 passes listen errors to this callback.
      const why = err.code === 'EADDRINUSE'
        ? `Port ${port} is already in use. Another copy of the hub is probably running. Stop it first, or start with PORT=<other port>.`
        : `Could not start the server: ${err.message}`;
      console.error(why);
      process.exit(1);
    }
    const addr = server.address();
    console.log(`CORI Founder Hub listening on http://localhost:${addr.port} (matching: ${matching.__kind})`);
    if (!fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) console.log('Note: public/index.html not found; only the API is served.');
  });
  const stop = () => { server.close(() => { try { db.close(); } catch { /* ignore */ } process.exit(0); }); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return { app, server, db };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start();
}

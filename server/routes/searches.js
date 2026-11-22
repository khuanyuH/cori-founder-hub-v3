// A member's own searches: pinned (saved) searches and recent history.
import { Router } from 'express';
import { stmt } from '../db.js';
import { HttpError, requireMember, str } from './util.js';

const MODES = ['leads', 'talent', 'any'];

export function searchesRouter(db) {
  const r = Router();
  const auth = requireMember(db);

  r.get('/searches', auth, (req, res) => {
    const saved = stmt(db, 'SELECT id, query, mode, created_at FROM saved_searches WHERE member_id = ? ORDER BY id DESC').all(req.member.id);
    const recent = stmt(db, `SELECT id, query, mode, result_count, created_at FROM search_history
        WHERE member_id = ? ORDER BY id DESC LIMIT 20`).all(req.member.id);
    res.json({ saved, recent });
  });

  r.post('/searches', auth, (req, res) => {
    const query = str(req.body?.query, 500);
    if (!query) throw new HttpError(400, 'query is required');
    const mode = str(req.body?.mode, 10) || 'leads';
    if (!MODES.includes(mode)) throw new HttpError(400, `mode must be one of ${MODES.join(', ')}`);
    const n = stmt(db, 'SELECT COUNT(*) AS n FROM saved_searches WHERE member_id = ?').get(req.member.id).n;
    const existing = stmt(db, 'SELECT id, query, mode, created_at FROM saved_searches WHERE member_id = ? AND query = ? COLLATE NOCASE AND mode = ?')
      .get(req.member.id, query, mode);
    if (existing) { res.json(existing); return; }
    if (n >= 100) throw new HttpError(400, 'You can keep up to 100 saved searches. Remove one first.');
    const info = stmt(db, 'INSERT INTO saved_searches (member_id, query, mode) VALUES (?,?,?)').run(req.member.id, query, mode);
    res.status(201).json(stmt(db, 'SELECT id, query, mode, created_at FROM saved_searches WHERE id = ?').get(Number(info.lastInsertRowid)));
  });

  r.delete('/searches/history', auth, (req, res) => {
    const info = stmt(db, 'DELETE FROM search_history WHERE member_id = ?').run(req.member.id);
    res.json({ removed: Number(info.changes) });
  });

  r.delete('/searches/:id', auth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
    const info = stmt(db, 'DELETE FROM saved_searches WHERE id = ? AND member_id = ?').run(id, req.member.id);
    if (!info.changes) throw new HttpError(404, 'Saved search not found');
    res.json({ ok: true });
  });

  return r;
}

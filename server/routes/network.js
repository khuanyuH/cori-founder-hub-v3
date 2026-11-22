// The member's own network: list/filter and remove a source.
import { Router } from 'express';
import { stmt, withTransaction, removeOrphanPeople, SOURCES } from '../db.js';
import { HttpError, requireMember, personOut, intParam, str, STRENGTH_RANK } from './util.js';

export function networkRouter(db) {
  const r = Router();
  const auth = requireMember(db);

  r.get('/network', auth, (req, res) => {
    const q = str(req.query.q, 200);
    const source = str(req.query.source, 40);
    if (source && !SOURCES.includes(source)) throw new HttpError(400, `source must be one of ${SOURCES.join(', ')}`);
    const limit = intParam(req.query.limit, 50, 1, 500);
    const offset = intParam(req.query.offset, 0, 0, 1_000_000);

    const where = ['c.member_id = ?'];
    const params = [req.member.id];
    if (source) {
      where.push('EXISTS (SELECT 1 FROM connections c2 WHERE c2.member_id = c.member_id AND c2.person_id = p.id AND c2.source = ?)');
      params.push(source);
    }
    if (q) {
      for (const term of q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8)) {
        where.push(`(lower(p.full_name) LIKE ? ESCAPE '\\' OR lower(coalesce(p.company,'')) LIKE ? ESCAPE '\\'
                     OR lower(coalesce(p.title,'')) LIKE ? ESCAPE '\\' OR lower(coalesce(p.location,'')) LIKE ? ESCAPE '\\')`);
        const like = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
        params.push(like, like, like, like);
      }
    }
    const base = `FROM connections c JOIN people p ON p.id = c.person_id WHERE ${where.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(DISTINCT p.id) AS n ${base}`).get(...params).n;
    const rows = db.prepare(`SELECT p.*,
          group_concat(DISTINCT c.source) AS sources,
          MAX(CASE c.strength WHEN 'strong' THEN 3 WHEN 'some' THEN 2 ELSE 1 END) AS srank
        ${base} GROUP BY p.id
        ORDER BY srank DESC, p.full_name COLLATE NOCASE ASC
        LIMIT ? OFFSET ?`).all(...params, limit, offset);
    const noteStmt = stmt(db, `SELECT note FROM connections WHERE member_id = ? AND person_id = ? AND note IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`);
    const rankName = Object.fromEntries(Object.entries(STRENGTH_RANK).map(([k, v]) => [v, k]));
    const items = rows.map((p) => ({
      person: personOut(p),
      sources: String(p.sources || '').split(',').filter(Boolean).sort(),
      strength: rankName[p.srank] || 'weak',
      note: noteStmt.get(req.member.id, p.id)?.note ?? null,
    }));
    res.json({ total, items });
  });

  r.delete('/network/source/:source', auth, (req, res) => {
    const source = req.params.source;
    if (!SOURCES.includes(source)) throw new HttpError(400, `source must be one of ${SOURCES.join(', ')}`);
    const removed = withTransaction(db, () => {
      const info = stmt(db, 'DELETE FROM connections WHERE member_id = ? AND source = ?').run(req.member.id, source);
      removeOrphanPeople(db);
      return Number(info.changes);
    });
    res.json({ removed });
  });

  return r;
}

// Search, suggested leads, lead feedback, and saved leads.
import { Router } from 'express';
import { stmt, matching } from '../db.js';
import { HttpError, requireMember, personOut, knownBy, intParam, str } from './util.js';

const MODES = ['leads', 'talent', 'any'];
const VERDICTS = ['saved', 'dismissed', 'clear'];

/** Remember the search for the member's "recent searches" list (latest 50, no back-to-back repeats). */
function recordSearch(db, memberId, query, mode, count) {
  try {
    const last = stmt(db, 'SELECT id, query, mode FROM search_history WHERE member_id = ? ORDER BY id DESC LIMIT 1').get(memberId);
    if (last && last.query.toLowerCase() === query.toLowerCase() && last.mode === mode) {
      stmt(db, `UPDATE search_history SET result_count = ?, created_at = datetime('now') WHERE id = ?`).run(count, last.id);
      return;
    }
    stmt(db, 'INSERT INTO search_history (member_id, query, mode, result_count) VALUES (?,?,?,?)').run(memberId, query, mode, count);
    stmt(db, `DELETE FROM search_history WHERE member_id = ? AND id NOT IN
        (SELECT id FROM search_history WHERE member_id = ? ORDER BY id DESC LIMIT 50)`).run(memberId, memberId);
  } catch (err) { console.error('[hub] could not record search', err.message); }
}

export function leadsRouter(db) {
  const r = Router();
  const auth = requireMember(db);

  r.get('/search', auth, async (req, res) => {
    const query = str(req.query.q, 500);
    if (!query) throw new HttpError(400, 'q is required');
    const mode = str(req.query.mode, 10) || 'leads';
    if (!MODES.includes(mode)) throw new HttpError(400, `mode must be one of ${MODES.join(', ')}`);
    const limit = intParam(req.query.limit, 25, 1, 100);
    const results = await matching.search(db, { query, mode, memberId: req.member.id, limit });
    recordSearch(db, req.member.id, query, mode, (results || []).length);
    res.json({ query, results: results || [] });
  });

  r.get('/leads/suggested', auth, async (req, res) => {
    const business = stmt(db, 'SELECT id FROM businesses WHERE member_id = ?').get(req.member.id);
    if (!business) throw new HttpError(409, 'Describe your business first to get suggested leads');
    const limit = intParam(req.query.limit, 30, 1, 100);
    const out = await matching.suggestLeads(db, { memberId: req.member.id, limit });
    const needsInput = Boolean(out?.needs_input);
    const body = { personas: out?.personas || [], leads: needsInput ? [] : (out?.leads || []), needs_input: needsInput };
    if (needsInput) body.message = out?.message || 'Tell the hub who buys from you on your business profile to get suggested leads.';
    res.json(body);
  });

  r.post('/leads/:personId/feedback', auth, (req, res) => {
    const personId = Number(req.params.personId);
    if (!Number.isInteger(personId) || personId <= 0) throw new HttpError(400, 'Invalid person id');
    const verdict = str(req.body?.verdict, 20);
    if (!VERDICTS.includes(verdict)) throw new HttpError(400, `verdict must be one of ${VERDICTS.join(', ')}`);
    if (!stmt(db, 'SELECT 1 FROM people WHERE id = ?').get(personId)) throw new HttpError(404, 'Person not found');
    if (verdict === 'clear') {
      stmt(db, 'DELETE FROM lead_feedback WHERE member_id = ? AND person_id = ?').run(req.member.id, personId);
    } else {
      stmt(db, `INSERT INTO lead_feedback (member_id, person_id, verdict) VALUES (?,?,?)
                ON CONFLICT(member_id, person_id) DO UPDATE SET verdict = excluded.verdict, created_at = datetime('now')`)
        .run(req.member.id, personId, verdict);
    }
    res.json({ ok: true });
  });

  r.get('/leads/saved', auth, (req, res) => {
    const rows = stmt(db, `SELECT p.* FROM lead_feedback f JOIN people p ON p.id = f.person_id
        WHERE f.member_id = ? AND f.verdict = 'saved' ORDER BY f.created_at DESC, p.id DESC`).all(req.member.id);
    const results = rows.map((p) => {
      const kb = knownBy(db, p.id);
      const others = kb.filter((k) => k.member_id !== req.member.id);
      const reasons = ['Saved by you'];
      if (!others.length && kb.length) reasons.push('Already in your own network');
      return { person: personOut(p), score: 1, reasons, known_by: kb };
    });
    res.json({ results });
  });

  return r;
}

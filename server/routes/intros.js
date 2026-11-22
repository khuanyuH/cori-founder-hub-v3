// Warm-introduction requests.
import { Router } from 'express';
import { stmt } from '../db.js';
import { HttpError, requireMember, personOut, memberOut, str } from './util.js';

const STATUSES = ['pending', 'accepted', 'declined', 'done'];

function introOut(db, row) {
  const person = stmt(db, 'SELECT * FROM people WHERE id = ?').get(row.person_id);
  const requester = stmt(db, 'SELECT * FROM members WHERE id = ?').get(row.requester_id);
  const introducer = stmt(db, 'SELECT * FROM members WHERE id = ?').get(row.introducer_id);
  return {
    id: row.id,
    person_id: row.person_id,
    requester_id: row.requester_id,
    introducer_id: row.introducer_id,
    message: row.message ?? null,
    status: row.status,
    created_at: row.created_at,
    person: personOut(person),
    requester: memberOut(requester),
    introducer: memberOut(introducer),
  };
}

export function introsRouter(db) {
  const r = Router();
  const auth = requireMember(db);

  r.post('/intros', auth, (req, res) => {
    const personId = Number(req.body?.person_id);
    const introducerId = Number(req.body?.introducer_id);
    if (!Number.isInteger(personId) || personId <= 0) throw new HttpError(400, 'person_id is required');
    if (!Number.isInteger(introducerId) || introducerId <= 0) throw new HttpError(400, 'introducer_id is required');
    if (introducerId === req.member.id) throw new HttpError(400, 'You cannot ask yourself for an introduction');
    if (!stmt(db, 'SELECT 1 FROM people WHERE id = ?').get(personId)) throw new HttpError(404, 'Person not found');
    if (!stmt(db, 'SELECT 1 FROM members WHERE id = ?').get(introducerId)) throw new HttpError(404, 'Introducer not found');
    if (!stmt(db, 'SELECT 1 FROM connections WHERE member_id = ? AND person_id = ? LIMIT 1').get(introducerId, personId)) {
      throw new HttpError(400, 'That member does not know this person');
    }
    const dup = stmt(db, `SELECT * FROM intro_requests WHERE requester_id = ? AND introducer_id = ? AND person_id = ?
        AND status IN ('pending', 'accepted')`).get(req.member.id, introducerId, personId);
    if (dup) throw new HttpError(409, 'You already have an open request for this introduction');
    const info = stmt(db, 'INSERT INTO intro_requests (requester_id, introducer_id, person_id, message) VALUES (?,?,?,?)')
      .run(req.member.id, introducerId, personId, str(req.body?.message, 4000));
    const row = stmt(db, 'SELECT * FROM intro_requests WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json(introOut(db, row));
  });

  r.get('/intros', auth, (req, res) => {
    const incoming = stmt(db, 'SELECT * FROM intro_requests WHERE introducer_id = ? ORDER BY created_at DESC, id DESC').all(req.member.id);
    const outgoing = stmt(db, 'SELECT * FROM intro_requests WHERE requester_id = ? ORDER BY created_at DESC, id DESC').all(req.member.id);
    res.json({ incoming: incoming.map((x) => introOut(db, x)), outgoing: outgoing.map((x) => introOut(db, x)) });
  });

  r.patch('/intros/:id', auth, (req, res) => {
    const id = Number(req.params.id);
    const row = Number.isInteger(id) ? stmt(db, 'SELECT * FROM intro_requests WHERE id = ?').get(id) : null;
    const me = req.member.id;
    if (!row || (row.introducer_id !== me && row.requester_id !== me)) throw new HttpError(404, 'Intro request not found');
    const status = str(req.body?.status, 20);
    if (!STATUSES.includes(status)) throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`);
    const isIntroducer = row.introducer_id === me;
    const allowed = isIntroducer ? ['accepted', 'declined', 'done'] : ['done'];
    if (!allowed.includes(status)) {
      throw new HttpError(403, isIntroducer ? 'Introducers may accept, decline, or mark done' : 'Only the introducer may accept or decline; you may mark it done');
    }
    stmt(db, 'UPDATE intro_requests SET status = ? WHERE id = ?').run(status, id);
    res.json(introOut(db, stmt(db, 'SELECT * FROM intro_requests WHERE id = ?').get(id)));
  });

  return r;
}

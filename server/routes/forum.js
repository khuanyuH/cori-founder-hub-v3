// Forum: members post questions, reply in threads, and upvote. Members only.
import { Router } from 'express';
import { stmt, withTransaction } from '../db.js';
import { HttpError, requireMember, memberOut, intParam, str } from './util.js';

export const FORUM_CATEGORIES = [
  { id: 'help', label: 'Ask for help' },
  { id: 'advice', label: 'Advice' },
  { id: 'fundraising', label: 'Fundraising' },
  { id: 'sales', label: 'Customers and sales' },
  { id: 'hiring', label: 'Hiring' },
  { id: 'product', label: 'Product and tech' },
  { id: 'wins', label: 'Wins' },
  { id: 'general', label: 'General' },
];
const CATEGORY_IDS = FORUM_CATEGORIES.map((c) => c.id);
const SORTS = ['hot', 'new', 'top'];
const MAX_DEPTH = 6;

const POST_SELECT = `SELECT p.*, m.name AS a_name, m.role AS a_role, m.org AS a_org, m.headline AS a_headline,
    (SELECT COUNT(*) FROM forum_votes v WHERE v.target_type = 'post' AND v.target_id = p.id) AS score,
    (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id AND c.deleted = 0) AS comment_count,
    (SELECT MAX(c.created_at) FROM forum_comments c WHERE c.post_id = p.id AND c.deleted = 0) AS last_comment_at,
    EXISTS (SELECT 1 FROM forum_votes v WHERE v.target_type = 'post' AND v.target_id = p.id AND v.member_id = ?) AS my_vote
  FROM forum_posts p JOIN members m ON m.id = p.author_id`;

function author(row) {
  return memberOut({ id: row.author_id, name: row.a_name, role: row.a_role, org: row.a_org, headline: row.a_headline });
}

function excerpt(body, n = 220) {
  const t = String(body || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t;
}

function postOut(row, memberId, { full = false } = {}) {
  return {
    id: row.id, title: row.title, category: row.category,
    ...(full ? { body: row.body } : { excerpt: excerpt(row.body) }),
    author: author(row), score: row.score, my_vote: Boolean(row.my_vote), comment_count: row.comment_count,
    created_at: row.created_at, updated_at: row.updated_at ?? null, last_comment_at: row.last_comment_at ?? null,
    mine: row.author_id === memberId,
  };
}

function ageHours(sqlDate) {
  const t = Date.parse(`${String(sqlDate).replace(' ', 'T')}Z`);
  return Number.isFinite(t) ? Math.max(0, (Date.now() - t) / 3600000) : 0;
}

/** Hot rank: votes and replies count for more while a post is fresh. */
function hotScore(row) {
  return (1 + row.score + 0.5 * row.comment_count) / ((ageHours(row.created_at) + 2) ** 1.3);
}

function postInput(body = {}) {
  const title = str(body.title, 200);
  if (!title || title.length < 4) throw new HttpError(400, 'Give your post a title (at least 4 characters)');
  const text = str(body.body, 10000) || '';
  const category = str(body.category, 20) || 'general';
  if (!CATEGORY_IDS.includes(category)) throw new HttpError(400, `category must be one of ${CATEGORY_IDS.join(', ')}`);
  return { title, body: text, category };
}

function idParam(v, what) {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${what} id`);
  return id;
}

export function forumRouter(db) {
  const r = Router();
  const auth = requireMember(db);

  r.get('/forum/categories', (_req, res) => res.json(FORUM_CATEGORIES));

  r.get('/forum/posts', auth, (req, res) => {
    const sort = SORTS.includes(req.query.sort) ? req.query.sort : 'hot';
    const category = str(req.query.category, 20);
    if (category && !CATEGORY_IDS.includes(category)) throw new HttpError(400, 'Unknown category');
    const q = str(req.query.q, 200);
    const authorId = req.query.author ? idParam(req.query.author, 'author') : null;
    const limit = intParam(req.query.limit, 30, 1, 100);
    const offset = intParam(req.query.offset, 0, 0, 100000);

    const where = [];
    const args = [req.member.id];
    if (category) { where.push('p.category = ?'); args.push(category); }
    if (authorId) { where.push('p.author_id = ?'); args.push(authorId); }
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push(`(p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')`);
      args.push(like, like);
    }
    const rows = db.prepare(`${POST_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.id DESC LIMIT 2000`).all(...args);
    if (sort === 'top') rows.sort((a, b) => (b.score - a.score) || (b.comment_count - a.comment_count) || (b.id - a.id));
    else if (sort === 'hot') rows.sort((a, b) => (hotScore(b) - hotScore(a)) || (b.id - a.id));
    const counts = {};
    for (const c of stmt(db, 'SELECT category, COUNT(*) AS n FROM forum_posts GROUP BY category').all()) counts[c.category] = c.n;
    res.json({
      total: rows.length, sort,
      items: rows.slice(offset, offset + limit).map((p) => postOut(p, req.member.id)),
      category_counts: counts,
    });
  });

  r.post('/forum/posts', auth, (req, res) => {
    const p = postInput(req.body);
    const id = withTransaction(db, () => {
      const info = stmt(db, 'INSERT INTO forum_posts (author_id, category, title, body) VALUES (?,?,?,?)')
        .run(req.member.id, p.category, p.title, p.body);
      const postId = Number(info.lastInsertRowid);
      // Authors start with their own upvote, as on most forums.
      stmt(db, `INSERT INTO forum_votes (member_id, target_type, target_id) VALUES (?, 'post', ?)`).run(req.member.id, postId);
      return postId;
    });
    res.status(201).json(postOut(db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(req.member.id, id), req.member.id, { full: true }));
  });

  r.get('/forum/posts/:id', auth, (req, res) => {
    const id = idParam(req.params.id, 'post');
    const row = db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(req.member.id, id);
    if (!row) throw new HttpError(404, 'Post not found');
    const comments = stmt(db, `SELECT c.*, m.name AS a_name, m.role AS a_role, m.org AS a_org, m.headline AS a_headline,
        (SELECT COUNT(*) FROM forum_votes v WHERE v.target_type = 'comment' AND v.target_id = c.id) AS score,
        EXISTS (SELECT 1 FROM forum_votes v WHERE v.target_type = 'comment' AND v.target_id = c.id AND v.member_id = ?) AS my_vote
        FROM forum_comments c JOIN members m ON m.id = c.author_id WHERE c.post_id = ? ORDER BY c.id`).all(req.member.id, id);
    res.json({
      post: postOut(row, req.member.id, { full: true }),
      comments: comments.map((c) => ({
        id: c.id, parent_id: c.parent_id ?? null, deleted: Boolean(c.deleted),
        body: c.deleted ? null : c.body, author: c.deleted ? null : author(c),
        score: c.score, my_vote: Boolean(c.my_vote), created_at: c.created_at,
        mine: !c.deleted && c.author_id === req.member.id,
      })),
    });
  });

  r.patch('/forum/posts/:id', auth, (req, res) => {
    const id = idParam(req.params.id, 'post');
    const row = stmt(db, 'SELECT * FROM forum_posts WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'Post not found');
    if (row.author_id !== req.member.id) throw new HttpError(403, 'Only the author can edit this post');
    const p = postInput({ title: req.body?.title ?? row.title, body: req.body?.body ?? row.body, category: req.body?.category ?? row.category });
    stmt(db, `UPDATE forum_posts SET title = ?, body = ?, category = ?, updated_at = datetime('now') WHERE id = ?`).run(p.title, p.body, p.category, id);
    res.json(postOut(db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(req.member.id, id), req.member.id, { full: true }));
  });

  r.delete('/forum/posts/:id', auth, (req, res) => {
    const id = idParam(req.params.id, 'post');
    const row = stmt(db, 'SELECT author_id FROM forum_posts WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'Post not found');
    if (row.author_id !== req.member.id && req.member.role !== 'staff') throw new HttpError(403, 'Only the author or CORI staff can delete this post');
    withTransaction(db, () => {
      stmt(db, `DELETE FROM forum_votes WHERE target_type = 'comment' AND target_id IN (SELECT id FROM forum_comments WHERE post_id = ?)`).run(id);
      stmt(db, `DELETE FROM forum_votes WHERE target_type = 'post' AND target_id = ?`).run(id);
      stmt(db, 'DELETE FROM forum_posts WHERE id = ?').run(id);
    });
    res.json({ ok: true });
  });

  r.post('/forum/posts/:id/comments', auth, (req, res) => {
    const postId = idParam(req.params.id, 'post');
    if (!stmt(db, 'SELECT 1 FROM forum_posts WHERE id = ?').get(postId)) throw new HttpError(404, 'Post not found');
    const body = str(req.body?.body, 6000);
    if (!body) throw new HttpError(400, 'Write a reply first');
    let parentId = null;
    if (req.body?.parent_id != null) {
      parentId = idParam(req.body.parent_id, 'parent comment');
      let cur = stmt(db, 'SELECT id, post_id, parent_id FROM forum_comments WHERE id = ?').get(parentId);
      if (!cur || cur.post_id !== postId) throw new HttpError(400, 'The comment you are replying to is not on this post');
      // Very deep threads flatten: a reply past MAX_DEPTH attaches to the deepest allowed ancestor.
      const chain = [cur];
      while (cur.parent_id) { cur = stmt(db, 'SELECT id, post_id, parent_id FROM forum_comments WHERE id = ?').get(cur.parent_id); chain.push(cur); }
      if (chain.length >= MAX_DEPTH) parentId = chain[chain.length - (MAX_DEPTH - 1)].id;
    }
    const info = stmt(db, 'INSERT INTO forum_comments (post_id, parent_id, author_id, body) VALUES (?,?,?,?)').run(postId, parentId, req.member.id, body);
    const cid = Number(info.lastInsertRowid);
    stmt(db, `INSERT INTO forum_votes (member_id, target_type, target_id) VALUES (?, 'comment', ?)`).run(req.member.id, cid);
    res.status(201).json({
      id: cid, parent_id: parentId, deleted: false, body, author: memberOut(req.member), score: 1, my_vote: true,
      created_at: stmt(db, 'SELECT created_at FROM forum_comments WHERE id = ?').get(cid).created_at, mine: true,
    });
  });

  r.delete('/forum/comments/:id', auth, (req, res) => {
    const id = idParam(req.params.id, 'comment');
    const row = stmt(db, 'SELECT author_id FROM forum_comments WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'Comment not found');
    if (row.author_id !== req.member.id && req.member.role !== 'staff') throw new HttpError(403, 'Only the author or CORI staff can delete this comment');
    // Soft delete so replies keep their place in the thread.
    stmt(db, `UPDATE forum_comments SET deleted = 1, body = '' WHERE id = ?`).run(id);
    res.json({ ok: true });
  });

  r.post('/forum/vote', auth, (req, res) => {
    const type = str(req.body?.target_type, 10);
    if (type !== 'post' && type !== 'comment') throw new HttpError(400, 'target_type must be post or comment');
    const id = idParam(req.body?.target_id, type);
    const table = type === 'post' ? 'forum_posts' : 'forum_comments';
    if (!stmt(db, `SELECT 1 FROM ${table} WHERE id = ?`).get(id)) throw new HttpError(404, `${type === 'post' ? 'Post' : 'Comment'} not found`);
    if (req.body?.value) {
      stmt(db, 'INSERT OR IGNORE INTO forum_votes (member_id, target_type, target_id) VALUES (?,?,?)').run(req.member.id, type, id);
    } else {
      stmt(db, 'DELETE FROM forum_votes WHERE member_id = ? AND target_type = ? AND target_id = ?').run(req.member.id, type, id);
    }
    const score = stmt(db, 'SELECT COUNT(*) AS n FROM forum_votes WHERE target_type = ? AND target_id = ?').get(type, id).n;
    res.json({ score, my_vote: Boolean(req.body?.value) });
  });

  return r;
}

// Import routes: file preview/import, pasted rosters, and manual contacts.
import { Router } from 'express';
import multer from 'multer';
import { stmt, upsertPerson, addConnection, withTransaction, SOURCES } from '../db.js';
import { parseRosterText } from '../importers/roster.js';
import { parseFile, importRecords, publicRecord, MAX_UPLOAD_BYTES } from '../importers/index.js';
import { HttpError, requireMember, str } from './util.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

function singleFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, `That file is too large. The limit on this site is ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB. Export a smaller part, for example one mail label.`));
    return next(new HttpError(400, err.message || 'Upload failed'));
  });
}

function selfEmails(member) {
  return member.email ? [member.email.toLowerCase()] : [];
}

function previewBody(source, records, warnings, skipped) {
  return {
    source,
    parsed: records.length,
    skipped,
    warnings,
    sample: records.slice(0, 10).map(publicRecord),
  };
}

export function importsRouter(db) {
  const r = Router();
  const auth = requireMember(db);

  async function parseUpload(req) {
    if (!req.file) throw new HttpError(400, 'Attach a file in the "file" field');
    const hint = str(req.body?.source, 40);
    if (hint && !SOURCES.includes(hint)) throw new HttpError(400, `source must be one of ${SOURCES.join(', ')}`);
    const out = await parseFile(req.file.originalname, req.file.buffer, hint || undefined, { selfEmails: selfEmails(req.member) });
    if (!out.source) throw new HttpError(422, out.warnings[0] || 'Could not recognise this file');
    return out;
  }

  r.post('/import/preview', auth, singleFile, async (req, res) => {
    const { source, records, warnings, skipped } = await parseUpload(req);
    res.json(previewBody(source, records, warnings, skipped));
  });

  r.post('/import', auth, singleFile, async (req, res) => {
    const { source, records, warnings, skipped } = await parseUpload(req);
    const stats = importRecords(db, req.member.id, records, source, { skipped });
    res.json({ source, ...stats, warnings });
  });

  r.post('/import/paste', auth, (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    if (!text.trim()) throw new HttpError(400, 'text is required');
    if (text.length > 2_000_000) throw new HttpError(413, 'Pasted text is too long');
    const { records, skipped } = parseRosterText(text);
    const warnings = records.length ? [] : ['No names found. Use one person per line: "Name, Title, Company".'];
    if (req.body?.preview) return res.json(previewBody('roster', records, warnings, skipped));
    const stats = importRecords(db, req.member.id, records, 'roster', { skipped });
    res.json({ source: 'roster', ...stats, warnings });
  });

  r.post('/contacts', auth, (req, res) => {
    const b = req.body || {};
    const full_name = str(b.full_name, 200);
    if (!full_name || !/\p{L}/u.test(full_name)) throw new HttpError(400, 'full_name is required');
    const linkedin_url = str(b.linkedin_url, 500);
    if (linkedin_url && !/linkedin\.com\//i.test(linkedin_url)) throw new HttpError(400, 'linkedin_url must be a LinkedIn profile URL');
    const out = withTransaction(db, () => {
      const { personId, created } = upsertPerson(db, {
        full_name, company: str(b.company, 200), title: str(b.title, 200), linkedin_url,
        location: str(b.location, 200), source: 'manual',
      });
      const conn = addConnection(db, {
        memberId: req.member.id, personId, source: 'manual', strength: 'strong', note: str(b.note, 2000),
      });
      return { person_id: personId, created, new_connection: conn.created };
    });
    res.status(out.created ? 201 : 200).json(out);
  });

  // Exposed for tests and the seed: how many edges this member has.
  r.get('/import/sources', auth, (req, res) => {
    const rows = stmt(db, 'SELECT source, COUNT(*) AS n FROM connections WHERE member_id = ? GROUP BY source').all(req.member.id);
    res.json({ sources: SOURCES, counts: Object.fromEntries(rows.map((x) => [x.source, x.n])) });
  });

  return r;
}

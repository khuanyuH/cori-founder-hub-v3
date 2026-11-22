// Admin tool: set a member's sign-in email and password from the command line.
//   npm run passwd -- --list
//   npm run passwd -- --member 3 --email person@company.com --password "a new password"
// The password is hashed with scrypt before it is stored. Existing sessions of that member are ended.
import { openDb } from './db.js';
import { hashPassword } from './routes/auth.js';

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const db = openDb();

if (args.includes('--list')) {
  for (const m of db.prepare('SELECT id, name, role, email IS NOT NULL AS has_email, password_hash IS NOT NULL AS has_password FROM members ORDER BY id').all()) {
    console.log(`#${m.id}  ${m.name} (${m.role})  email on file: ${m.has_email ? 'yes' : 'no'}  password set: ${m.has_password ? 'yes' : 'no'}`);
  }
} else {
  const id = Number(arg('member'));
  const email = arg('email')?.trim().toLowerCase();
  const password = arg('password');
  const m = Number.isInteger(id) ? db.prepare('SELECT * FROM members WHERE id = ?').get(id) : null;
  if (!m) { console.error('Give a valid member id: --member <id>. Use --list to see the ids.'); process.exit(1); }
  if (!email && !m.email) { console.error('This member has no email on file. Add one with --email <address>.'); process.exit(1); }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error('That email address is not valid.'); process.exit(1); }
  if (!password || password.length < 8) { console.error('Give a password of at least 8 characters: --password "<password>".'); process.exit(1); }
  if (email) {
    const other = db.prepare('SELECT id FROM members WHERE email = ? AND id <> ?').get(email, id);
    if (other) { console.error(`Member #${other.id} already uses that email.`); process.exit(1); }
    db.prepare('UPDATE members SET email = ? WHERE id = ?').run(email, id);
  }
  db.prepare('UPDATE members SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
  db.prepare('DELETE FROM sessions WHERE member_id = ?').run(id);
  console.log(`Password set for #${m.id} ${m.name}. They can sign in now.`);
}
db.close();

# Deploy runbook: CORI Founder Hub on Render

Written 2026-11-22. The deploy was not performed. This file is the hand-off.

## What runs where

One Render web service (Node 24) with one persistent disk at `/var/data`. The whole database is the single
SQLite file `/var/data/hub.db`. The hub needs no other service and no API key.

| Setting | Value | Where it is set |
|---|---|---|
| `NODE_VERSION` | `24.12.0` | `render.yaml` |
| `HUB_DB` | `/var/data/hub.db` | `render.yaml` |
| `HUB_TRUST_PROXY` | `1` (session cookie gets its `Secure` flag behind Render's HTTPS proxy) | `render.yaml` |
| `HUB_MAX_UPLOAD_MB` | `50` (uploads are held in memory; the starter plan has 512 MB) | `render.yaml` |
| `HUB_INVITE_CODE` | a code that you choose; sign-up asks for it | Render dashboard (secret) |

Never set `HUB_DEMO_AUTH` on the live site. It turns off real sign-in.
Never run `npm run seed` on the live site. It replaces the database with demo data.

## Steps

1. **GitHub.** Create a **private** repository. Push this folder's `main` branch to it.
   `.gitignore` keeps `data/`, `backups/` and every `*.db` file out of the repository. Check with
   `git ls-files | grep -E '\.db|^data/|^backups/'` : the command must print nothing.
2. **Render.** Dashboard > New > Blueprint > choose the repository. Render reads `render.yaml`.
3. **Invite code.** Render asks for `HUB_INVITE_CODE`. Enter a long random phrase. Share it only with members.
4. **Deploy.** Render runs `npm ci --omit=dev`, then `npm start`. It swaps the site in when
   `/api/health` answers `{"ok":true}`.
5. **First account.** Open the site, choose Sign up, and enter the invite code. The database starts empty.
6. **Check.** Sign out and sign in again. Import a small contacts file. Search for a contact.

Later deploys: push to `main`, then Dashboard > the service > Manual Deploy (`autoDeploy` is off).
Each deploy restarts the site for a few seconds, because a service with a disk runs one instance.

## Data

- The database starts empty. Members add their own contacts through the site.
- To load an existing database file instead, use the service's Shell tab or `scp` to place it at
  `/var/data/hub.db` while the service is stopped. Decide first whether those contacts belong on a cloud server.
- A forgotten password: Dashboard > the service > Shell, then
  `npm run passwd -- --list` and `npm run passwd -- --member <id> --email <email> --password "<new>"`.

## Backups

No off-site backup is built. Render takes disk snapshots (check the current retention on the service's Disk page).
For a manual copy, open the Shell tab and run
`sqlite3 /var/data/hub.db ".backup /var/data/hub-$(date +%F).db"`, then download the copy with `scp`.
If `sqlite3` is not installed in the shell, copy `hub.db` together with `hub.db-wal` and `hub.db-shm` while the service is stopped.

## Known limits

- The import screens still say "Max 200 MB". The server enforces `HUB_MAX_UPLOAD_MB` and returns a clear message.
- One instance only. SQLite on a disk does not scale to several instances.
- The site holds names, employers and titles of members' contacts. Publish a short privacy note before real use.
- Custom address: Dashboard > the service > Settings > Custom Domains, then add the DNS record that Render shows.

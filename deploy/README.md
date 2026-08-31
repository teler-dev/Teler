# TELER deployment

Frontend on Vercel, backend on an Oracle Cloud Ubuntu instance, tracker data
pushed up from the Windows machine by a sync agent.

```
Windows tracker  --POST /api/sync/file-->  Oracle Ubuntu (Caddy + Express)
                                                    ^
                                                    | HTTPS + bearer token
                                           Vercel (Vite SPA)
```

## Guides

Follow them in this order — the Vercel build needs the API URL and token that
the Oracle setup generates.

1. **[ORACLE-SETUP.md](./ORACLE-SETUP.md)** — backend: instance, firewall, HTTPS,
   service, and uploading the tracker data
2. **[VERCEL-SETUP.md](./VERCEL-SETUP.md)** — frontend: import, env vars, CORS,
   and local development

Before either: commit and push. Both Vercel and the server pull from GitHub.

## Files here

| File | Purpose |
|---|---|
| `setup-server.sh` | Idempotent Ubuntu bootstrap — Node, Caddy, service user, tokens, systemd, firewall |
| `teler-api.service` | systemd unit for the API, with filesystem hardening |
| `Caddyfile` | Reverse proxy + automatic Let's Encrypt TLS |

Related, outside this folder:

| File | Purpose |
|---|---|
| `../tools/sync-agent.js` | Pushes tracker output to the server; `--once` to seed, `--watch` to keep current |
| `../tools/sync.bat` | Windows launcher for the agent — edit the two values at the top |
| `../Teler-Web-main/.env.example` | Template for local frontend env |

## Configuration reference

Server config lives in `/etc/teler/teler.env`, read by systemd. Restart the
service after editing: `sudo systemctl restart teler-api`.

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 7001, loopback only — Caddy proxies to it) |
| `DATA_ROOT` | Where session data lives (`/opt/teler/data`) |
| `API_TOKEN` | Read token; also compiled into the Vercel frontend bundle |
| `SYNC_TOKEN` | Write token for `/api/sync/file`; used only by the sync agent |
| `ALLOWED_ORIGINS` | Comma-separated browser origins permitted to call the API |

Leaving `API_TOKEN` empty disables auth entirely. That is fine on localhost and
should never be the case on the server.

## Security notes

Worth being explicit about what this setup does and does not protect:

- **`API_TOKEN` is not per-user auth.** It is compiled into the JavaScript
  Vercel serves, so anyone who loads the dashboard can read it from devtools. It
  stops unauthenticated drive-by access to the API; it does not stop someone who
  has visited the dashboard once.
- **The data is sensitive** — employee screenshots, keystroke counts, OCR text.
  Real login with per-user sessions and role checks is the right next step
  before anyone outside the team gets a link.
- **`SYNC_TOKEN` is separate and never reaches a browser**, so the write
  endpoint is meaningfully better protected than the read endpoints. Keep the
  two tokens different.
- **The API binds to `127.0.0.1`** and is reachable only through Caddy, so port
  7001 is never exposed to the internet.
- **`.env`, `.env.local` and the sync manifest are gitignored.** Keep real
  tokens out of commits.

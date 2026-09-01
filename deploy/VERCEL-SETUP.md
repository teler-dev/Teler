# Frontend deployment — Vercel

Deploys `Teler-Web-main` as a Vite dashboard with same-origin Vercel Functions
for authentication and read-only access to the Oracle TELER API.

The browser receives only an HttpOnly signed session cookie. The Oracle
`API_TOKEN` remains server-side and is never compiled into JavaScript or placed
in screenshot URLs.

## A. Import the project

1. Vercel → **Add New → Project** → import the TELER GitHub repository.
2. Set **Root Directory** to `Teler-Web-main`.
3. Keep the detected Vite build settings (`npm run build`, output `dist`).

## B. Generate dashboard credentials

From the repository root in PowerShell:

```powershell
cd .\Teler-Web-main
npm run auth:generate -- your-dashboard-username
```

Enter a 12+ character password at the hidden prompt. The command prints three
values. Save them securely; do not commit them.

## C. Set Vercel environment variables

In **Project Settings → Environment Variables**, add these to Production and
any Preview environment that should be usable:

| Name | Value |
|---|---|
| `TELER_API_BASE` | Oracle URL, e.g. `https://148-116-79-191.sslip.io` |
| `TELER_API_TOKEN` | `API_TOKEN` from `/etc/teler/teler.env` on Oracle |
| `TELER_DASHBOARD_USERNAME` | generated/chosen dashboard username |
| `TELER_DASHBOARD_PASSWORD_HASH` | complete generated `scrypt$...` value |
| `TELER_SESSION_SECRET` | generated 64-character secret |
| `OPENROUTER_API_KEY` | a new OpenRouter key for server-side TELER AI calls |
| `PUPPETEER_SKIP_DOWNLOAD` | `true` |

These are server-only variables. Do **not** use `VITE_API_TOKEN`; every `VITE_*`
value is public browser configuration.

## D. Deploy and verify

Deploy, then test this flow:

1. Sign in with the configured username and password.
2. Open browser devtools → Application → Cookies. A
   `__Host-teler_session` cookie should exist and show `HttpOnly`, `Secure`, and
   `SameSite=Strict`.
3. Refresh the page. The dashboard should restore without asking for login.
4. Network calls should go to `/api/teler?...` on the Vercel domain, not
   directly to Oracle. No bearer token should appear in request URLs.
5. Click logout, then refresh. The login session must remain cleared.

Changing server-side environment variables requires a redeploy so new Function
instances consistently receive the new values.

## Local development

Use `vercel dev` when testing the full login, cookie, and proxy flow. Put the
same server-side values in `.env.local` and keep that file uncommitted.

Plain `npm run dev` serves only Vite. It can optionally access a local backend
running without `API_TOKEN` by setting `VITE_API_BASE=http://localhost:7001`,
but it does not emulate production authentication.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Login returns 503 | One of the five required `TELER_*` Vercel variables is missing or malformed |
| Login returns 401 | Username/password does not match the configured hash |
| Refresh returns to login after a successful login | Check that `/api/auth-login` returned `Set-Cookie` and that the cookie is not blocked |
| Dashboard API returns 502 | Verify `TELER_API_BASE`, Oracle service health, TLS, and the server-side `TELER_API_TOKEN` |
| `/api/...` displays the Vite page | Ensure `vercel.json` excludes `api/` from the SPA rewrite |
| Screenshots fail while sessions work | Check Oracle screenshot paths and `/api/teler?target=...` in Network |

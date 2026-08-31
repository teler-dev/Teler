# Frontend deployment — Vercel

Deploys the TELER dashboard (`Teler-Web-main`, Vite + React) to Vercel.

**Prerequisite:** the backend must already be live — this build bakes in the API
URL and token produced by [ORACLE-SETUP.md](./ORACLE-SETUP.md) step E.

Time: ~5 minutes.

---

## A. Import the project

- [vercel.com](https://vercel.com) → **Add New → Project**
- **Import Git Repository** → pick `essa-zahid/Teler`
  - The repo is private; approve Vercel's GitHub access when prompted
- **Root Directory:** click **Edit** and set it to **`Teler-Web-main`**

> Setting the root directory is the one step people miss. Left at the repo root,
> the build fails with "no package.json found" — the frontend lives in a
> subfolder.

Build command and output directory come from `Teler-Web-main/vercel.json`
(Vite → `dist`, with SPA rewrites). Leave those fields on their defaults.

## B. Environment variables

Add all three before the first deploy, applied to **Production, Preview and
Development**:

| Name | Value |
|---|---|
| `VITE_API_BASE` | `https://130-61-12-34.sslip.io` — your sslip.io URL, **no trailing slash** |
| `VITE_API_TOKEN` | the `API_TOKEN` from Oracle setup step E |
| `PUPPETEER_SKIP_DOWNLOAD` | `true` |

The third one isn't used by the app. `puppeteer` sits in `devDependencies` for a
local screenshot utility, and Vercel installs devDependencies — without this it
downloads ~150 MB of Chromium on every single build.

## C. Deploy

Click **Deploy**. Roughly 1–2 minutes; the bundle is ~995 kB (272 kB gzipped).

Copy the production URL it gives you, e.g. `https://teler.vercel.app`.

## D. Allow the Vercel origin on the backend

The API rejects cross-origin requests it doesn't recognise, so it needs to be
told about the URL from step C. On the Oracle server:

```bash
sudo nano /etc/teler/teler.env
```

Set the line to your exact Vercel URL — scheme included, no trailing slash:

```
ALLOWED_ORIGINS=https://teler.vercel.app
```

Multiple origins are comma-separated, which is useful if you want preview
deployments to work too:

```
ALLOWED_ORIGINS=https://teler.vercel.app,https://teler-git-dev-essa.vercel.app
```

Then:

```bash
sudo systemctl restart teler-api
```

## E. Verify

Open the Vercel URL and confirm:

- The dashboard loads sessions rather than showing
  *"Failed to connect to TELER API"*
  (if you haven't run the data sync yet, an empty-but-connected dashboard is
  the correct result)
- Open a session → screenshots render in the Evidence panel
- Browser devtools → **Network** → requests to your sslip.io domain return
  **200**, not 401 or a CORS error

---

## Important: env vars are baked in at build time

Vite inlines `VITE_*` variables into the JavaScript bundle when it builds.
Changing a value in the Vercel dashboard does **nothing** to the live site until
you redeploy.

After changing `VITE_API_BASE` or `VITE_API_TOKEN`:
**Deployments → ⋯ on the latest → Redeploy.**

This also means `VITE_API_TOKEN` ships inside the client JavaScript. Anyone who
loads the dashboard can read it out of devtools. It blocks unauthenticated
drive-by access to the API — it is not per-user auth. Given the data behind it
is employee screenshots and keystroke logs, real login should come before the
link goes to anyone outside your team.

---

## Local development

```bash
cd Teler-Web-main
cp .env.example .env.local     # then edit the two values
npm install
npm run dev                    # http://localhost:3000
```

With no `.env.local`, the app falls back to `http://localhost:7001` and no
token — which matches a backend started locally without `API_TOKEN` set:

```bash
cd api && npm install && npm start
```

`.env.local` is gitignored. Keep real tokens out of commits.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Build fails, "no package.json" | **Root Directory** isn't set to `Teler-Web-main` (step A) |
| Build is very slow / downloads Chromium | `PUPPETEER_SKIP_DOWNLOAD` is missing |
| "Failed to connect to TELER API" | Devtools → Network. A **CORS** error means `ALLOWED_ORIGINS` doesn't match the Vercel URL exactly. A **401** means a stale `VITE_API_TOKEN` — fix it, then **redeploy** |
| Mixed-content error in console | `VITE_API_BASE` is `http://`, not `https://`. Vercel is HTTPS-only and browsers block plain-HTTP calls from it |
| Dashboard loads, screenshots are broken images | Those load via `?token=`. Same stale-token cause — redeploy after changing it |
| Blank page on a deep link / refresh | SPA rewrites come from `vercel.json`; confirm that file is committed |
| Changed an env var, nothing happened | Expected — you must redeploy. See the section above |

---

## Note on `tsc`

`npx tsc --noEmit` reports one pre-existing error in the mock-data helper at
`components/dashboard/useSessions.ts:14`. It predates this deployment work and
does not affect the build — `npm run build` runs `vite build`, which does not
typecheck. Worth cleaning up eventually; it will not block a deploy.

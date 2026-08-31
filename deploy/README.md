# TELER deployment

Frontend on Vercel, backend on an Oracle Cloud Ubuntu instance, tracker data
pushed up from the Windows machine by a sync agent.

```
Windows tracker  --POST /api/sync/file-->  Oracle Ubuntu (Caddy + Express)
                                                    ^
                                                    | HTTPS + bearer token
                                           Vercel (Vite SPA)
```

---

## 1. Create the Oracle instance

Console → Compute → Instances → Create instance.

- **Shape:** `VM.Standard.A1.Flex` (Ampere ARM) — the Always Free tier allows
  4 OCPU / 24 GB RAM. If A1 capacity is unavailable in your region, the
  `VM.Standard.E2.1.Micro` AMD shape also works; 1 GB RAM is enough here.
- **Image:** Ubuntu 22.04 or 24.04.
- **Boot volume:** 50 GB is plenty — the dataset is currently ~272 MB.
- Save the SSH private key, and note the **public IP**.

## 2. Open ports in the VCN

This is separate from the OS firewall and both must be done.

Networking → Virtual Cloud Networks → your VCN → Security Lists → default →
**Add Ingress Rules**:

| Source    | IP Protocol | Destination Port |
|-----------|-------------|------------------|
| 0.0.0.0/0 | TCP         | 80               |
| 0.0.0.0/0 | TCP         | 443              |

Port 80 must stay open permanently — Let's Encrypt uses it to renew the
certificate roughly every 60 days.

## 3. Run the bootstrap

```bash
ssh -i your-key.pem ubuntu@<PUBLIC_IP>

sudo mkdir -p /opt/teler
sudo git clone https://github.com/essa-zahid/Teler.git /opt/teler/app
sudo bash /opt/teler/app/deploy/setup-server.sh
```

The script installs Node 20 and Caddy, creates the `teler` service user,
generates `API_TOKEN` and `SYNC_TOKEN` into `/etc/teler/teler.env`, installs the
systemd unit, configures Caddy for `<ip-with-dashes>.sslip.io`, and opens ports
80/443 in the instance's iptables (Oracle's Ubuntu images block these by
default, which is the single most common reason a deployment appears dead).

It prints both tokens at the end. **Copy them.**

Verify from your own machine:

```bash
curl https://130-61-12-34.sslip.io/health
# {"status":"ok","sessions":0,"auth":true}
```

`sessions: 0` is expected until data is synced in step 5.

## 4. Deploy the frontend to Vercel

Vercel → Add New → Project → import the repo, then:

- **Root Directory:** `Teler-Web-main`
- Framework preset, build command and output directory are picked up from
  `vercel.json` (Vite → `dist`).

Environment variables (Production, Preview, Development):

| Name                      | Value                             |
|---------------------------|-----------------------------------|
| `VITE_API_BASE`           | `https://130-61-12-34.sslip.io`   |
| `VITE_API_TOKEN`          | the `API_TOKEN` from step 3       |
| `PUPPETEER_SKIP_DOWNLOAD` | `true`                            |

The last one is not used by the app. `puppeteer` sits in `devDependencies` for a
local screenshot utility, and Vercel installs devDependencies — without this it
downloads ~150 MB of Chromium on every build.

Deploy, then put the resulting URL into `ALLOWED_ORIGINS` on the server:

```bash
sudo nano /etc/teler/teler.env      # ALLOWED_ORIGINS=https://your-app.vercel.app
sudo systemctl restart teler-api
```

Vite inlines env vars at build time, so **changing these requires a redeploy**,
not just a settings save.

## 5. Sync the data up

On the Windows tracker machine:

1. Edit `tools/sync.bat` — set `TELER_API_BASE` and `TELER_SYNC_TOKEN`
   (the `SYNC_TOKEN`, not the `API_TOKEN`).
2. Dry run first:
   ```
   tools\sync.bat --once --dry-run
   ```
3. Seed everything (~272 MB, expect 10–30 min on a typical connection):
   ```
   tools\sync.bat --once
   ```
4. Leave it running continuously:
   ```
   tools\sync.bat
   ```

The agent keeps `tools/.teler-sync-manifest.json` recording size+mtime per
uploaded file, so restarts and re-runs only send what actually changed.

To run it unattended, register it with Task Scheduler ("At log on", "Run
whether user is logged on or not") pointing at `tools\sync.bat`.

---

## Operations

```bash
sudo systemctl status teler-api
sudo journalctl -u teler-api -f          # API logs
sudo journalctl -u caddy -f              # TLS / proxy logs
sudo systemctl restart teler-api
```

**Deploying a code change:**

```bash
cd /opt/teler/app && sudo git pull
sudo bash deploy/setup-server.sh         # idempotent; keeps existing tokens
```

**Rotating a token:** edit `/etc/teler/teler.env`, `sudo systemctl restart
teler-api`, then update `VITE_API_TOKEN` in Vercel (and redeploy) or
`TELER_SYNC_TOKEN` in `sync.bat`.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `curl` to the domain hangs | VCN ingress rule missing, or instance iptables still blocking. Check both — `sudo iptables -L INPUT -n \| grep -E '443\|80'`. |
| Caddy can't get a certificate | Port 80 unreachable from the internet. Check `sudo journalctl -u caddy -n 50`. |
| Dashboard shows "Failed to connect to TELER API" | Open devtools → Network. A CORS error means `ALLOWED_ORIGINS` doesn't match the Vercel URL exactly (scheme included, no trailing slash). A 401 means `VITE_API_TOKEN` is stale — redeploy Vercel. |
| Screenshots are broken images | Those load via `?token=`; a 401 there means the same stale-token problem. |
| Sync agent aborts with HTTP 401 | Using `API_TOKEN` where `SYNC_TOKEN` is expected. |
| Health shows `sessions: 0` after syncing | `DATA_ROOT` in `/etc/teler/teler.env` doesn't match where files landed (should be `/opt/teler/data`). |

## Security notes

Worth being clear about what this setup does and does not protect:

- `VITE_API_TOKEN` is compiled into the client JavaScript that Vercel serves.
  Anyone who loads the dashboard can read it out of devtools. It stops
  unauthenticated drive-by access to the API; it is **not** per-user auth, and
  it does not stop someone who has visited the dashboard once.
- The data behind this API is employee screenshots, keystroke counts and OCR
  text. Real login with per-user sessions and role checks is the right next
  step before anyone outside your team gets a link.
- `SYNC_TOKEN` is separate and never reaches a browser, so the write endpoint
  is meaningfully better protected than the read endpoints. Keep them different.
- The API binds to `127.0.0.1` and is only reachable through Caddy, so port
  7001 is never exposed directly.

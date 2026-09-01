# Backend deployment — Oracle Cloud (Ubuntu)

Deploys the TELER API to an Always Free Oracle Cloud instance, behind HTTPS.

**Do this before Vercel** — the frontend build needs the API URL and token that
step E produces.

Time: ~20 minutes.

---

## A. Create the instance

- Console → **Compute → Instances → Create instance**
- **Name:** `teler-api`
- **Image:** *Change image* → **Ubuntu 22.04** (or 24.04)
- **Shape:** *Change shape* → **Ampere → VM.Standard.A1.Flex** → 4 OCPU, 24 GB
  - If you hit *"Out of host capacity"*: switch Availability Domain, or use
    **VM.Standard.E2.1.Micro** instead — 1 GB RAM is enough for this workload
- **Networking:** confirm **Assign a public IPv4 address** is checked
- **SSH keys:** *Generate a key pair* → **download the private key**
  (one chance only — you cannot re-download it later)
- **Create**, then wait for the state to reach **RUNNING**
- **Copy the Public IP address** from the instance detail page

## B. Open ports 80 and 443

Two separate firewalls have to allow traffic. This is the VCN one; the
bootstrap script in step E handles the instance's own iptables.

- On the instance page, click the **Subnet** link
- Click the **Security List** (usually *"Default Security List for ..."*)
- **Add Ingress Rules** → add both:

| Source CIDR | IP Protocol | Destination Port |
|-------------|-------------|------------------|
| `0.0.0.0/0` | TCP         | `80`             |
| `0.0.0.0/0` | TCP         | `443`            |

Leave **80 open permanently** — Let's Encrypt uses it to renew the certificate
roughly every 60 days. Closing it later breaks HTTPS silently, about two months
after you forget you did it.

## C. Connect over SSH

```bash
chmod 400 your-key.key
ssh -i your-key.key ubuntu@<PUBLIC_IP>
```

On Windows, run this from **Git Bash**, not PowerShell — `chmod` doesn't exist
in PowerShell and OpenSSH will refuse a key it considers world-readable.

## D. Give the server access to the private repo

The repo is private, so a plain `git clone` will fail. A read-only deploy key
is the cleanest fix: scoped to this one repo, revocable, and `git pull` keeps
working for later updates.

```bash
sudo ssh-keygen -t ed25519 -f /root/.ssh/id_ed25519 -N "" -C "teler-oracle"
sudo ssh-keyscan github.com | sudo tee -a /root/.ssh/known_hosts
sudo cat /root/.ssh/id_ed25519.pub
```

Copy that public key, then:

- GitHub → the repo → **Settings → Deploy keys → Add deploy key**
- Paste it, name it `oracle-api`, leave **Allow write access unchecked**
- **Add key**

## E. Clone and run the bootstrap

```bash
sudo mkdir -p /opt/teler
sudo git clone git@github.com:essa-zahid/Teler.git /opt/teler/app
sudo bash /opt/teler/app/deploy/setup-server.sh
```

Takes 3–5 minutes. The script:

- installs Node 20 and Caddy
- creates the `teler` service user and `/opt/teler/data`
- generates `API_TOKEN` and `SYNC_TOKEN` into `/etc/teler/teler.env`
- installs and starts the `teler-api` systemd service
- configures Caddy for `<ip-with-dashes>.sslip.io` with a real Let's Encrypt cert
- opens 80/443 in the instance's iptables and persists the rules

**Copy the two tokens it prints at the end.** You need `API_TOKEN` for Vercel
and `SYNC_TOKEN` for the sync agent.

It is safe to re-run — existing tokens are preserved.

## F. Verify

Your domain is the public IP with dots swapped for dashes:
`130.61.12.34` → `https://130-61-12-34.sslip.io`

```bash
curl https://130-61-12-34.sslip.io/health
```

Expected:

```json
{"status":"ok","sessions":0,"auth":true}
```

- Run this **from your own laptop**, not from inside the server — that's the
  only version of the test that proves the firewall is actually open.
- `sessions: 0` is correct here. No data has been uploaded yet.
- `auth: true` confirms the token is active.

**The backend is now live.** Next: [VERCEL-SETUP.md](./VERCEL-SETUP.md).

---

## G. Upload the tracker data

Do this after Vercel, or now — order doesn't matter. Run it on the **Windows
tracker machine**, not the server.

1. Edit `tools\sync.bat` and set:
   - `TELER_API_BASE` → `https://130-61-12-34.sslip.io`
   - `TELER_SYNC_TOKEN` → the **`SYNC_TOKEN`** from step E (not `API_TOKEN`)
2. Check what it sees before sending anything:
   ```
   tools\sync.bat --once --dry-run
   ```
   Current dataset is ~2,171 files / ~250 MB.
3. Seed it (10–30 min depending on your upload speed):
   ```
   tools\sync.bat --once
   ```
4. Keep it current — leave this window open:
   ```
   tools\sync.bat
   ```

The agent records size+mtime per uploaded file in
`tools/.teler-sync-manifest.json`, so re-runs only send what changed rather than
re-pushing the full 250 MB.

To run it unattended: **Task Scheduler** → Create Task → trigger *At log on* →
action *Start a program* → `tools\sync.bat`.

Re-check `/health` afterwards — `sessions` should now be non-zero.

---

## Day-to-day operations

```bash
sudo systemctl status teler-api
sudo journalctl -u teler-api -f      # API logs
sudo journalctl -u caddy -f          # TLS / proxy logs
sudo systemctl restart teler-api
```

**Deploying a code change:**

```bash
cd /opt/teler/app && sudo git pull
sudo bash deploy/setup-server.sh
```

**Config lives in** `/etc/teler/teler.env` — tokens, `DATA_ROOT`, and
`ALLOWED_ORIGINS`. Restart the service after editing it.

### Desktop login/signup

Run `database/003_desktop_auth.sql` in the Neon SQL Editor after the initial
schema. Then add the pooled Neon connection string to `/etc/teler/teler.env`:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
AUTH_SESSION_DAYS=30
```

Restart with `sudo systemctl restart teler-api`. The desktop application can
then create accounts at `/api/auth/signup`, restore sessions at `/api/auth/me`,
and revoke them at `/api/auth/logout`. Passwords and the database URL never
reach the desktop client.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `curl` to the domain hangs | The VCN security list from step B. This is the failure ~90% of the time. Verify the instance side too: `sudo iptables -L INPUT -n \| grep -E '80\|443'` |
| SSL / certificate error | Caddy is still issuing the cert — wait 60s and retry. If it persists, port 80 is unreachable: `sudo journalctl -u caddy -n 50` |
| `Permission denied (publickey)` on clone | The deploy key in step D wasn't added, or was added to the wrong repo |
| `/health` works, but `sessions: 0` after syncing | `DATA_ROOT` in `/etc/teler/teler.env` doesn't match where files landed — should be `/opt/teler/data` |
| Sync agent aborts with HTTP 401 | You used `API_TOKEN` where `SYNC_TOKEN` is expected |
| Service won't start | `sudo journalctl -u teler-api -n 50` — usually a missing `npm install` in `/opt/teler/app/api`, which re-running the setup script fixes |

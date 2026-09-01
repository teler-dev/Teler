#!/usr/bin/env bash
#
# TELER backend bootstrap for a fresh Ubuntu instance on Oracle Cloud.
# Idempotent — safe to re-run after a config change or a code update.
#
#   sudo bash setup-server.sh
#
# Assumes this repo has been cloned to /opt/teler/app (the script will clone it
# if TELER_REPO is set and the directory does not exist yet).

set -euo pipefail

APP_DIR="/opt/teler/app"
DATA_DIR="/opt/teler/data"
ENV_FILE="/etc/teler/teler.env"
NODE_MAJOR=20

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run with sudo."

# ── Public IP + sslip.io hostname ──────────────────────────────────────────────

log "Detecting public IP"
PUBLIC_IP="${TELER_PUBLIC_IP:-}"
if [[ -z "$PUBLIC_IP" ]]; then
  # Oracle's instance metadata service is authoritative; fall back to an
  # external echo service if the VNIC has no public IP recorded there.
  PUBLIC_IP=$(curl -s --max-time 5 -H 'Authorization: Bearer Oracle' \
    http://169.254.169.254/opc/v2/vnics/ 2>/dev/null \
    | grep -o '"publicIp"[^,]*' | head -1 | cut -d'"' -f4 || true)
fi
[[ -z "$PUBLIC_IP" ]] && PUBLIC_IP=$(curl -s --max-time 5 https://api.ipify.org || true)
[[ -n "$PUBLIC_IP" ]] || die "Could not determine public IP. Re-run with TELER_PUBLIC_IP=x.x.x.x"

TELER_DOMAIN="${PUBLIC_IP//./-}.sslip.io"
log "Public IP $PUBLIC_IP  ->  https://$TELER_DOMAIN"

# ── Packages ───────────────────────────────────────────────────────────────────

log "Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git ufw >/dev/null

if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
log "Node $(node -v)   npm $(npm -v)"

if ! command -v caddy >/dev/null 2>&1; then
  log "Installing Caddy"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

# ── Service user, directories, code ────────────────────────────────────────────

if ! id teler >/dev/null 2>&1; then
  log "Creating service user 'teler'"
  useradd --system --home /opt/teler --shell /usr/sbin/nologin teler
fi

mkdir -p "$APP_DIR" "$DATA_DIR" /etc/teler /var/log/caddy

if [[ -n "${TELER_REPO:-}" && ! -d "$APP_DIR/.git" ]]; then
  log "Cloning $TELER_REPO"
  git clone "$TELER_REPO" "$APP_DIR"
fi
[[ -f "$APP_DIR/api/server.js" ]] || die "$APP_DIR/api/server.js not found — clone the repo to $APP_DIR first."

log "Installing API dependencies"
cd "$APP_DIR/api"
npm install --omit=dev --no-audit --no-fund

# ── Environment file (tokens generated once, then preserved) ───────────────────

if [[ -f "$ENV_FILE" ]]; then
  log "Keeping existing $ENV_FILE (tokens unchanged)"
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  log "Generating $ENV_FILE with fresh tokens"
  API_TOKEN=$(openssl rand -hex 32)
  SYNC_TOKEN=$(openssl rand -hex 32)
  cat > "$ENV_FILE" <<EOF
# TELER API configuration. Generated $(date -Iseconds).
PORT=7001
DATA_ROOT=$DATA_DIR

# Read token — also compiled into the Vercel frontend bundle.
API_TOKEN=$API_TOKEN

# Write token for /api/sync/file. Used only by the desktop sync agent, so it
# never reaches a browser. Keep it different from API_TOKEN.
SYNC_TOKEN=$SYNC_TOKEN

# Browser origins allowed to call the API. Add your Vercel URL(s), comma-separated.
ALLOWED_ORIGINS=https://teler.vercel.app
EOF
fi
chmod 640 "$ENV_FILE"
chown root:teler "$ENV_FILE"

chown -R teler:teler /opt/teler

# ── systemd ────────────────────────────────────────────────────────────────────

log "Installing systemd unit"
install -m 644 "$APP_DIR/deploy/teler-api.service" /etc/systemd/system/teler-api.service
systemctl daemon-reload
systemctl enable teler-api >/dev/null
systemctl restart teler-api

# ── Caddy ──────────────────────────────────────────────────────────────────────

log "Configuring Caddy for $TELER_DOMAIN"
install -m 644 "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
grep -q '^TELER_DOMAIN=' /etc/default/caddy 2>/dev/null \
  && sed -i "s|^TELER_DOMAIN=.*|TELER_DOMAIN=$TELER_DOMAIN|" /etc/default/caddy \
  || echo "TELER_DOMAIN=$TELER_DOMAIN" >> /etc/default/caddy
chown -R caddy:caddy /var/log/caddy
systemctl restart caddy

# ── Firewall ───────────────────────────────────────────────────────────────────
#
# Oracle's Ubuntu images ship a restrictive iptables ruleset that drops
# everything except SSH, and it survives reboots. Opening the VCN security list
# alone is NOT enough — the rules below are the half people usually miss.

log "Opening ports 80 and 443 locally"
iptables -I INPUT -p tcp --dport 80  -j ACCEPT
iptables -I INPUT -p tcp --dport 443 -j ACCEPT
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save >/dev/null 2>&1 || warn "Could not persist iptables rules"
else
  apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true
  netfilter-persistent save >/dev/null 2>&1 || warn "Could not persist iptables rules"
fi

# ── Verify ─────────────────────────────────────────────────────────────────────

sleep 3
log "Checking the API locally"
if curl -fsS --max-time 10 http://127.0.0.1:7001/health; then
  echo
else
  warn "Local health check failed — inspect with: journalctl -u teler-api -n 50"
fi

echo
log "Done."
cat <<EOF

  API URL          https://$TELER_DOMAIN
  Health           https://$TELER_DOMAIN/health
  Data root        $DATA_DIR
  Config           $ENV_FILE

  Tokens (from $ENV_FILE):
$(grep -E '^(API_TOKEN|SYNC_TOKEN)=' "$ENV_FILE" | sed 's/^/    /')

  Next:
    1. In the Oracle console, add ingress rules to this instance's VCN security
       list for TCP 80 and TCP 443 from 0.0.0.0/0. TLS cannot be issued without
       port 80 reachable from the internet.
    2. Confirm from your laptop:  curl https://$TELER_DOMAIN/health
    3. In Vercel, set server-side TELER_API_BASE=https://$TELER_DOMAIN and
       TELER_API_TOKEN=<API_TOKEN>. Do not prefix either value with VITE_.
    4. Generate TELER_DASHBOARD_USERNAME, TELER_DASHBOARD_PASSWORD_HASH and
       TELER_SESSION_SECRET with the frontend's npm run auth:generate command.
    5. On the Windows tracker machine, run the sync agent with
       TELER_SYNC_TOKEN=<SYNC_TOKEN>

EOF

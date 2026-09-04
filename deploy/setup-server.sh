#!/usr/bin/env bash
# TELER backend bootstrap for Oracle Cloud Ubuntu. Idempotent and Free Tier friendly.
set -euo pipefail

APP_DIR="/opt/teler/app"
DATA_DIR="/opt/teler/data"
ENV_FILE="/etc/teler/teler.env"
NODE_MAJOR=20

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || die "Run with sudo."

log "Detecting public IP"
PUBLIC_IP="${TELER_PUBLIC_IP:-}"
if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP=$(curl -s --max-time 5 -H 'Authorization: Bearer Oracle' http://169.254.169.254/opc/v2/vnics/ 2>/dev/null | grep -o '"publicIp"[^,]*' | head -1 | cut -d'"' -f4 || true)
fi
[[ -z "$PUBLIC_IP" ]] && PUBLIC_IP=$(curl -s --max-time 5 https://api.ipify.org || true)
[[ -n "$PUBLIC_IP" ]] || die "Could not determine public IP. Re-run with TELER_PUBLIC_IP=x.x.x.x"
TELER_DOMAIN="${PUBLIC_IP//./-}.sslip.io"
log "Public IP $PUBLIC_IP -> https://$TELER_DOMAIN"

log "Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git ufw >/dev/null
if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null 2>&1; then
  log "Installing Caddy"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
log "Node $(node -v) npm $(npm -v)"

if ! id teler >/dev/null 2>&1; then
  log "Creating service user teler"
  useradd --system --home /opt/teler --shell /usr/sbin/nologin teler
fi
mkdir -p "$APP_DIR" "$DATA_DIR" /etc/teler /var/log/caddy
if [[ -n "${TELER_REPO:-}" && ! -d "$APP_DIR/.git" ]]; then git clone "$TELER_REPO" "$APP_DIR"; fi
[[ -f "$APP_DIR/api/server-entry.js" ]] || die "$APP_DIR/api/server-entry.js not found — clone/pull the TELER repo first."

log "Installing API dependencies"
cd "$APP_DIR/api"
npm install --omit=dev --no-audit --no-fund

if [[ -f "$ENV_FILE" ]]; then
  log "Keeping existing $ENV_FILE"
else
  log "Generating $ENV_FILE"
  API_TOKEN=$(openssl rand -hex 32)
  SYNC_TOKEN=$(openssl rand -hex 32)
  cat > "$ENV_FILE" <<EOF
PORT=7001
DATA_ROOT=$DATA_DIR
API_TOKEN=$API_TOKEN
SYNC_TOKEN=$SYNC_TOKEN
ALLOWED_ORIGINS=https://teler-pi.vercel.app
DATABASE_URL=
AUTH_SESSION_DAYS=30
WORKER_POLL_MS=1500
EOF
fi
chmod 640 "$ENV_FILE"
chown root:teler "$ENV_FILE"
chown -R teler:teler /opt/teler

# Load runtime configuration without echoing secrets.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -n "${DATABASE_URL:-}" ]]; then
  log "Applying idempotent PostgreSQL backend evolution migration"
  runuser -u teler -- env DATABASE_URL="$DATABASE_URL" node "$APP_DIR/api/run-migrations.js"
else
  warn "DATABASE_URL is empty: legacy filesystem API will remain available, but v1 DB routes/worker stay inactive."
fi

log "Installing systemd units"
install -m 644 "$APP_DIR/deploy/teler-api.service" /etc/systemd/system/teler-api.service
install -m 644 "$APP_DIR/deploy/teler-worker.service" /etc/systemd/system/teler-worker.service
systemctl daemon-reload
systemctl enable teler-api teler-worker >/dev/null
systemctl restart teler-api
systemctl restart teler-worker

log "Configuring Caddy for $TELER_DOMAIN"
install -m 644 "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
grep -q '^TELER_DOMAIN=' /etc/default/caddy 2>/dev/null && sed -i "s|^TELER_DOMAIN=.*|TELER_DOMAIN=$TELER_DOMAIN|" /etc/default/caddy || echo "TELER_DOMAIN=$TELER_DOMAIN" >> /etc/default/caddy
chown -R caddy:caddy /var/log/caddy
systemctl restart caddy

log "Opening ports 80 and 443 locally"
iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 80 -j ACCEPT
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 443 -j ACCEPT
if command -v netfilter-persistent >/dev/null 2>&1; then netfilter-persistent save >/dev/null 2>&1 || warn "Could not persist iptables rules";
else apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true; netfilter-persistent save >/dev/null 2>&1 || warn "Could not persist iptables rules"; fi

sleep 3
log "Checking API and worker"
curl -fsS --max-time 10 http://127.0.0.1:7001/health || warn "Local API health check failed; inspect journalctl -u teler-api -n 50"
systemctl is-active --quiet teler-worker || warn "Worker is not active; inspect journalctl -u teler-worker -n 50"

echo
log "Done"
cat <<EOF
  API URL       https://$TELER_DOMAIN
  Health        https://$TELER_DOMAIN/health
  Data root     $DATA_DIR
  Config        $ENV_FILE
  API logs      journalctl -u teler-api -f
  Worker logs   journalctl -u teler-worker -f

  Keep TCP 80/443 open in the Oracle VCN security list.
  Set Vercel server-side TELER_API_BASE=https://$TELER_DOMAIN and TELER_API_TOKEN to API_TOKEN.
  Set the Windows sync agent TELER_SYNC_TOKEN to SYNC_TOKEN; it now mirrors raw files and queues structured normalization.
EOF
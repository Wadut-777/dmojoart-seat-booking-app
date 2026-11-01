#!/usr/bin/env bash
# For a server that ALREADY runs MySQL and a PHP site. Touches only the dmojo app, its own
# database/user, its own systemd service and its own port. It does NOT touch nginx/apache,
# the firewall, other databases or other sites (you add the web-server block yourself).
#   sudo DOMAIN=tickets.example.com bash deploy/setup-existing.sh
# If MySQL root needs a password:  MYSQL_ARGS="-u root -pYOURPASS"  (default: plain `mysql`)
set -euo pipefail
: "${DOMAIN:?Set DOMAIN, e.g. DOMAIN=tickets.example.com}"
APP_PORT="${APP_PORT:-3000}"
MYSQL_ARGS="${MYSQL_ARGS:-}"
APP_DIR=/var/www/dmojo
APP_USER=dmojo
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if ss -ltn | grep -q ":${APP_PORT} "; then echo "Port ${APP_PORT} is already in use. Re-run with APP_PORT=3100 (or another free port)."; exit 1; fi
if [ -f /etc/dmojo.env ]; then echo "/etc/dmojo.env exists - keeping it."; fi

echo "==> Node 22"
apt-get install -y curl ca-certificates rsync
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> App user and folders"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" /var/lib/dmojo/event-media
rsync -a --delete --exclude node_modules --exclude .output --exclude .env --exclude .git "$SRC_DIR"/ "$APP_DIR"/
chown -R "$APP_USER":"$APP_USER" "$APP_DIR" /var/lib/dmojo

echo "==> Separate database + user (other databases are not touched)"
if [ ! -f /etc/dmojo.env ]; then
  DB_PASS="$(openssl rand -hex 16)"
  # shellcheck disable=SC2086
  mysql $MYSQL_ARGS <<SQL
CREATE DATABASE IF NOT EXISTS dmojo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'dmojo'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER 'dmojo'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON dmojo.* TO 'dmojo'@'localhost';
FLUSH PRIVILEGES;
SQL
  sed -e "s#__DOMAIN__#${DOMAIN}#g" -e "s#__DB_PASS__#${DB_PASS}#g" -e "s#^PORT=3000#PORT=${APP_PORT}#" "$APP_DIR/deploy/env.production.example" > /etc/dmojo.env
  chown root:"$APP_USER" /etc/dmojo.env && chmod 640 /etc/dmojo.env
fi

echo "==> Build + migrate (no sample data)"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm ci && npm run build && node --env-file=/etc/dmojo.env scripts/db-setup.mjs"

echo "==> systemd service"
cp "$APP_DIR/deploy/dmojo.service" /etc/systemd/system/dmojo.service
systemctl daemon-reload
systemctl enable --now dmojo
sleep 2
curl -sI "http://127.0.0.1:${APP_PORT}/" | head -n 1 || echo "App did not answer - check: journalctl -u dmojo -n 50"

cat <<MSG

App is running on 127.0.0.1:${APP_PORT}. Remaining manual steps:
  1. Add a web-server site for ${DOMAIN}: see deploy/nginx.conf (nginx) or deploy/apache.conf (Apache).
     (Change 3000 to ${APP_PORT} in it if you used a different port.)
  2. Get HTTPS:  certbot --nginx -d ${DOMAIN}   (or --apache)
  3. nano /etc/dmojo.env  -> real production ATOM_* values, then: systemctl restart dmojo
  4. Open https://${DOMAIN}/auth to create the first admin.
MSG

#!/usr/bin/env bash
# One-time setup for Ubuntu 22.04/24.04. Run as root from the project folder:
#   sudo DOMAIN=example.com EMAIL=you@example.com bash deploy/setup.sh
# Re-running is safe: it never overwrites an existing /etc/dmojo.env or database.
set -euo pipefail

: "${DOMAIN:?Set DOMAIN, e.g. DOMAIN=tickets.example.com}"
: "${EMAIL:?Set EMAIL for certificate notices}"
APP_DIR=/var/www/dmojo
APP_USER=dmojo
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Packages"
apt-get update -y
apt-get install -y curl ca-certificates gnupg nginx mysql-server ufw rsync certbot python3-certbot-nginx
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> App user and folders"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" /var/lib/dmojo/event-media
rsync -a --delete --exclude node_modules --exclude .output --exclude .env --exclude .git "$SRC_DIR"/ "$APP_DIR"/
chown -R "$APP_USER":"$APP_USER" "$APP_DIR" /var/lib/dmojo

echo "==> Database"
systemctl enable --now mysql
if [ ! -f /etc/dmojo.env ]; then
  DB_PASS="$(openssl rand -hex 16)"
  mysql <<SQL
CREATE DATABASE IF NOT EXISTS dmojo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'dmojo'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER 'dmojo'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON dmojo.* TO 'dmojo'@'localhost';
FLUSH PRIVILEGES;
SQL
  sed -e "s#__DOMAIN__#${DOMAIN}#g" -e "s#__DB_PASS__#${DB_PASS}#g" "$APP_DIR/deploy/env.production.example" > /etc/dmojo.env
  chown root:"$APP_USER" /etc/dmojo.env
  chmod 640 /etc/dmojo.env
  echo "    Created /etc/dmojo.env  -> edit it and put your PRODUCTION Atom credentials in."
fi

echo "==> Build"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm ci && npm run build"

echo "==> Migrate database (no sample data)"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && node --env-file=/etc/dmojo.env scripts/db-setup.mjs"

echo "==> systemd service"
cp "$APP_DIR/deploy/dmojo.service" /etc/systemd/system/dmojo.service
systemctl daemon-reload
systemctl enable --now dmojo

echo "==> nginx"
sed "s#__DOMAIN__#${DOMAIN}#g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/dmojo
ln -sf /etc/nginx/sites-available/dmojo /etc/nginx/sites-enabled/dmojo
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> Firewall"
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable

echo "==> HTTPS certificate (DNS A record for $DOMAIN must already point to this server)"
certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --no-eff-email --redirect -n

echo
echo "Done. Next:"
echo "  1. nano /etc/dmojo.env   (set production ATOM_* values), then: systemctl restart dmojo"
echo "  2. Create the first admin by opening https://$DOMAIN/auth"
echo "  3. Logs: journalctl -u dmojo -f"

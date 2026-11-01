#!/usr/bin/env bash
# Deploy a new version. Upload the new project files to /root/dmojo-src (or any folder), then:
#   sudo bash /root/dmojo-src/deploy/update.sh
set -euo pipefail
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/var/www/dmojo
rsync -a --delete --exclude node_modules --exclude .output --exclude .env --exclude .git "$SRC_DIR"/ "$APP_DIR"/
chown -R dmojo:dmojo "$APP_DIR"
sudo -u dmojo bash -c "cd $APP_DIR && npm ci && npm run build && node --env-file=/etc/dmojo.env scripts/db-setup.mjs"
systemctl restart dmojo
systemctl --no-pager status dmojo | head -n 8

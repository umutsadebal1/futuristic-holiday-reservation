#!/usr/bin/env bash
# ============================================================
# tatilrezerve.com — DigitalOcean Ubuntu 24.04 LTS bir-tik kurulum
# ============================================================
# Kullanim:
#   sudo bash setup.sh
# ya da
#   sudo EMAIL=ornek@gmail.com bash setup.sh
# ============================================================

set -euo pipefail

DOMAIN="${DOMAIN:-tatilrezerve.com}"
EMAIL="${EMAIL:-}"
REPO_URL="${REPO_URL:-https://github.com/umutsadebal1/futuristic-holiday-reservation.git}"
APP_DIR="/opt/tatilrez"
SERVICE_PORT="5000"

cyan()   { printf "\n\033[1;36m==> %s\033[0m\n" "$1"; }
green()  { printf "\033[1;32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[1;33m%s\033[0m\n" "$1"; }
red()    { printf "\033[1;31m%s\033[0m\n" "$1"; }

if [ "$EUID" -ne 0 ]; then
  red "Bu betik root yetkisiyle calistirilmali. 'sudo bash setup.sh' deneyin."
  exit 1
fi

if [ -z "$EMAIL" ]; then
  read -rp "Lets Encrypt sertifikasi icin email adresi: " EMAIL
fi
if [ -z "$EMAIL" ]; then
  red "Email gerekli. Iptal."
  exit 1
fi

cyan "1/9 apt update + temel paketler"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg lsb-release ufw git nginx postgresql postgresql-contrib

cyan "2/9 Node.js 20 LTS"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

cyan "3/9 Firewall (UFW): SSH + 80 + 443"
ufw allow OpenSSH || true
ufw allow 80/tcp  || true
ufw allow 443/tcp || true
yes | ufw enable  || true

cyan "4/9 Repo clone (veya guncelle)"
if [ ! -d "${APP_DIR}/.git" ]; then
  git clone "${REPO_URL}" "${APP_DIR}"
else
  cd "${APP_DIR}" && git pull --ff-only origin main || true
fi

cyan "5/9 PostgreSQL kullanici + veritabani"
systemctl enable --now postgresql
sleep 2
DB_USER="tatilrez"
DB_NAME="tatilrez"
ENV_FILE="${APP_DIR}/backend/.env"

if [ -f "${ENV_FILE}" ] && grep -q "^DB_PASSWORD=" "${ENV_FILE}"; then
  DB_PASSWORD="$(grep "^DB_PASSWORD=" "${ENV_FILE}" | cut -d= -f2-)"
  yellow "  -> mevcut DB_PASSWORD korunuyor"
else
  DB_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")"
fi

# user (yeni varsa create, varsa parola guncelle)
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
  && sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';" \
  || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

# db (yoksa create)
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" || true

cyan "6/9 backend npm install + .env"
cd "${APP_DIR}/backend"
npm install --no-audit --no-fund

if [ ! -f "${ENV_FILE}" ]; then
  JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"
  BOOTSTRAP_KEY="TRZ-$(node -e "console.log(require('crypto').randomBytes(12).toString('hex').toUpperCase())")"
  cat > "${ENV_FILE}" <<EOF
PORT=${SERVICE_PORT}
HTTPS_ENABLED=false
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=8h
BCRYPT_ROUNDS=12
DB_USER=${DB_USER}
DB_HOST=localhost
DB_NAME=${DB_NAME}
DB_PASSWORD=${DB_PASSWORD}
DB_PORT=5432
RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=
MAINTENANCE_MODE=true
MAINTENANCE_MESSAGE=Sistem bakimda. Erisim icin yetkili anahtarini girin.
MAINTENANCE_TOKEN_TTL=12h
MAINTENANCE_BOOTSTRAP_KEY=${BOOTSTRAP_KEY}
REQUIRE_HTTPS=true
EOF
  green "  -> .env yaratildi."
else
  yellow "  -> .env zaten mevcut, dokunulmadi."
fi

cyan "7/9 PM2 (process manager)"
npm install -g pm2 >/dev/null
cd "${APP_DIR}/backend"
pm2 delete tatilrez >/dev/null 2>&1 || true
if [ -f ecosystem.config.cjs ]; then
  pm2 start ecosystem.config.cjs --name tatilrez
else
  pm2 start server.js --name tatilrez
fi
pm2 save
PM2_STARTUP="$(pm2 startup systemd -u root --hp /root | tail -1)"
eval "${PM2_STARTUP}" || true

cyan "8/9 Nginx reverse proxy"
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
cat > "${NGINX_CONF}" <<NGX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:${SERVICE_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300;
    }
}
NGX
ln -sf "${NGINX_CONF}" "/etc/nginx/sites-enabled/${DOMAIN}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

cyan "9/9 Lets Encrypt sertifikasi"
apt-get install -y certbot python3-certbot-nginx
if certbot certificates 2>/dev/null | grep -q "Certificate Name: ${DOMAIN}"; then
  yellow "  -> Sertifika zaten alinmis, atlandi."
else
  if certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" \
       -m "${EMAIL}" --agree-tos --non-interactive --redirect; then
    green "  -> Sertifika alindi, HTTPS aktif."
  else
    yellow "  -> Sertifika alinamadi (DNS henuz yayilmamis olabilir)."
    yellow "     5-30 dk sonra elle calistir:"
    yellow "       certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} -m ${EMAIL} --agree-tos --redirect"
  fi
fi

green ""
green "==================================================="
green "  KURULUM TAMAMLANDI"
green "==================================================="
echo
echo "  Site:                 https://${DOMAIN}"
echo "  Maintenance bootstrap key:"
grep "^MAINTENANCE_BOOTSTRAP_KEY=" "${ENV_FILE}" | sed 's/^/    /'
echo
echo "  Yararli komutlar:"
echo "    pm2 status"
echo "    pm2 logs tatilrez --lines 50"
echo "    pm2 restart tatilrez"
echo "    cat ${ENV_FILE}"
echo "    nano ${ENV_FILE}        # MAINTENANCE_MODE=false yapip restart edersen kilit acilir"
echo
echo "  Recaptcha key'lerini eklemek istersen:"
echo "    nano ${ENV_FILE}"
echo "    pm2 restart tatilrez"
echo
green "==================================================="

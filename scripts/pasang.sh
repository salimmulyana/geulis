#!/usr/bin/env bash
# Pemasangan GeuLIS pada server baru.
#
#   sudo ./scripts/pasang.sh                pasang
#   sudo ./scripts/pasang.sh --periksa      periksa kesiapan tanpa mengubah apa pun
#
# Dirancang untuk dijalankan di rumah sakit yang servernya sudah dipakai hal
# lain. Karena itu ia MENOLAK menimpa: port yang terpakai dicari penggantinya,
# konfigurasi nginx yang sudah ada tidak disentuh, dan database yang sudah ada
# tidak pernah ditulisi ulang.
#
set -euo pipefail

AKAR="$(cd "$(dirname "$0")/.." && pwd)"

merah()  { printf '\033[31m%s\033[0m\n' "$*"; }
kuning() { printf '\033[33m%s\033[0m\n' "$*"; }
hijau()  { printf '\033[32m%s\033[0m\n' "$*"; }
judul()  { printf '\n\033[1m%s\033[0m\n' "$*"; }

PERIKSA=0
[ "${1:-}" = "--periksa" ] && PERIKSA=1

if [ "$PERIKSA" = 0 ] && [ "$(id -u)" -ne 0 ]; then
  merah "Jalankan dengan sudo."
  exit 1
fi

DB_NAME=${DB_NAME:-geulis}
DB_USER=${DB_USER:-geulis_app}
PENGGUNA=${PENGGUNA:-geulis}
DIR=${DIR:-/var/www/geulis}

# ---------------------------------------------------------------- prasyarat
judul "1. Prasyarat"
KURANG=""
for p in node npm mysql nginx; do
  command -v "$p" >/dev/null 2>&1 || KURANG="$KURANG $p"
done
if [ -n "$KURANG" ]; then
  merah "Belum terpasang:$KURANG"
  echo "  Debian/Ubuntu:  apt install -y nodejs npm mariadb-server nginx"
  [ "$PERIKSA" = 1 ] || exit 1
else
  NODE_V=$(node -v)
  hijau "✓ node $NODE_V, npm, mysql, nginx"
  # Node 18 ke bawah tidak punya beberapa API yang dipakai. Diperiksa di sini
  # karena gejalanya kalau tidak: aplikasi menyala lalu mati saat permintaan
  # pertama, dengan galat yang tidak menyebut versi Node sama sekali.
  MAYOR=$(echo "$NODE_V" | sed 's/^v//' | cut -d. -f1)
  if [ "$MAYOR" -lt 18 ]; then
    merah "Node $NODE_V terlalu lama. Butuh 18 ke atas."
    [ "$PERIKSA" = 1 ] || exit 1
  fi
fi

# ---------------------------------------------------------------- port
judul "2. Port"
cari_port_bebas() {
  local p=$1
  while ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$p\$"; do
    p=$((p + 1))
  done
  echo "$p"
}
PORT_API=$(cari_port_bebas "${PORT_API:-3001}")
PORT_WEB=$(cari_port_bebas "${PORT_WEB:-5173}")
[ "$PORT_API" = "${PORT_API_MINTA:-3001}" ] || true
hijau "✓ API $PORT_API, web $PORT_WEB"
[ "$PORT_API" != "3001" ] && kuning "  (3001 terpakai, dipindah ke $PORT_API)"
[ "$PORT_WEB" != "5173" ] && kuning "  (5173 terpakai, dipindah ke $PORT_WEB)"

# ---------------------------------------------------------------- pemeriksaan saja
if [ "$PERIKSA" = 1 ]; then
  judul "3. Ringkasan (tidak ada yang diubah)"
  echo "  Direktori : $DIR"
  echo "  Pengguna  : $PENGGUNA"
  echo "  Database  : $DB_NAME (pengguna $DB_USER)"
  echo "  Port      : API $PORT_API, web $PORT_WEB"
  echo
  echo "  Sandi database dan JWT dibuat acak saat pemasangan, dan TIDAK PERNAH"
  echo "  dicetak ke layar — perintah ini sering dijalankan sambil berbagi layar."
  exit 0
fi

# ---------------------------------------------------------------- pengguna sistem
judul "3. Pengguna sistem"
if id "$PENGGUNA" >/dev/null 2>&1; then
  hijau "✓ pengguna $PENGGUNA sudah ada"
else
  # Tanpa shell dan tanpa hak sudo. Aplikasi web yang berjalan sebagai root
  # berarti satu celah di aplikasi menjadi satu celah di seluruh server.
  useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin "$PENGGUNA"
  hijau "✓ pengguna sistem $PENGGUNA dibuat (tanpa shell, tanpa sudo)"
fi

# ---------------------------------------------------------------- berkas
judul "4. Berkas aplikasi"
mkdir -p "$DIR"
if [ "$AKAR" != "$DIR" ]; then
  rsync -a --delete \
    --exclude node_modules --exclude .git \
    --exclude 'backend/.env' --exclude 'frontend/dist' \
    "$AKAR"/ "$DIR"/
fi
chown -R "$PENGGUNA:$PENGGUNA" "$DIR"
hijau "✓ disalin ke $DIR"

# ---------------------------------------------------------------- database
judul "5. Database"
if mysql -e "USE \`$DB_NAME\`" 2>/dev/null; then
  kuning "Database '$DB_NAME' SUDAH ADA — tidak disentuh."
  echo "  Skema akan disesuaikan sendiri saat aplikasi pertama kali berjalan."
  BUAT_DB=0
else
  SANDI_DB=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
  mysql <<SQL
CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$SANDI_DB';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL
  mysql "$DB_NAME" < "$DIR/database/schema.sql"
  hijau "✓ database dan pengguna dibuat, skema dimuat"
  BUAT_DB=1
fi

# ---------------------------------------------------------------- .env
judul "6. Konfigurasi"
if [ -f "$DIR/backend/.env" ]; then
  kuning "backend/.env sudah ada — TIDAK ditimpa."
  echo "  Menimpanya akan mengganti sandi database dan JWT_SECRET yang sedang"
  echo "  dipakai, dan seluruh sesi pengguna langsung putus."
else
  [ "${BUAT_DB:-0}" = 1 ] || { merah "Database sudah ada tetapi .env tidak — sandinya tidak diketahui."; \
    echo "  Isi $DIR/backend/.env secara manual, lalu jalankan ulang."; exit 1; }
  JWT=$(openssl rand -base64 48 | tr -d '\n')
  cat > "$DIR/backend/.env" <<EOF
PORT=$PORT_API
BIND_HOST=127.0.0.1
DB_HOST=localhost
DB_PORT=3306
DB_USER=$DB_USER
DB_PASSWORD=$SANDI_DB
DB_NAME=$DB_NAME
JWT_SECRET=$JWT
INSTRUMENT_LISTENER_ENABLED=true
EOF
  chown "$PENGGUNA:$PENGGUNA" "$DIR/backend/.env"
  chmod 600 "$DIR/backend/.env"
  hijau "✓ backend/.env dibuat (0600, milik $PENGGUNA)"
  echo "  Sandi tidak dicetak. Bila perlu: sudo cat $DIR/backend/.env"
fi

# ---------------------------------------------------------------- dependensi
judul "7. Dependensi dan build"
sudo -u "$PENGGUNA" bash -c "cd '$DIR' && npm run install:all >/dev/null 2>&1" || {
  merah "Pemasangan dependensi gagal."; exit 1; }
sudo -u "$PENGGUNA" bash -c "cd '$DIR/frontend' && npm run build >/dev/null 2>&1" || {
  merah "Build frontend gagal."; exit 1; }
hijau "✓ dependensi terpasang, frontend dibangun"

# ---------------------------------------------------------------- systemd
judul "8. Layanan"
cat > /etc/systemd/system/geulis.service <<EOF
[Unit]
Description=GeuLIS backend
After=network.target mariadb.service

[Service]
Type=simple
User=$PENGGUNA
WorkingDirectory=$DIR/backend
ExecStart=$(command -v node) src/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$DIR

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now geulis >/dev/null 2>&1
hijau "✓ layanan geulis aktif dan otomatis jalan saat boot"

# ---------------------------------------------------------------- nginx
judul "9. Nginx"
# Berkas terpisah, dan situs yang sudah ada TIDAK disentuh. Rumah sakit sering
# sudah menjalankan aplikasi lain di server yang sama.
if [ -f /etc/nginx/sites-available/geulis ]; then
  kuning "Konfigurasi nginx untuk geulis sudah ada — tidak ditimpa."
else
  cat > /etc/nginx/sites-available/geulis <<EOF
server {
    listen $PORT_WEB;
    root $DIR/frontend/dist;
    index index.html;

    # Frontend memanggil API lewat path relatif /api dan mengandalkan proxy ini.
    # Menyajikan dist tanpa proxy menghasilkan aplikasi yang tampak jalan tetapi
    # setiap panggilan API menerima index.html.
    location /api/ {
        proxy_pass http://127.0.0.1:$PORT_API;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
  ln -sf /etc/nginx/sites-available/geulis /etc/nginx/sites-enabled/geulis
  nginx -t >/dev/null 2>&1 || { merah "Konfigurasi nginx ditolak."; nginx -t; exit 1; }
  systemctl reload nginx
  hijau "✓ nginx menyajikan web di port $PORT_WEB"
fi

# ---------------------------------------------------------------- firewall
judul "10. Firewall"
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "$PORT_WEB/tcp" >/dev/null 2>&1 || true
  hijau "✓ port $PORT_WEB diizinkan"
  kuning "  Port alat laboratorium belum dibuka. Buka sesuai alat yang dipakai,"
  kuning "  mis. 'ufw allow 5005/tcp' untuk alat yang menghubungi LIS."
else
  kuning "ufw tidak aktif — lewati. Pastikan firewall lain mengizinkan $PORT_WEB."
fi

# ---------------------------------------------------------------- selesai
judul "Selesai"
echo "  Web    : http://$(hostname -I | awk '{print $1}'):$PORT_WEB"
echo "  Layanan: systemctl status geulis"
echo "  Log    : journalctl -u geulis -f"
echo
echo "  Sandi awal pengguna aplikasi dibuat acak dan dicatat di:"
echo "    $DIR/SANDI_AWAL.txt"
echo "  Ganti sandinya lalu HAPUS berkas itu."
echo
kuning "  Belum dikerjakan skrip ini, dan keduanya wajib:"
echo "    1. Cadangan luar mesin — lihat scripts/backup.sh, set LUAR_RSYNC atau LUAR_DIR."
echo "       PMK 24/2022 Pasal 20(5) menuntut salinan di lokasi berbeda."
echo "    2. HTTPS. Sertifikat mandiri sudah cukup untuk jaringan tertutup."

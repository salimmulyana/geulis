#!/usr/bin/env bash
#
# Menjalankan GeuLIS untuk pengembangan lokal.
#
#   ./start.sh                  jalankan backend + frontend
#   ./start.sh --dengan-alat    ikut menyalakan listener alat laboratorium
#
# Skrip ini memeriksa dulu apa yang biasanya salah, lalu menjelaskannya dengan
# kalimat yang bisa ditindaklanjuti. Gejala "aplikasinya tidak jalan" hampir
# selalu salah satu dari empat hal di bawah, dan menebaknya satu per satu
# memakan waktu lebih lama daripada memeriksa keempatnya sekaligus.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

DENGAN_ALAT=0
[ "${1:-}" = "--dengan-alat" ] && DENGAN_ALAT=1

merah()  { printf '\033[31m%s\033[0m\n' "$*"; }
kuning() { printf '\033[33m%s\033[0m\n' "$*"; }
hijau()  { printf '\033[32m%s\033[0m\n' "$*"; }

printf '\n\033[1m=== GeuLIS ===\033[0m\n\n'

# ---------------------------------------------------------------- 1. .env
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  kuning "backend/.env dibuat dari contoh — periksa DB_PASSWORD sebelum melanjutkan"
fi
set -a
# shellcheck disable=SC1091
. ./backend/.env
set +a

DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-geulis}"
PORT="${PORT:-3001}"

# ---------------------------------------------------------------- 2. database
# Diperiksa paling dulu karena kegagalannya paling membingungkan: aplikasi
# menyala normal, halaman login tampil, lalu tombol Masuk menggantung tanpa
# pesan apa pun sampai koneksinya kedaluwarsa. Tidak ada yang menghubungkannya
# dengan database yang mati.
if ! command -v mysql >/dev/null 2>&1; then
  kuning "klien mysql tidak ada — pemeriksaan database dilewati"
else
  if ! MYSQL_PWD="${DB_PASSWORD:-}" mysql -h "$DB_HOST" -u "$DB_USER" \
       -e "USE \`$DB_NAME\`" >/dev/null 2>&1; then
    merah "Tidak bisa menyambung ke database '$DB_NAME'."
    echo
    echo "  Periksa berurutan:"
    echo "    1. MariaDB berjalan?       systemctl status mariadb"
    echo "    2. Database sudah dibuat?  mysql -u $DB_USER -e \"CREATE DATABASE $DB_NAME\""
    echo "    3. Skema sudah dimuat?     mysql -u $DB_USER $DB_NAME < database/schema.sql"
    echo "    4. DB_PASSWORD di backend/.env sudah benar?"
    echo
    exit 1
  fi

  JML=$(MYSQL_PWD="${DB_PASSWORD:-}" mysql -h "$DB_HOST" -u "$DB_USER" -N -B \
        -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME'" \
        2>/dev/null || echo 0)
  if [ "$JML" -lt 5 ]; then
    merah "Database '$DB_NAME' ada tetapi hampir kosong ($JML tabel)."
    echo "  Muat skemanya:  mysql -u $DB_USER $DB_NAME < database/schema.sql"
    exit 1
  fi
  hijau "✓ database $DB_NAME siap ($JML tabel)"
fi

# ---------------------------------------------------------------- 3. port
# Dua GeuLIS yang berjalan bersamaan gagal dengan cara yang menyesatkan: yang
# kedua mati, tetapi peramban masih melihat yang pertama, sehingga perubahan
# kode tampak tidak berpengaruh sama sekali.
for p in "$PORT" 5173; do
  if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$p\$"; then
    merah "Port $p sudah dipakai proses lain."
    echo "  Lihat siapa   :  ss -ltnp | grep :$p"
    echo "  GeuLIS lama?  :  pkill -f 'node --watch src/index.js'; pkill -f vite"
    exit 1
  fi
done
hijau "✓ port $PORT dan 5173 bebas"

# ---------------------------------------------------------------- 4. dependensi
if [ ! -d backend/node_modules ] || [ ! -d frontend/node_modules ]; then
  kuning "memasang dependensi backend & frontend (sekali saja, agak lama)"
  npm run install:all
fi
if [ ! -d node_modules ]; then
  kuning "memasang dependensi root"
  npm install
fi
hijau "✓ dependensi siap"

# ---------------------------------------------------------------- 5. listener alat
# Dimatikan secara BAWAAN untuk pengembangan lokal.
#
# Alat laboratorium hanya ada di jaringan rumah sakit. Di laptop, listener terus
# mencoba menyambung dan membanjiri log dengan EHOSTUNREACH — lima galat dalam
# dua puluh detik pada percobaan pertama. Log yang penuh galat tak berarti
# membuat galat yang berarti ikut terlewat.
if [ "$DENGAN_ALAT" = 1 ]; then
  export INSTRUMENT_LISTENER_ENABLED=true
  kuning "listener alat DINYALAKAN — galat koneksi wajar bila alat tak terjangkau"
else
  export INSTRUMENT_LISTENER_ENABLED=false
  hijau "✓ listener alat dimatikan (pakai --dengan-alat untuk menyalakannya)"
fi

# ---------------------------------------------------------------- jalan
echo
echo "  Frontend : http://localhost:5173"
echo "  API      : http://localhost:$PORT"
if [ -f SANDI_AWAL.txt ]; then
  echo "  Login    : lihat SANDI_AWAL.txt"
else
  echo "  Login    : sandi awal dibuat acak saat pemasangan pertama,"
  echo "             lalu dicatat di SANDI_AWAL.txt"
fi
echo
echo "  Ctrl+C untuk berhenti."
echo

exec npx concurrently -k -n API,WEB -c blue,green \
  "npm run dev --prefix backend" \
  "npm run dev --prefix frontend"

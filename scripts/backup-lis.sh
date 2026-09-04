#!/bin/bash
# Cadangan harian database GeuLIS.
#
# Dipasang lewat cron di tiap server rumah sakit. Sengaja sederhana: satu berkas
# dump terkompresi per hari, ditambah tautan "terbaru" supaya mudah diambil dari
# luar mesin. Kredensial dibaca dari backend/.env, jadi tidak ada password kedua
# yang harus dijaga.
set -uo pipefail

APP_DIR=${APP_DIR:-/var/www/geulis}
TUJUAN=${TUJUAN:-/var/backups/geulis}
SIMPAN_HARI=${SIMPAN_HARI:-14}
LOG=$TUJUAN/backup.log

catat() { echo "$(date '+%F %T') $*" >> "$LOG"; }

mkdir -p "$TUJUAN" || exit 1
chmod 700 "$TUJUAN"

# Ambil kredensial dari .env backend tanpa menjalankan isinya sebagai skrip.
ambil() { sed -n "s/^$1=//p" "$APP_DIR/backend/.env" | tail -1 | tr -d '"'"'"'\r'; }
DB_HOST=$(ambil DB_HOST); DB_HOST=${DB_HOST:-127.0.0.1}
DB_USER=$(ambil DB_USER)
DB_PASS=$(ambil DB_PASSWORD)
DB_NAME=$(ambil DB_NAME)

if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
  catat "GAGAL: DB_USER/DB_NAME tidak terbaca dari $APP_DIR/backend/.env"
  exit 1
fi

STEMPEL=$(date +%F_%H%M)
BERKAS=$TUJUAN/${DB_NAME}_${STEMPEL}.sql.gz
SEMENTARA=$BERKAS.parsial

# defaults-file sementara supaya password tidak muncul di daftar proses.
CNF=$(mktemp); chmod 600 "$CNF"
printf '[client]\nhost=%s\nuser=%s\npassword=%s\n' "$DB_HOST" "$DB_USER" "$DB_PASS" > "$CNF"
trap 'rm -f "$CNF" "$SEMENTARA"' EXIT

# --single-transaction: dump konsisten tanpa mengunci tabel, jadi lab tetap
# bisa bekerja saat cadangan berjalan.
if ! mysqldump --defaults-file="$CNF" --single-transaction --quick \
       --routines --events --triggers "$DB_NAME" 2>>"$LOG" | gzip -9 > "$SEMENTARA"; then
  catat "GAGAL: mysqldump $DB_NAME"
  exit 1
fi

# Dump yang terpotong di tengah tetap menghasilkan gzip yang sah, jadi
# keberhasilan diuji dari penanda penutup mysqldump, bukan dari kode keluar saja.
if ! gzip -dc "$SEMENTARA" | tail -5 | grep -q "Dump completed"; then
  catat "GAGAL: dump tidak lengkap, tidak ada penanda 'Dump completed'"
  exit 1
fi

mv "$SEMENTARA" "$BERKAS"
chmod 600 "$BERKAS"
ln -sf "$BERKAS" "$TUJUAN/terbaru.sql.gz"

UKURAN=$(du -h "$BERKAS" | cut -f1)
JUMLAH=$(gzip -dc "$BERKAS" | grep -c '^CREATE TABLE')
catat "OK: $BERKAS ($UKURAN, $JUMLAH tabel)"

# Buang cadangan lama. -mtime menghitung penuh 24 jam, jadi +$SIMPAN_HARI
# menyisakan kira-kira $SIMPAN_HARI salinan harian.
find "$TUJUAN" -name "${DB_NAME}_*.sql.gz" -type f -mtime +"$SIMPAN_HARI" -delete

#!/usr/bin/env bash
# Cadangan harian GeuLIS.
#
# PMK 24/2022 Pasal 20 ayat (5) mewajibkan cadangan data rekam medis elektronik:
#   a. diletakkan pada tempat yang BERBEDA dari lokasi fasilitas kesehatan;
#   b. dilakukan secara periodik;
#   c. dituangkan dalam standar prosedur operasional.
#
# Skrip ini memenuhi (a) dan (b). Huruf (c) adalah dokumen, bukan kode.
#
# Cadangan yang hanya tersimpan di mesin yang sama BUKAN cadangan: satu disk
# rusak, keduanya hilang. Karena itu penyalinan ke luar mesin diperlakukan
# sebagai bagian dari pekerjaan, bukan tambahan — kalau tujuan luar tidak diset,
# skrip ini memperingatkan dengan keras dan keluar dengan status gagal.
#
# Pemakaian:
#   ./scripts/backup.sh                 cadangkan sekarang
#   ./scripts/backup.sh --periksa       periksa setelan tanpa mencadangkan
#   ./scripts/backup.sh --pulihkan FILE pulihkan dari satu berkas cadangan
#
set -euo pipefail

AKAR="$(cd "$(dirname "$0")/.." && pwd)"
TUJUAN=${TUJUAN:-/var/backups/geulis}
SIMPAN_HARI=${SIMPAN_HARI:-30}

# Tujuan di luar mesin. Salah satu:
#   LUAR_RSYNC=user@host:/path/   -> disalin dengan rsync lewat SSH
#   LUAR_DIR=/mnt/disk-lain/...   -> disalin ke titik pasang lain (disk/USB/NAS)
LUAR_RSYNC=${LUAR_RSYNC:-}
LUAR_DIR=${LUAR_DIR:-}

merah()  { printf '\033[31m%s\033[0m\n' "$*"; }
kuning() { printf '\033[33m%s\033[0m\n' "$*"; }
hijau()  { printf '\033[32m%s\033[0m\n' "$*"; }

if [ ! -f "$AKAR/backend/.env" ]; then
  merah "backend/.env tidak ada. Skrip ini membaca kredensial database dari sana."
  exit 1
fi
# shellcheck disable=SC1091
set -a; . "$AKAR/backend/.env"; set +a

DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-geulis}"

mkdir -p "$TUJUAN"
LOG="$TUJUAN/backup.log"
catat() { echo "$(date '+%F %T') $*" >> "$LOG"; }

# ---------------------------------------------------------------- pemulihan
if [ "${1:-}" = "--pulihkan" ]; then
  BERKAS="${2:-}"
  [ -f "$BERKAS" ] || { merah "Berkas cadangan tidak ditemukan: $BERKAS"; exit 1; }
  kuning "Ini akan MENIMPA seluruh isi database '$DB_NAME'."
  read -r -p "Ketik nama databasenya untuk melanjutkan: " jwb
  [ "$jwb" = "$DB_NAME" ] || { merah "Dibatalkan."; exit 1; }
  gunzip -c "$BERKAS" | MYSQL_PWD="${DB_PASSWORD:-}" mysql -h "$DB_HOST" -u "$DB_USER" "$DB_NAME"
  hijau "Dipulihkan dari $BERKAS"
  catat "PULIHKAN dari $BERKAS"
  exit 0
fi

# ---------------------------------------------------------------- pemeriksaan
if [ "${1:-}" = "--periksa" ]; then
  echo "  Database : $DB_NAME @ $DB_HOST (pengguna $DB_USER)"
  echo "  Tujuan   : $TUJUAN"
  echo "  Simpan   : $SIMPAN_HARI hari"
  if [ -n "$LUAR_RSYNC" ]; then echo "  Luar     : rsync -> $LUAR_RSYNC"
  elif [ -n "$LUAR_DIR" ]; then echo "  Luar     : salin -> $LUAR_DIR"
  else merah "  Luar     : BELUM DISET — cadangan tidak memenuhi PMK 24/2022 Pasal 20(5) huruf a"; fi
  # Kredensial sengaja TIDAK dicetak, bahkan saat memeriksa. Perintah periksa
  # sering dijalankan sambil berbagi layar.
  exit 0
fi

# ---------------------------------------------------------------- cadangkan
STEMPEL=$(date +%F_%H%M)
BERKAS="$TUJUAN/geulis_$STEMPEL.sql.gz"

if ! MYSQL_PWD="${DB_PASSWORD:-}" mysqldump -h "$DB_HOST" -u "$DB_USER" \
     --single-transaction --routines --triggers --events "$DB_NAME" \
     2>>"$LOG" | gzip -9 > "$BERKAS"; then
  merah "mysqldump GAGAL. Lihat $LOG"
  catat "GAGAL mysqldump"
  rm -f "$BERKAS"
  exit 1
fi

# Cadangan yang tidak pernah dibuka bukan cadangan, melainkan harapan. Berkasnya
# diuji baca sekarang juga — kerusakan gzip yang baru ketahuan saat dibutuhkan
# adalah kegagalan yang paling mahal.
if ! gzip -t "$BERKAS" 2>>"$LOG"; then
  merah "Berkas cadangan rusak: $BERKAS"
  catat "GAGAL verifikasi gzip $BERKAS"
  exit 1
fi

UKURAN=$(stat -c%s "$BERKAS")

# Kelengkapan diperiksa dari ISI, bukan dari ukuran berkas.
#
# Ambang ukuran adalah ukuran yang salah: lab yang baru dipasang, atau yang
# datanya baru dikosongkan, menghasilkan dump kecil yang sepenuhnya sah — dan
# menolaknya berarti hari-hari pertama justru berjalan tanpa cadangan. Yang
# benar-benar menandakan kegagalan adalah struktur yang hilang: dump yang
# berhasil tetapi tidak memuat tabel inti berarti kredensial atau nama database
# yang keliru, dan itu terjadi TANPA galat apa pun.
HILANG=""
for t in patients lab_results lab_tests users; do
  gunzip -c "$BERKAS" | grep -q "CREATE TABLE \`$t\`" || HILANG="$HILANG $t"
done
if [ -n "$HILANG" ]; then
  merah "Cadangan tidak memuat tabel inti:$HILANG"
  echo "  Hampir selalu berarti kredensial atau nama database keliru — mysqldump"
  echo "  tetap berhasil dan menghasilkan berkas yang tampak wajar."
  catat "GAGAL tabel inti hilang:$HILANG"
  exit 1
fi

hijau "✓ $BERKAS ($(numfmt --to=iec "$UKURAN"))"
catat "OK $BERKAS $UKURAN byte"

# ---------------------------------------------------------------- ke luar mesin
DILUAR=0
if [ -n "$LUAR_RSYNC" ]; then
  if rsync -az --timeout=120 "$BERKAS" "$LUAR_RSYNC" 2>>"$LOG"; then
    hijau "✓ disalin ke $LUAR_RSYNC"; catat "LUAR rsync ok"; DILUAR=1
  else
    merah "Gagal menyalin ke $LUAR_RSYNC"; catat "LUAR rsync GAGAL"
  fi
elif [ -n "$LUAR_DIR" ]; then
  if mkdir -p "$LUAR_DIR" && cp "$BERKAS" "$LUAR_DIR/" 2>>"$LOG"; then
    hijau "✓ disalin ke $LUAR_DIR"; catat "LUAR salin ok"; DILUAR=1
  else
    merah "Gagal menyalin ke $LUAR_DIR"; catat "LUAR salin GAGAL"
  fi
fi

# Penyimpanan lama dibersihkan HANYA di tujuan lokal, tidak pernah di tujuan
# luar. Menghapus di tempat yang tidak bisa dipastikan isinya adalah cara
# kehilangan cadangan terakhir.
find "$TUJUAN" -name 'geulis_*.sql.gz' -type f -mtime "+$SIMPAN_HARI" -delete 2>>"$LOG" || true

if [ "$DILUAR" = 0 ]; then
  echo
  merah "PERINGATAN: cadangan hanya ada di mesin ini."
  echo "  PMK 24/2022 Pasal 20 ayat (5) huruf a menuntut salinan di lokasi BERBEDA."
  echo "  Set salah satu sebelum menjalankan:"
  echo "    LUAR_RSYNC=user@host:/path/backup/   (lewat SSH)"
  echo "    LUAR_DIR=/mnt/disk-cadangan          (disk lain / NAS)"
  exit 2
fi

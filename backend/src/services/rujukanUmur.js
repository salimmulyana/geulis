import pool from '../config/db.js';

/**
 * Pemilihan nilai rujukan menurut umur, jenis kelamin, dan kondisi.
 *
 * Ditulis agar menilai SAMA PERSIS dengan Oase LIS (internal/domain/rujukan.go):
 * bobot kekhususan yang sama, batas atas eksklusif yang sama, dan perlakuan yang
 * sama terhadap umur yang tidak diketahui. Dua produk yang menilai satu hasil
 * dengan cara berbeda adalah sumber kekeliruan yang sangat sulit ditemukan,
 * karena keduanya terlihat benar.
 */

/**
 * Umur dalam hari pada saat pemeriksaan.
 *
 * Mengembalikan null bila tanggal lahir tidak diketahui — BUKAN 0. Ini
 * pembedaan yang menentukan: 0 berarti bayi baru lahir, dan rujukan neonatus
 * jauh berbeda dari dewasa. Menganggap tanggal lahir kosong sebagai 0 hari
 * membuat setiap pasien tanpa tanggal lahir dinilai sebagai neonatus.
 */
export function umurHari(tanggalLahir, pada = new Date()) {
  if (!tanggalLahir) return null;
  const lahir = tanggalLahir instanceof Date ? tanggalLahir : new Date(tanggalLahir);
  if (isNaN(lahir.getTime())) return null;

  // Dihitung pada batas hari kalender, bukan selisih milidetik, supaya jam
  // pengambilan sampel tidak menggeser umur satu hari ke belakang.
  const a = Date.UTC(lahir.getUTCFullYear(), lahir.getUTCMonth(), lahir.getUTCDate());
  const b = Date.UTC(pada.getUTCFullYear(), pada.getUTCMonth(), pada.getUTCDate());
  const hari = Math.floor((b - a) / 86400000);
  return hari < 0 ? null : hari;
}

/**
 * Apakah satu rentang berlaku untuk konteks pasien ini.
 *
 * Rentang yang mensyaratkan sesuatu yang tidak diketahui dianggap TIDAK cocok.
 * Umur tidak diketahui berarti rentang berbasis umur dilewati seluruhnya, lalu
 * jatuh ke rujukan umum — bukan menebak.
 */
function cocok(r, k) {
  if (r.gender != null && r.gender !== k.gender) return false;

  if (r.umur_min_hari != null || r.umur_max_hari != null) {
    if (k.umurHari == null) return false;
    if (r.umur_min_hari != null && k.umurHari < r.umur_min_hari) return false;
    // Batas atas EKSKLUSIF: rentang 0-30 dan 30-365 bersambung tanpa celah.
    if (r.umur_max_hari != null && k.umurHari >= r.umur_max_hari) return false;
  }

  if (r.kondisi) {
    if (!k.kondisi) return false;
    if (String(r.kondisi).toLowerCase() !== String(k.kondisi).toLowerCase()) return false;
  }

  return true;
}

/**
 * Bobot kekhususan. Yang paling khusus menang.
 *
 * Kondisi diberi bobot tertinggi karena ia mengubah batas normal paling jauh:
 * hemoglobin 11,5 g/dL rendah untuk perempuan dewasa, tetapi normal dalam
 * kehamilan. Rentang "hamil" harus mengalahkan rentang "perempuan dewasa"
 * meskipun keduanya sama-sama cocok.
 */
function bobot(r) {
  let n = 0;
  if (r.kondisi) n += 4;
  if (r.gender != null) n += 2;
  if (r.umur_min_hari != null || r.umur_max_hari != null) n += 1;
  return n;
}

/**
 * Pilih satu rentang paling khusus yang cocok. null bila tidak ada.
 *
 * Bila dua rentang sama khususnya, yang lebih dulu didaftarkan menang — bukan
 * dipilih acak. Hasil yang sama harus dinilai sama setiap kali.
 */
export function pilihRujukan(daftar, konteks) {
  let terpilih = null;
  let tertinggi = -1;
  for (const r of daftar) {
    if (!cocok(r, konteks)) continue;
    const b = bobot(r);
    if (b > tertinggi) {
      tertinggi = b;
      terpilih = r;
    }
  }
  return terpilih;
}

// Rujukan jarang berubah tetapi dibaca pada setiap hasil yang masuk. Cache
// pendek: cukup untuk satu rentetan hasil dari alat, cukup singkat supaya
// perubahan di layar terasa hampir seketika.
const CACHE_MS = 30_000;
const cache = new Map();

export function kosongkanCacheRujukan(testId = null) {
  if (testId == null) cache.clear();
  else cache.delete(Number(testId));
}

async function muatRentang(testId) {
  const kunci = Number(testId);
  const kini = Date.now();
  const tersimpan = cache.get(kunci);
  if (tersimpan && kini - tersimpan.pada < CACHE_MS) return tersimpan.baris;

  const [baris] = await pool.query(
    `SELECT id, gender, umur_min_hari, umur_max_hari, kondisi, label,
            ref_min, ref_max, critical_min, critical_max
       FROM reference_ranges
      WHERE test_id = ? AND is_active = 1
      ORDER BY id`,
    [kunci]
  ).catch(() => [[]]);

  cache.set(kunci, { pada: kini, baris: baris || [] });
  return baris || [];
}

/**
 * Rujukan yang berlaku untuk satu pemeriksaan pada satu pasien.
 *
 * Urutan: rentang khusus dulu; kalau tidak ada yang cocok, jatuh ke kolom
 * lab_tests yang lama (termasuk rujukan spesifik gender). Jalur lama sengaja
 * dipertahankan supaya katalog yang sudah terisi tetap bekerja tanpa harus
 * dipindahkan lebih dulu.
 */
export async function rujukanBerlaku(test, konteks = {}) {
  const k = {
    gender: konteks.gender ?? null,
    umurHari: konteks.umurHari ?? null,
    kondisi: konteks.kondisi ?? null,
  };

  if (test?.id != null) {
    const daftar = await muatRentang(test.id);
    const r = pilihRujukan(daftar, k);
    if (r) {
      return {
        min: r.ref_min != null ? Number(r.ref_min) : null,
        max: r.ref_max != null ? Number(r.ref_max) : null,
        criticalMin: r.critical_min != null ? Number(r.critical_min) : null,
        criticalMax: r.critical_max != null ? Number(r.critical_max) : null,
        label: r.label || null,
        sumber: 'rentang',
      };
    }
  }

  let min = test?.reference_min ?? null;
  let max = test?.reference_max ?? null;
  if (k.gender === 'L') {
    if (test?.reference_min_l != null) min = test.reference_min_l;
    if (test?.reference_max_l != null) max = test.reference_max_l;
  } else if (k.gender === 'P') {
    if (test?.reference_min_p != null) min = test.reference_min_p;
    if (test?.reference_max_p != null) max = test.reference_max_p;
  }

  return {
    min: min != null ? Number(min) : null,
    max: max != null ? Number(max) : null,
    criticalMin: test?.critical_min != null ? Number(test.critical_min) : null,
    criticalMax: test?.critical_max != null ? Number(test.critical_max) : null,
    label: null,
    sumber: 'katalog',
  };
}

/** Label rujukan untuk dicetak, mis. "3,5 - 5,5" atau "< 5,7". */
export function labelRujukan(r) {
  if (r?.label) return r.label;
  const a = r?.min;
  const b = r?.max;
  if (a != null && b != null) return `${a} - ${b}`;
  if (a != null) return `> ${a}`;
  if (b != null) return `< ${b}`;
  return '';
}

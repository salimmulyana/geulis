import { rujukanBerlaku, labelRujukan } from './rujukanUmur.js';

/**
 * Tentukan penanda hasil dari rujukan yang SUDAH dipilih.
 *
 * Dipisahkan dari pemilihan rujukan supaya bisa diuji sendiri, dan supaya
 * pemanggil yang sudah memegang rujukannya tidak perlu membacanya lagi.
 */
export function flagDariRujukan(value, r) {
  const n = parseFloat(value);
  if (isNaN(n)) return 'abnormal';

  // Nilai kritis resmi lab bila tersedia. Ini ambang yang menuntut pemberitahuan
  // segera ke dokter, dan angkanya ditetapkan lab — bukan diturunkan dari rujukan.
  if (r?.criticalMin != null && n <= r.criticalMin) return 'critical';
  if (r?.criticalMax != null && n >= r.criticalMax) return 'critical';

  // Di luar rujukan tapi tanpa nilai kritis resmi -> cukup low/high.
  //
  // Dulu di sini ada tebakan "30% di luar rujukan berarti kritis". Tebakan itu
  // dibuang: pada hitung jenis leukosit ia menandai LYMPH% 13,2 dan NEUT% 22
  // sebagai kritis, padahal angka itu lazim. Banyak merah palsu justru membuat
  // petugas berhenti menghiraukan yang merah sungguhan. Sekarang "kritis" hanya
  // muncul bila lab menetapkan ambangnya sendiri.
  if (r?.min != null && n < r.min) return 'low';
  if (r?.max != null && n > r.max) return 'high';
  return 'normal';
}

/**
 * Hitung penanda hasil beserta rujukan yang dipakai.
 *
 * Konteks pasien boleh berupa objek { gender, umurHari, kondisi } atau — untuk
 * pemanggil lama — sekadar string 'L'/'P'. Bentuk lama sengaja tetap diterima
 * supaya jalur yang belum sempat meneruskan umur tidak diam-diam menilai setiap
 * pasien sebagai neonatus; ia cukup kehilangan kekhususan umur, tidak salah.
 *
 * @returns {{flag: string, min: number|null, max: number|null, label: string}}
 */
export async function nilaiHasil(value, test, konteks) {
  const k =
    typeof konteks === 'string' || konteks == null
      ? { gender: konteks ?? null, umurHari: null, kondisi: null }
      : konteks;

  const r = await rujukanBerlaku(test, k);
  return {
    flag: flagDariRujukan(value, r),
    min: r.min,
    max: r.max,
    label: labelRujukan(r),
  };
}

/**
 * Bentuk lama: hanya mengembalikan penanda.
 *
 * Dipertahankan agar pemanggil yang belum dipindahkan tetap bekerja. Perlu
 * ditunggu (await) karena rujukan kini dibaca dari tabel.
 */
export async function calcFlag(value, test, gender) {
  const { flag } = await nilaiHasil(value, test, gender);
  return flag;
}

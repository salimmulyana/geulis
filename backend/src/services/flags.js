/**
 * Hitung flag hasil berdasar nilai rujukan, dengan dukungan
 * rujukan spesifik gender (reference_*_l / reference_*_p).
 * Jika kolom gender kosong, fallback ke reference_min / reference_max.
 *
 * @param {string|number} value
 * @param {object} test  - baris lab_tests
 * @param {'L'|'P'|null} gender
 */
export function calcFlag(value, test, gender) {
  const n = parseFloat(value);
  if (isNaN(n)) return 'abnormal';

  let min = test?.reference_min;
  let max = test?.reference_max;

  if (gender === 'L') {
    if (test?.reference_min_l != null) min = test.reference_min_l;
    if (test?.reference_max_l != null) max = test.reference_max_l;
  } else if (gender === 'P') {
    if (test?.reference_min_p != null) min = test.reference_min_p;
    if (test?.reference_max_p != null) max = test.reference_max_p;
  }

  // Nilai kritis resmi lab bila tersedia. Ini ambang yang menuntut pemberitahuan
  // segera ke dokter, dan angkanya ditetapkan lab — bukan diturunkan dari rujukan.
  const cMin = test?.critical_min;
  const cMax = test?.critical_max;
  if (cMin != null && n <= cMin) return 'critical';
  if (cMax != null && n >= cMax) return 'critical';

  // Di luar rujukan tapi tanpa nilai kritis resmi -> cukup low/high.
  //
  // Dulu di sini ada tebakan "30% di luar rujukan berarti kritis". Tebakan itu
  // dibuang: pada hitung jenis leukosit ia menandai LYMPH% 13,2 dan NEUT% 22
  // sebagai kritis, padahal angka itu lazim. Banyak merah palsu justru membuat
  // petugas berhenti menghiraukan yang merah sungguhan. Sekarang "kritis" hanya
  // muncul bila lab menetapkan ambangnya sendiri di critical_min/critical_max.
  if (min != null && n < min) return 'low';
  if (max != null && n > max) return 'high';
  return 'normal';
}

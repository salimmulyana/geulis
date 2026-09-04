import pool from '../config/db.js';

/**
 * Delta check: bandingkan hasil baru dengan hasil sebelumnya milik pasien yang
 * sama pada pemeriksaan yang sama.
 *
 * Gunanya menangkap sampel tertukar. HGB turun 4 g/dL dalam sehari jauh lebih
 * sering berarti tabung tertukar daripada pasien memburuk secepat itu.
 * Hasilnya sengaja hanya berupa penanda "periksa lagi", bukan penolakan —
 * perubahan besar memang bisa nyata (perdarahan, transfusi, kemoterapi).
 */

// Ambang bawaan per pemeriksaan, dalam persen perubahan. Dipakai kalau lab
// belum mengisi delta_limit_percent di katalog tesnya.
const AMBANG_BAWAAN = {
  HGB: 20, HCT: 20, RBC: 20, WBC: 60, PLT: 50, MCV: 10, MCH: 10, MCHC: 10,
};

const JENDELA_HARI = 7;

/**
 * @returns {{percent: number, flag: 'none'|'check', sebelumnya: number}|null}
 *   null bila tidak ada pembanding.
 */
export async function hitungDelta(patientId, testId, nilaiBaru, kodeTes, ambangKatalog) {
  const n = parseFloat(nilaiBaru);
  if (!patientId || !testId || isNaN(n)) return null;

  const [[sebelum]] = await pool.query(
    `SELECT result_numeric FROM lab_results
      WHERE patient_id = ? AND test_id = ? AND result_numeric IS NOT NULL
        AND result_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY result_at DESC, id DESC LIMIT 1`,
    [patientId, testId, JENDELA_HARI]
  ).catch(() => [[]]);

  if (!sebelum || sebelum.result_numeric == null) return null;
  const lama = Number(sebelum.result_numeric);
  if (!lama) return null; // pembagian dengan nol tidak bermakna

  const persen = ((n - lama) / Math.abs(lama)) * 100;
  const ambang = ambangKatalog != null ? Number(ambangKatalog) : AMBANG_BAWAAN[kodeTes];

  return {
    percent: Number(persen.toFixed(2)),
    sebelumnya: lama,
    flag: ambang != null && Math.abs(persen) > ambang ? 'check' : 'none',
  };
}

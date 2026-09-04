import pool from '../config/db.js';

/**
 * Kontrol mutu (QC).
 *
 * Alat mengirim bahan kontrol lewat jalur yang sama dengan sampel pasien.
 * Nilainya dinilai terhadap mean dan SD lot kontrol yang dipakai lab, memakai
 * sebagian aturan Westgard yang paling berguna sehari-hari:
 *
 *   1-3s  satu titik lebih dari 3 SD dari mean          -> tolak
 *   2-2s  dua titik sama-sama lewat 2 SD sesisi          -> tolak
 *   R-4s  dua titik berseberangan, rentang lebih dari 4 SD -> tolak
 *   4-1s  empat titik berurutan sesisi lewat 1 SD       -> tolak (bias sistematis)
 *   10x   sepuluh titik berurutan di sisi mean yang sama -> tolak (pergeseran)
 *   1-2s  satu titik lewat 2 SD                          -> peringatan saja
 *
 * Penamaan di PMK 43/2013 halaman 122-124 sedikit berbeda (13S, 22S, R4S, 41S,
 * 10X, dengan 12S sebagai penapis), tetapi isinya sama.
 *
 * Regulasi mengandaikan DUA bahan kontrol tiap hari — kontrol rendah dan kontrol
 * tinggi — dan aturan 2-2s serta R-4s dinilai menyilang antar keduanya dalam
 * satu run, bukan hanya berurutan dalam satu level. Karena itu penilaian di sini
 * memakai dua sumber: riwayat level yang sama, dan titik level lain pada run
 * yang sama.
 *
 * Tanpa mean/SD lot, nilai tetap disimpan dengan verdict 'unknown' — datanya
 * tidak hilang, tinggal dinilai setelah lotnya didaftarkan.
 */

const ATURAN = { TOLAK: 'out', PERINGATAN: 'warning', AMAN: 'in' };

// Rentang waktu yang dianggap satu run. Kontrol rendah dan tinggi dijalankan
// berurutan, jadi jendelanya tidak boleh terlalu sempit — tapi juga tidak boleh
// selebar sehari penuh, agar run pagi dan sore tidak tercampur.
const JENDELA_RUN_MENIT = 120;

/**
 * Nilai satu titik QC.
 *
 * @param {number} z          simpangan titik ini dalam satuan SD
 * @param {number[]} riwayatZ z titik sebelumnya pada LOT/LEVEL yang sama,
 *                            terbaru lebih dulu; titik sekarang tidak termasuk
 * @param {number[]} pasanganRunZ z titik level LAIN pada run yang sama
 */
export function nilaiWestgard(z, riwayatZ, pasanganRunZ = []) {
  if (z == null || isNaN(z)) return { verdict: 'unknown', rule: null };
  const abs = Math.abs(z);

  if (abs > 3) return { verdict: ATURAN.TOLAK, rule: '1-3s' };

  // Riwayat diurutkan dari yang terbaru; titik sekarang belum termasuk.
  const deret = [z, ...riwayatZ];

  // Pembanding untuk 2-2s dan R-4s: titik sebelumnya pada level yang sama,
  // DAN titik level lain pada run yang sama.
  const pembanding = [...(riwayatZ.length ? [riwayatZ[0]] : []), ...pasanganRunZ];

  if (abs > 2 && pembanding.some((v) => Math.abs(v) > 2 && Math.sign(v) === Math.sign(z))) {
    return { verdict: ATURAN.TOLAK, rule: '2-2s' };
  }

  if (pembanding.some((v) => Math.abs(z - v) > 4 && Math.sign(v) !== Math.sign(z))) {
    return { verdict: ATURAN.TOLAK, rule: 'R-4s' };
  }

  if (deret.length >= 4) {
    const empat = deret.slice(0, 4);
    if (empat.every((v) => v > 1) || empat.every((v) => v < -1)) {
      return { verdict: ATURAN.TOLAK, rule: '4-1s' };
    }
  }

  if (deret.length >= 10) {
    const sepuluh = deret.slice(0, 10);
    if (sepuluh.every((v) => v > 0) || sepuluh.every((v) => v < 0)) {
      return { verdict: ATURAN.TOLAK, rule: '10x' };
    }
  }

  if (abs > 2) return { verdict: ATURAN.PERINGATAN, rule: '1-2s' };
  return { verdict: ATURAN.AMAN, rule: null };
}

/**
 * Simpan satu berkas hasil QC dari alat.
 * @returns {Promise<number>} jumlah parameter yang tersimpan
 */
export async function simpanHasilQc(instrumentId, controlId, hasil) {
  if (!Array.isArray(hasil) || !hasil.length) return 0;
  let tersimpan = 0;

  for (const item of hasil) {
    if (!item?.test_code) continue;
    const nilai = parseFloat(item.value);
    if (isNaN(nilai)) continue;

    const [[map]] = await pool.query(
      'SELECT test_id FROM instrument_test_map WHERE instrument_id=? AND instrument_test_code=?',
      [instrumentId, item.test_code]
    ).catch(() => [[]]);
    let testId = map?.test_id ?? null;
    if (!testId) {
      const [[t]] = await pool.query('SELECT id FROM lab_tests WHERE code=?', [item.test_code]).catch(() => [[]]);
      testId = t?.id ?? null;
    }

    // Lot dicocokkan lewat nomor kontrol yang dikirim alat. Bila lab belum
    // mendaftarkan lotnya, nilainya tetap disimpan tanpa penilaian.
    const [[lot]] = await pool.query(
      `SELECT id, target_mean, target_sd, level FROM qc_lots
        WHERE instrument_id = ? AND test_id <=> ? AND is_active = 1
          AND (lot_no = ? OR lot_no IS NULL)
        ORDER BY lot_no IS NULL LIMIT 1`,
      [instrumentId, testId, controlId || null]
    ).catch(() => [[]]);

    let z = null;
    let verdict = 'unknown';
    let rule = null;

    if (lot?.target_sd && Number(lot.target_sd) > 0) {
      z = (nilai - Number(lot.target_mean)) / Number(lot.target_sd);
      const [riwayat] = await pool.query(
        `SELECT z_score FROM qc_results
          WHERE qc_lot_id = ? AND z_score IS NOT NULL
          ORDER BY measured_at DESC, id DESC LIMIT 12`,
        [lot.id]
      ).catch(() => [[]]);

      // Titik level LAIN pada run yang sama. Satu run diambil sebagai jendela
      // JENDELA_RUN_MENIT terakhir: kontrol rendah dan tinggi biasanya
      // dijalankan berurutan, bukan pada saat yang sama persis.
      const [pasangan] = await pool.query(
        `SELECT z_score FROM qc_results
          WHERE instrument_id = ? AND test_id <=> ? AND z_score IS NOT NULL
            AND (level IS NULL OR level <> ?)
            AND measured_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
          ORDER BY measured_at DESC LIMIT 4`,
        [instrumentId, testId, lot.level ?? '', JENDELA_RUN_MENIT]
      ).catch(() => [[]]);

      const putusan = nilaiWestgard(
        z,
        (riwayat || []).map((r) => Number(r.z_score)),
        (pasangan || []).map((r) => Number(r.z_score))
      );
      verdict = putusan.verdict;
      rule = putusan.rule;
    }

    await pool.query(
      `INSERT INTO qc_results (instrument_id, qc_lot_id, test_id, test_code, control_id, level, value, unit, z_score, verdict, rule_broken)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [instrumentId, lot?.id ?? null, testId, item.test_code, controlId || null, lot?.level ?? null,
       nilai, item.unit || null, z, verdict, rule]
    ).catch((e) => console.error('Gagal menyimpan QC:', e.message));
    tersimpan += 1;

    if (verdict === 'out') {
      console.warn(`[QC] ${item.test_code} melanggar ${rule} (z=${z?.toFixed(2)}) pada alat ${instrumentId}`);
    }
  }

  return tersimpan;
}

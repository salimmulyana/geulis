import pool from '../config/db.js';

/**
 * Pastikan satu kode pemeriksaan dari alat punya padanan di katalog tes.
 *
 * Alat mengirim kode miliknya sendiri (WBC, GRAN%, PLCR, ...) yang belum tentu
 * ada di katalog rumah sakit. Jalur hasil langsung dari alat sudah lama
 * mendaftarkannya otomatis, tetapi jalur pencocokan "Hasil Belum Cocok" tidak —
 * akibatnya parameter yang kodenya belum dikenal HILANG DIAM-DIAM saat hasil
 * dicocokkan. Fungsi ini menyatukan keduanya.
 *
 * @returns {Promise<number|null>} id tes, atau null bila tetap gagal
 */
export async function pastikanTes(instrumentId, item) {
  if (!item?.test_code) return null;

  const [[map]] = await pool.query(
    'SELECT test_id FROM instrument_test_map WHERE instrument_id = ? AND instrument_test_code = ?',
    [instrumentId, item.test_code]
  ).catch(() => [[]]);
  if (map?.test_id) return map.test_id;

  let [[tes]] = await pool.query('SELECT id FROM lab_tests WHERE code = ?', [item.test_code]).catch(() => [[]]);
  let testId = tes?.id ?? null;

  if (!testId) {
    try {
      const [baru] = await pool.query(
        'INSERT INTO lab_tests (code, name, unit) VALUES (?, ?, ?)',
        [item.test_code, item.test_code, item.unit || '']
      );
      testId = baru.insertId;
    } catch {
      // Balapan dengan proses lain yang mendaftarkan kode yang sama.
      const [[lagi]] = await pool.query('SELECT id FROM lab_tests WHERE code = ?', [item.test_code]).catch(() => [[]]);
      testId = lagi?.id ?? null;
    }
  }
  if (!testId) return null;

  if (instrumentId) {
    await pool.query(
      'INSERT INTO instrument_test_map (instrument_id, test_id, instrument_test_code) VALUES (?, ?, ?)',
      [instrumentId, testId, item.test_code]
    ).catch(() => {});
  }
  return testId;
}

/**
 * Cocokkan hasil yang tertahan di "Hasil Belum Cocok" lewat baris perintah.
 *
 * Dipakai untuk pemeliharaan, misalnya ketika perlu mencocokkan dari server
 * tanpa membuka aplikasi. Logikanya sengaja sama dengan endpoint
 * POST /api/unmatched/:id/match: flag dan delta check dihitung ulang memakai
 * identitas pasien yang benar, karena gender mempengaruhi nilai rujukan.
 *
 * Jalankan dari folder backend:
 *   node scripts/cocokkan-hasil.mjs                      -> daftar yang tertahan
 *   node scripts/cocokkan-hasil.mjs <id> --rm <no_rm>    -> lihat rencananya
 *   node scripts/cocokkan-hasil.mjs <id> --rm <no_rm> --terapkan
 *
 * Pasien harus sudah ada. Skrip ini sengaja TIDAK membuat pasien baru — itu
 * justru yang dulu menghasilkan pasien karangan.
 */
import 'dotenv/config';
import pool from '../src/config/db.js';
import { calcFlag } from '../src/services/flags.js';
import { hitungDelta } from '../src/services/deltaCheck.js';
import { pastikanTes } from '../src/services/pemetaanTes.js';

const arg = process.argv.slice(2);
const terapkan = arg.includes('--terapkan');
const id = arg.find((a) => /^\d+$/.test(a));
const rm = arg[arg.indexOf('--rm') + 1];

if (!id) {
  const [rows] = await pool.query(
    `SELECT u.id, u.sample_id, JSON_LENGTH(u.payload) AS parameter,
            JSON_UNQUOTE(JSON_EXTRACT(u.patient_info, '$.name')) AS nama_dari_alat,
            u.received_at
       FROM unmatched_results u WHERE u.status = 'pending' ORDER BY u.id`
  );
  console.log(rows.length ? 'Hasil yang tertahan:' : 'Tidak ada hasil yang tertahan.');
  console.table(rows);
  process.exit(0);
}

const [[baris]] = await pool.query("SELECT * FROM unmatched_results WHERE id = ? AND status = 'pending'", [id]);
if (!baris) {
  console.error(`Baris #${id} tidak ada atau sudah ditangani.`);
  process.exit(1);
}
if (!rm) {
  console.error('Sebutkan pasiennya dengan --rm <nomor rekam medis>.');
  process.exit(1);
}

const [[pasien]] = await pool.query('SELECT id, name, gender FROM patients WHERE medical_record_no = ?', [rm]);
if (!pasien) {
  console.error(`Pasien dengan nomor rekam medis ${rm} tidak ada. Daftarkan dulu lewat aplikasi.`);
  process.exit(1);
}

const payload = typeof baris.payload === 'string' ? JSON.parse(baris.payload) : baris.payload || [];
console.log(`Sampel ${baris.sample_id} (${payload.length} parameter) -> ${pasien.name} (RM ${rm})`);

let siap = 0;
const rencana = [];
for (const item of payload) {
  if (!item?.test_code) continue;
  // Saat --terapkan, kode yang belum dikenal ikut didaftarkan ke katalog;
  // saat pratinjau, hanya dilihat tanpa mengubah apa pun.
  let testId = null;
  if (terapkan) {
    testId = await pastikanTes(baris.instrument_id, item);
  } else {
    const [[map]] = await pool.query(
      'SELECT test_id FROM instrument_test_map WHERE instrument_id = ? AND instrument_test_code = ?',
      [baris.instrument_id, item.test_code]
    ).catch(() => [[]]);
    testId = map?.test_id ?? null;
    if (!testId) {
      const [[t]] = await pool.query('SELECT id FROM lab_tests WHERE code = ?', [item.test_code]).catch(() => [[]]);
      testId = t?.id ?? null;
    }
    if (!testId) {
      rencana.push(`  ${item.test_code}=${item.value}  (kode baru, akan didaftarkan saat --terapkan)`);
      siap += 1;
      continue;
    }
  }
  if (!testId) {
    rencana.push(`  ${item.test_code}=${item.value}  (dilewati: kode tes gagal didaftarkan)`);
    continue;
  }
  const [[test]] = await pool.query('SELECT * FROM lab_tests WHERE id = ?', [testId]);
  const flag = calcFlag(item.value, test, pasien.gender);
  const delta = await hitungDelta(pasien.id, testId, item.value, test?.code, test?.delta_limit_percent);
  rencana.push(`  ${item.test_code}=${item.value} ${item.unit || ''} -> ${flag}${delta?.flag === 'check' ? ` (delta ${delta.percent}%)` : ''}`);
  siap += 1;

  if (terapkan) {
    const numeric = parseFloat(item.value);
    await pool.query(
      `INSERT INTO lab_results (patient_id, test_id, result_value, result_numeric, unit, flag,
                                instrument_id, raw_message, status, delta_percent, delta_flag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preliminary', ?, ?)`,
      [pasien.id, testId, item.value, isNaN(numeric) ? null : numeric, item.unit || test?.unit || '',
       flag, baris.instrument_id, String(baris.raw_message || '').slice(0, 5000),
       delta?.percent ?? null, delta?.flag ?? 'none']
    );
  }
}

console.log(rencana.join('\n'));
console.log(`${siap} parameter siap dicatat.`);

if (terapkan) {
  await pool.query(
    `UPDATE unmatched_results SET status = 'matched', matched_patient_id = ?, handled_at = NOW(),
            note = CONCAT(COALESCE(note, ''), ' [dicocokkan lewat skrip pemeliharaan]')
      WHERE id = ?`,
    [pasien.id, baris.id]
  );
  console.log(`Tersimpan atas nama ${pasien.name}.`);
} else {
  console.log('Belum disimpan. Tambahkan --terapkan untuk menyimpan.');
}

await pool.end();

/**
 * Hitung ulang flag hasil lab yang sudah tersimpan.
 *
 * Flag dihitung sekali saat hasil masuk. Kalau nilai rujukan atau nilai kritis
 * baru diisi belakangan, hasil lama tetap memakai flag lamanya — di RS Santa
 * Familia itu berarti HCT 22% dan PLT 53 tersimpan sebagai "normal".
 *
 * Jalankan dari folder backend:
 *   node scripts/hitung-ulang-flag.mjs            -> hanya melaporkan
 *   node scripts/hitung-ulang-flag.mjs --terapkan -> menyimpan perubahan
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { calcFlag } from '../src/services/flags.js';

const terapkan = process.argv.includes('--terapkan');

const db = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const [baris] = await db.query(`
  SELECT r.id, r.result_value, r.flag AS flag_lama, p.gender, p.name AS pasien,
         t.code, t.reference_min, t.reference_max,
         t.reference_min_l, t.reference_max_l, t.reference_min_p, t.reference_max_p,
         t.critical_min, t.critical_max
    FROM lab_results r
    JOIN lab_tests t ON t.id = r.test_id
    LEFT JOIN patients p ON p.id = r.patient_id
   ORDER BY r.id`);

const berubah = [];
for (const b of baris) {
  // Hanya angka yang bisa dinilai; hasil teks dibiarkan apa adanya.
  if (isNaN(parseFloat(b.result_value))) continue;
  const baru = calcFlag(b.result_value, b, b.gender);
  if (baru !== b.flag_lama) berubah.push({ ...b, flag_baru: baru });
}

console.log(`${baris.length} hasil diperiksa, ${berubah.length} berubah flag-nya`);
const penting = berubah.filter((b) => b.flag_baru === 'critical');
for (const b of berubah.slice(0, 40)) {
  console.log(`  #${b.id} ${b.pasien || '-'} ${b.code}=${b.result_value}  ${b.flag_lama} -> ${b.flag_baru}`);
}
if (berubah.length > 40) console.log(`  ... dan ${berubah.length - 40} lagi`);
if (penting.length) console.log(`\n⚠ ${penting.length} hasil menjadi KRITIS dan perlu ditindaklanjuti petugas`);

if (terapkan && berubah.length) {
  for (const b of berubah) {
    await db.query('UPDATE lab_results SET flag = ? WHERE id = ?', [b.flag_baru, b.id]);
  }
  console.log(`\n${berubah.length} baris disimpan.`);
} else if (berubah.length) {
  console.log('\nBelum disimpan. Tambahkan --terapkan untuk menyimpan.');
}

await db.end();

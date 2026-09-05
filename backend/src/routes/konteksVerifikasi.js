import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { umurHari } from '../services/rujukanUmur.js';

const router = Router();

/**
 * Segala yang perlu dilihat verifikator dalam SATU panggilan.
 *
 * Sebelum ini, memverifikasi berarti melihat daftar angka. Angka saja tidak
 * cukup untuk memutuskan: hemoglobin 9 pada pasien pascaoperasi adalah temuan
 * yang diharapkan, sedangkan pada pemeriksaan rutin adalah temuan yang perlu
 * ditelusuri. Verifikator yang harus membuka tiga layar untuk tahu bedanya akan
 * berhenti membukanya sekitar lembar kesepuluh.
 *
 * Karena itu semuanya digabung: identitas dan umur, pertanyaan klinisnya, nilai
 * sekarang, tiga hasil sebelumnya, dan selisihnya.
 */

/** Ubah umur hari menjadi kalimat yang terbaca. */
function teksUmur(hari) {
  if (hari == null) return null;
  if (hari < 31) return `${hari} hari`;
  if (hari < 365) return `${Math.floor(hari / 30)} bulan`;
  const th = Math.floor(hari / 365);
  const bl = Math.floor((hari % 365) / 30);
  return bl > 0 ? `${th} tahun ${bl} bulan` : `${th} tahun`;
}

router.get('/:requestId', authenticate, async (req, res) => {
  const requestId = req.params.requestId;

  const [[permintaan]] = await pool.query(
    `SELECT r.id, r.request_no, r.priority, r.status, r.requested_at, r.collected_at,
            r.received_at, r.clinician_name, r.clinician_unit, r.specimen_type,
            r.specimen_note, r.diagnosa_klinis, r.notes,
            p.id AS patient_id, p.name AS patient_name, p.medical_record_no,
            p.birth_date, p.gender
       FROM lab_requests r
       JOIN patients p ON p.id = r.patient_id
      WHERE r.id = ?`,
    [requestId]
  );
  if (!permintaan) return res.status(404).json({ error: 'Permintaan tidak ditemukan' });

  // Umur dihitung pada saat PENGAMBILAN sampel, bukan saat layar dibuka.
  // Bedanya baru terasa pada neonatus — dan justru di sanalah rujukan paling
  // berbeda, sehingga selisih beberapa hari mengubah penilaian.
  const acuan = permintaan.collected_at || permintaan.requested_at || new Date();
  const uh = umurHari(permintaan.birth_date, new Date(acuan));

  const [hasil] = await pool.query(
    `SELECT res.id, res.test_id, res.result_value, res.result_numeric, res.unit, res.flag,
            res.status, res.result_at, res.verified_at, res.authorized_at,
            res.ref_min_dipakai, res.ref_max_dipakai, res.rujukan_label,
            res.delta_percent, res.delta_flag,
            res.critical_ack, res.critical_reported_to, res.critical_reported_at,
            t.code AS test_code, t.name AS test_name, t.sort_order
       FROM lab_results res
       JOIN lab_tests t ON t.id = res.test_id
      WHERE res.request_id = ?
      ORDER BY t.sort_order, t.code`,
    [requestId]
  ).catch(async () => {
    // critical_reported_at belum tentu ada pada pemasangan lama.
    const [r] = await pool.query(
      `SELECT res.id, res.test_id, res.result_value, res.result_numeric, res.unit, res.flag,
              res.status, res.result_at, res.verified_at, res.authorized_at,
              res.ref_min_dipakai, res.ref_max_dipakai, res.rujukan_label,
              res.delta_percent, res.delta_flag, res.critical_ack,
              t.code AS test_code, t.name AS test_name, t.sort_order
         FROM lab_results res
         JOIN lab_tests t ON t.id = res.test_id
        WHERE res.request_id = ?
        ORDER BY t.sort_order, t.code`,
      [requestId]
    );
    return [r];
  });

  // Riwayat diambil sekali untuk semua pemeriksaan, bukan satu kueri per baris.
  // Lembar hematologi lengkap berisi dua puluh parameter; dua puluh perjalanan
  // ke basis data membuat layar verifikasi terasa lambat justru saat sedang
  // dipakai paling sering.
  const testIds = hasil.map((h) => h.test_id);
  let riwayat = [];
  if (testIds.length) {
    const [rows] = await pool.query(
      `SELECT test_id, result_value, result_numeric, unit, flag, result_at
         FROM lab_results
        WHERE patient_id = ? AND test_id IN (?) AND (request_id <> ? OR request_id IS NULL)
        ORDER BY result_at DESC`,
      [permintaan.patient_id, testIds, requestId]
    );
    riwayat = rows;
  }

  const perTest = new Map();
  for (const r of riwayat) {
    const arr = perTest.get(r.test_id) || [];
    if (arr.length < 3) arr.push(r);
    perTest.set(r.test_id, arr);
  }

  const daftar = hasil.map((h) => {
    const lalu = perTest.get(h.test_id) || [];
    const sebelumnya = lalu[0];
    let selisih = null;
    if (
      sebelumnya?.result_numeric != null &&
      h.result_numeric != null &&
      Number(sebelumnya.result_numeric) !== 0
    ) {
      const a = Number(sebelumnya.result_numeric);
      const b = Number(h.result_numeric);
      selisih = {
        nilai_lalu: a,
        beda: Number((b - a).toFixed(4)),
        persen: Number((((b - a) / Math.abs(a)) * 100).toFixed(1)),
        pada: sebelumnya.result_at,
      };
    }
    return { ...h, riwayat: lalu, selisih };
  });

  const perluDilihat = daftar.filter(
    (d) => d.flag === 'critical' || d.flag === 'abnormal' || d.delta_flag === 'check'
  );

  res.json({
    permintaan: {
      ...permintaan,
      umur_hari: uh,
      umur_teks: teksUmur(uh),
      umur_dihitung_pada: acuan,
    },
    hasil: daftar,
    ringkasan: {
      total: daftar.length,
      belum_verifikasi: daftar.filter((d) => d.status !== 'final').length,
      sudah_disahkan: daftar.filter((d) => d.authorized_at != null).length,
      kritis_belum_dilaporkan: daftar.filter((d) => d.flag === 'critical' && !d.critical_ack).length,
      // Daftar terpisah, bukan sekadar jumlah. Verifikator perlu tahu MANA yang
      // harus dilihat, bukan bahwa "ada tiga yang perlu dilihat".
      perlu_dilihat: perluDilihat.map((d) => ({
        test_code: d.test_code,
        test_name: d.test_name,
        result_value: d.result_value,
        flag: d.flag,
        delta_flag: d.delta_flag,
      })),
    },
  });
});

export default router;

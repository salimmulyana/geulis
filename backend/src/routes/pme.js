import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

/**
 * Pemantapan Mutu Eksternal (PME).
 *
 * Kewajiban PMK 411/2010 Pasal 6 huruf a: laboratorium klinik wajib
 * melaksanakan pemantapan mutu internal DAN mengikuti pemantapan mutu eksternal
 * yang diakui pemerintah.
 *
 * Berbeda dari QC harian yang datanya datang sendiri dari alat, PME dijalankan
 * penyelenggara luar: lab menerima bahan uji, memeriksanya, mengirim hasil, lalu
 * menerima penilaian. Yang disimpan di sini adalah keikutsertaan dan hasilnya,
 * supaya bukti keikutsertaan tidak tercecer di berkas kertas saat asesmen.
 */

/**
 * SDI (standard deviation index) = simpangan hasil kita dari nilai konsensus,
 * dalam satuan SD kelompok peserta. Penafsiran yang lazim dipakai:
 *   |SDI| <= 2  baik
 *   2 < |SDI| <= 3  ragu, perlu ditelaah
 *   |SDI| > 3  buruk, perlu tindakan perbaikan
 */
export function nilaiSdi(ourValue, targetValue, targetSd) {
  // Diperiksa sebelum dikonversi: Number(null) dan Number('') menghasilkan 0,
  // bukan NaN, sehingga nilai konsensus yang belum diisi akan dihitung sebagai
  // nol dan melahirkan vonis "buruk" yang palsu.
  const kosong = (v) => v == null || v === '' || isNaN(Number(v));
  if (kosong(ourValue) || kosong(targetValue) || kosong(targetSd)) {
    return { z: null, verdict: 'belum' };
  }
  const a = Number(ourValue);
  const b = Number(targetValue);
  const sd = Number(targetSd);
  if (sd <= 0) return { z: null, verdict: 'belum' };
  const z = (a - b) / sd;
  const abs = Math.abs(z);
  const verdict = abs <= 2 ? 'baik' : abs <= 3 ? 'ragu' : 'buruk';
  return { z: Number(z.toFixed(3)), verdict };
}

router.get('/programs', authenticate, requirePermission('instruments.view'), async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT p.*,
            (SELECT COUNT(*) FROM pme_results r WHERE r.program_id = p.id) AS jumlah_hasil,
            (SELECT COUNT(*) FROM pme_results r WHERE r.program_id = p.id AND r.verdict = 'buruk') AS jumlah_buruk
       FROM pme_programs p
      ORDER BY p.is_active DESC, p.period_start DESC, p.id DESC`
  );
  res.json(rows);
});

router.post('/programs', authenticate, requirePermission('instruments.manage'), async (req, res) => {
  const { name, organizer, cycle, period_start, period_end, note } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nama program wajib diisi' });
  const [r] = await pool.query(
    `INSERT INTO pme_programs (name, organizer, cycle, period_start, period_end, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, organizer || null, cycle || null, period_start || null, period_end || null, note || null]
  );
  await audit(req, 'CREATE', 'pme_program', r.insertId, { name, organizer, cycle });
  res.json({ ok: true, id: r.insertId });
});

router.patch('/programs/:id', authenticate, requirePermission('instruments.manage'), async (req, res) => {
  const { name, organizer, cycle, period_start, period_end, is_active, note } = req.body || {};
  await pool.query(
    `UPDATE pme_programs
        SET name = COALESCE(?, name), organizer = COALESCE(?, organizer),
            cycle = COALESCE(?, cycle), period_start = COALESCE(?, period_start),
            period_end = COALESCE(?, period_end), is_active = COALESCE(?, is_active),
            note = COALESCE(?, note)
      WHERE id = ?`,
    [name ?? null, organizer ?? null, cycle ?? null, period_start || null, period_end || null,
     is_active ?? null, note ?? null, req.params.id]
  );
  await audit(req, 'UPDATE', 'pme_program', req.params.id, req.body);
  res.json({ ok: true });
});

router.get('/results', authenticate, requirePermission('instruments.view'), async (req, res) => {
  const { program_id } = req.query;
  const [rows] = await pool.query(
    `SELECT r.*, t.name AS test_name, p.name AS program_name, p.cycle
       FROM pme_results r
       LEFT JOIN lab_tests t ON t.id = r.test_id
       LEFT JOIN pme_programs p ON p.id = r.program_id
      WHERE (? IS NULL OR r.program_id = ?)
      ORDER BY r.reported_at DESC, r.id DESC LIMIT 500`,
    [program_id || null, program_id || null]
  );
  res.json(rows);
});

router.post('/results', authenticate, requirePermission('instruments.manage'), async (req, res) => {
  const { program_id, test_id, test_code, sample_code, our_value, target_value, target_sd, reported_at, note } =
    req.body || {};
  if (!program_id) return res.status(400).json({ error: 'Program PME wajib dipilih' });
  if (!test_id && !test_code) return res.status(400).json({ error: 'Pemeriksaan wajib diisi' });

  const { z, verdict } = nilaiSdi(our_value, target_value, target_sd);
  const [r] = await pool.query(
    `INSERT INTO pme_results
       (program_id, test_id, test_code, sample_code, our_value, target_value, target_sd, z_score, verdict, reported_at, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [program_id, test_id || null, test_code || null, sample_code || null,
     our_value ?? null, target_value ?? null, target_sd ?? null, z, verdict, reported_at || null, note || null]
  );
  await audit(req, 'CREATE', 'pme_result', r.insertId, { program_id, test_code, verdict });
  res.json({ ok: true, id: r.insertId, z_score: z, verdict });
});

router.delete('/results/:id', authenticate, requirePermission('instruments.manage'), async (req, res) => {
  await pool.query('DELETE FROM pme_results WHERE id = ?', [req.params.id]);
  await audit(req, 'DELETE', 'pme_result', req.params.id);
  res.json({ ok: true });
});

export default router;

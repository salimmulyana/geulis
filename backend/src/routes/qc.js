import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

/** Lot bahan kontrol: mean dan SD dari sisipan botol, diisi lab. */
router.get('/lots', authenticate, requirePermission('instruments.view'), async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT l.*, i.code AS instrument_code, t.code AS test_code, t.name AS test_name
       FROM qc_lots l
       LEFT JOIN instruments i ON i.id = l.instrument_id
       LEFT JOIN lab_tests t ON t.id = l.test_id
      ORDER BY l.is_active DESC, l.id DESC`
  );
  res.json(rows);
});

router.post('/lots', authenticate, requirePermission('instruments.manage'), async (req, res) => {
  const { instrument_id, test_id, level, lot_no, target_mean, target_sd, expires_on } = req.body || {};
  if (!instrument_id || !test_id || !level) {
    return res.status(400).json({ error: 'Alat, pemeriksaan, dan level wajib diisi' });
  }
  if (target_sd != null && Number(target_sd) <= 0) {
    return res.status(400).json({ error: 'SD harus lebih besar dari nol' });
  }
  const [r] = await pool.query(
    `INSERT INTO qc_lots (instrument_id, test_id, level, lot_no, target_mean, target_sd, expires_on)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE target_mean = VALUES(target_mean), target_sd = VALUES(target_sd),
                             expires_on = VALUES(expires_on), is_active = 1`,
    [instrument_id, test_id, level, lot_no || null, target_mean ?? null, target_sd ?? null, expires_on || null]
  );
  await audit(req, 'CREATE', 'qc_lot', r.insertId, { instrument_id, test_id, level, lot_no });
  res.json({ ok: true, id: r.insertId });
});

router.patch('/lots/:id', authenticate, requirePermission('instruments.manage'), async (req, res) => {
  const { target_mean, target_sd, expires_on, is_active } = req.body || {};
  await pool.query(
    `UPDATE qc_lots SET target_mean = COALESCE(?, target_mean), target_sd = COALESCE(?, target_sd),
                        expires_on = COALESCE(?, expires_on), is_active = COALESCE(?, is_active)
      WHERE id = ?`,
    [target_mean ?? null, target_sd ?? null, expires_on || null, is_active ?? null, req.params.id]
  );
  await audit(req, 'UPDATE', 'qc_lot', req.params.id, req.body);
  res.json({ ok: true });
});

/** Ringkasan untuk dashboard QC: berapa yang keluar batas hari ini. */
router.get('/summary', authenticate, requirePermission('instruments.view'), async (_req, res) => {
  const [[hariIni]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(verdict = 'out') AS keluar,
            SUM(verdict = 'warning') AS peringatan,
            SUM(verdict = 'unknown') AS belum_dinilai
       FROM qc_results WHERE DATE(measured_at) = CURDATE()`
  );
  const [terakhir] = await pool.query(
    `SELECT q.id, q.test_code, q.value, q.z_score, q.verdict, q.rule_broken, q.measured_at, q.level,
            i.code AS instrument_code
       FROM qc_results q
       LEFT JOIN instruments i ON i.id = q.instrument_id
      WHERE q.verdict IN ('out','warning')
      ORDER BY q.measured_at DESC LIMIT 20`
  );
  res.json({ hari_ini: hariIni, pelanggaran_terakhir: terakhir });
});

/**
 * Titik-titik untuk grafik Levey-Jennings.
 * Dikembalikan urut waktu naik supaya bisa langsung digambar.
 */
router.get('/chart', authenticate, requirePermission('instruments.view'), async (req, res) => {
  const { instrument_id, test_id, level, hari } = req.query;
  if (!instrument_id || !test_id) {
    return res.status(400).json({ error: 'instrument_id dan test_id wajib diisi' });
  }
  const rentang = Math.min(Number(hari) || 30, 180);
  const [rows] = await pool.query(
    `SELECT q.id, q.value, q.z_score, q.verdict, q.rule_broken, q.measured_at, q.level,
            l.target_mean, l.target_sd, l.lot_no
       FROM qc_results q
       LEFT JOIN qc_lots l ON l.id = q.qc_lot_id
      WHERE q.instrument_id = ? AND q.test_id = ?
        AND (? IS NULL OR q.level = ?)
        AND q.measured_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY q.measured_at ASC`,
    [instrument_id, test_id, level || null, level || null, rentang]
  );
  res.json(rows);
});

router.get('/', authenticate, requirePermission('instruments.view'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT q.*, i.code AS instrument_code, t.name AS test_name
       FROM qc_results q
       LEFT JOIN instruments i ON i.id = q.instrument_id
       LEFT JOIN lab_tests t ON t.id = q.test_id
      ORDER BY q.measured_at DESC LIMIT 200`
  );
  res.json(rows);
});

export default router;

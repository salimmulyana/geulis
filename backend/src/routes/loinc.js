import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { periksaLoinc, USULAN_LOINC } from '../services/loinc.js';

const router = Router();

/**
 * Pemetaan kode LOINC, berikut laporan kesiapan SATUSEHAT.
 *
 * Bagian yang paling berguna bukan penyimpanannya, melainkan daftar pemeriksaan
 * yang BELUM punya kode. Itu yang menentukan apakah pengiriman ke SATUSEHAT bisa
 * dimulai — dan tanpa daftar itu, kesiapan hanya bisa ditebak.
 */

router.get('/', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, code, name, unit, loinc_code, loinc_name, is_active
       FROM lab_tests ORDER BY sort_order, code`
  );

  const daftar = rows.map((t) => {
    const usul = USULAN_LOINC[String(t.code || '').toUpperCase()];
    return {
      ...t,
      // Usulan hanya ditampilkan, TIDAK pernah diterapkan sendiri. Nama yang
      // mirip sering menunjuk pemeriksaan dengan spesimen atau metode berbeda,
      // dan kode yang terisi otomatis akan dianggap sudah diperiksa manusia.
      usulan: !t.loinc_code && usul ? usul : null,
    };
  });

  const aktif = daftar.filter((t) => t.is_active);
  res.json({
    kesiapan: {
      total_aktif: aktif.length,
      sudah_dipetakan: aktif.filter((t) => t.loinc_code).length,
      belum_dipetakan: aktif.filter((t) => !t.loinc_code).length,
      punya_usulan: aktif.filter((t) => !t.loinc_code && t.usulan).length,
    },
    daftar,
  });
});

router.put('/:testId', authenticate, async (req, res) => {
  const { loinc_code, loinc_name } = req.body || {};

  if (loinc_code === '' || loinc_code == null) {
    await pool.query('UPDATE lab_tests SET loinc_code=NULL, loinc_name=NULL WHERE id=?', [req.params.testId]);
    await audit(req, 'UPDATE', 'loinc', req.params.testId, { dikosongkan: true });
    return res.json({ ok: true });
  }

  const h = periksaLoinc(loinc_code);
  if (!h.sah) return res.status(400).json({ error: h.alasan });

  // Satu kode LOINC dipakai dua pemeriksaan berbeda hampir selalu berarti salah
  // satunya keliru. Tidak ditolak — panel yang sama bisa muncul dua kali dengan
  // sengaja — tetapi diberitahukan, karena diam-diam membiarkannya membuat dua
  // hasil berbeda terkirim sebagai pemeriksaan yang sama.
  const [[kembar]] = await pool.query(
    'SELECT code, name FROM lab_tests WHERE loinc_code = ? AND id <> ? LIMIT 1',
    [h.kode, req.params.testId]
  );

  await pool.query('UPDATE lab_tests SET loinc_code=?, loinc_name=? WHERE id=?', [
    h.kode,
    loinc_name || null,
    req.params.testId,
  ]);
  await audit(req, 'UPDATE', 'loinc', req.params.testId, { loinc_code: h.kode });

  res.json({
    ok: true,
    peringatan: kembar
      ? `Kode ${h.kode} juga dipakai oleh ${kembar.code} — ${kembar.name}. Pastikan itu memang disengaja.`
      : null,
  });
});

export default router;

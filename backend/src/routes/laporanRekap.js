import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Rentang wajib & berbawaan hari ini: laporan tanpa batas pada tabel hasil yang
// tumbuh terus makin lambat sampai time out.
router.get('/', authenticate, async (req, res) => {
  const hari = new Date().toISOString().slice(0,10);
  const dari = req.query.dari || hari, sampai = req.query.sampai || hari;
  let sql;
  switch (req.query.jenis) {
    case 'per_parameter':
      sql = `SELECT t.code AS kode, t.name AS pemeriksaan, COUNT(*) AS jumlah
               FROM lab_results res JOIN lab_tests t ON t.id=res.test_id
              WHERE DATE(res.result_at) BETWEEN ? AND ? GROUP BY t.id ORDER BY jumlah DESC`; break;
    case 'per_ruang':
      sql = `SELECT COALESCE(NULLIF(clinician_unit,''),'(tidak dicatat)') AS ruang, COUNT(*) AS jumlah
               FROM lab_requests WHERE DATE(requested_at) BETWEEN ? AND ? GROUP BY ruang ORDER BY jumlah DESC`; break;
    case 'per_hari':
      sql = `SELECT DATE(requested_at) AS tanggal, COUNT(*) AS permintaan, COUNT(DISTINCT patient_id) AS pasien
               FROM lab_requests WHERE DATE(requested_at) BETWEEN ? AND ? GROUP BY tanggal ORDER BY tanggal`; break;
    default:
      return res.status(400).json({ error: 'jenis laporan tidak dikenal (per_parameter, per_ruang, per_hari)' });
  }
  const [baris] = await pool.query(sql, [dari, sampai]);
  res.json({ jenis: req.query.jenis, dari, sampai, baris });
});

export default router;

import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Data grafik dashboard; galat per-grafik dikembalikan kosong agar satu yang
// gagal tidak mengosongkan seluruh dashboard.
async function q(sql) { try { const [r] = await pool.query(sql); return r; } catch { return []; } }

router.get('/', authenticate, async (req, res) => {
  const [belum, perJam, tat, perPrioritas, kritis] = await Promise.all([
    q(`SELECT t.name AS label, COUNT(*) AS jumlah FROM lab_request_items i JOIN lab_tests t ON t.id=i.test_id WHERE i.status IN ('pending','processing') GROUP BY t.id ORDER BY jumlah DESC LIMIT 10`),
    q(`SELECT DATE_FORMAT(requested_at,'%H') AS jam, COUNT(*) AS jumlah FROM lab_requests WHERE DATE(requested_at)=CURDATE() GROUP BY jam ORDER BY jam`),
    q(`SELECT ember AS label, COUNT(*) AS jumlah FROM (
         SELECT CASE WHEN m<=30 THEN '0-30 menit' WHEN m<=60 THEN '31-60 menit' WHEN m<=120 THEN '61-120 menit' ELSE '> 120 menit' END AS ember
           FROM (SELECT TIMESTAMPDIFF(MINUTE, r.requested_at, res.verified_at) AS m
                   FROM lab_results res JOIN lab_requests r ON r.id=res.request_id
                  WHERE DATE(res.verified_at)=CURDATE() AND res.verified_at IS NOT NULL AND res.verified_at>=r.requested_at) x
       ) y GROUP BY ember`),
    q(`SELECT COALESCE(priority,'normal') AS label, COUNT(*) AS jumlah FROM lab_requests WHERE DATE(requested_at)=CURDATE() GROUP BY label ORDER BY jumlah DESC`),
    q(`SELECT p.name AS pasien, p.medical_record_no AS no_rm, t.name AS pemeriksaan, res.result_value AS nilai, res.unit
         FROM lab_results res JOIN lab_tests t ON t.id=res.test_id JOIN patients p ON p.id=res.patient_id
        WHERE res.flag='critical' AND res.critical_ack=0 ORDER BY res.verified_at LIMIT 20`),
  ]);
  res.json({ belum_selesai: belum, per_jam: perJam, tat, per_prioritas: perPrioritas, kritis });
});
export default router;

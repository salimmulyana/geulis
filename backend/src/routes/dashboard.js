import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();

router.get('/stats', authenticate, requirePermission('dashboard.view'), async (req, res) => {
  const [[pending]] = await pool.query(
    "SELECT COUNT(*) AS c FROM lab_requests WHERE status IN ('pending','collected','processing')"
  );
  const [[todayReq]] = await pool.query(
    'SELECT COUNT(*) AS c FROM lab_requests WHERE DATE(requested_at) = CURDATE()'
  );
  const [[todayRes]] = await pool.query(
    'SELECT COUNT(*) AS c FROM lab_results WHERE DATE(result_at) = CURDATE()'
  );
  const [[patients]] = await pool.query('SELECT COUNT(*) AS c FROM patients');
  const [instruments] = await pool.query(
    'SELECT id, code, name, is_active, last_connected, port FROM instruments ORDER BY name'
  );
  const [recentRequests] = await pool.query(
    `SELECT lr.id, lr.request_no, lr.status, lr.priority, lr.requested_at,
            p.name AS patient_name, p.medical_record_no
     FROM lab_requests lr
     JOIN patients p ON p.id = lr.patient_id
     ORDER BY lr.requested_at DESC LIMIT 10`
  );
  const [criticalResults] = await pool.query(
    `SELECT lr.id, lt.name AS test_name, lr.result_value, lr.flag, p.name AS patient_name
     FROM lab_results lr
     JOIN lab_tests lt ON lt.id = lr.test_id
     JOIN patients p ON p.id = lr.patient_id
     WHERE lr.flag IN ('critical','high','low')
     ORDER BY lr.result_at DESC LIMIT 5`
  );
  // Alat yang diam.
  //
  // Kalau kabel LAN lepas atau "Auto Communicate" mati di alat, gejalanya cuma
  // hasil tidak muncul — dan biasanya baru ketahuan setelah ada yang mengeluh.
  // Ambang 4 jam dipilih supaya jeda wajar antar-batch tidak ikut berbunyi.
  const [alatDiam] = await pool.query(
    `SELECT id, code, name, last_connected,
            TIMESTAMPDIFF(MINUTE, last_connected, NOW()) AS diam_menit
       FROM instruments
      WHERE is_active = 1
        AND (last_connected IS NULL OR last_connected < DATE_SUB(NOW(), INTERVAL 4 HOUR))
      ORDER BY last_connected IS NULL DESC, last_connected ASC`
  ).catch(() => [[]]);

  const [[belumCocok]] = await pool.query(
    "SELECT COUNT(*) AS c FROM unmatched_results WHERE status = 'pending'"
  ).catch(() => [[{ c: 0 }]]);

  const [[qcHariIni]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(verdict = 'out') AS keluar
       FROM qc_results WHERE DATE(measured_at) = CURDATE()`
  ).catch(() => [[{ total: 0, keluar: 0 }]]);

  res.json({
    stats: {
      pendingRequests: pending.c,
      todayRequests: todayReq.c,
      todayResults: todayRes.c,
      totalPatients: patients.c,
      hasilBelumCocok: belumCocok?.c || 0,
      qcKeluarBatas: Number(qcHariIni?.keluar || 0),
      qcHariIni: Number(qcHariIni?.total || 0),
    },
    instruments,
    alatDiam,
    recentRequests,
    criticalResults,
  });
});

export default router;

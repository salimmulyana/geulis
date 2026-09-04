import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

function genRequestNo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `REQ${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${Date.now().toString().slice(-6)}`;
}

router.get('/', authenticate, requirePermission('requests.view'), async (req, res) => {
  const status = req.query.status;
  const date = req.query.date;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;
  const q = req.query.q || '';
  
  let sql = `SELECT lr.*, p.name AS patient_name, p.medical_record_no, u.full_name AS requested_by_name
             FROM lab_requests lr
             JOIN patients p ON p.id = lr.patient_id
             LEFT JOIN users u ON u.id = lr.requested_by`;
  const params = [];
  const conditions = [];

  if (q) {
    conditions.push('(p.name LIKE ? OR p.medical_record_no LIKE ? OR lr.request_no LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  
  if (status) {
    conditions.push('lr.status = ?');
    params.push(status);
  }
  
  if (startDate && endDate) {
    conditions.push('DATE(lr.requested_at) BETWEEN ? AND ?');
    params.push(startDate, endDate);
  } else if (date) {
    conditions.push('DATE(lr.requested_at) = ?');
    params.push(date);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ' ORDER BY lr.requested_at DESC LIMIT 200';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.get('/:id', authenticate, requirePermission('requests.view'), async (req, res) => {
  const [reqs] = await pool.query(
    `SELECT lr.*, p.name AS patient_name, p.medical_record_no
     FROM lab_requests lr JOIN patients p ON p.id = lr.patient_id WHERE lr.id = ?`,
    [req.params.id]
  );
  if (!reqs[0]) return res.status(404).json({ error: 'Permintaan tidak ditemukan' });
  const [items] = await pool.query(
    `SELECT lri.*, lt.code AS test_code, lt.name AS test_name,
            res.id AS result_id, res.result_value, res.is_printable
     FROM lab_request_items lri 
     JOIN lab_requests lr ON lr.id = lri.request_id
     JOIN lab_tests lt ON lt.id = lri.test_id
     LEFT JOIN lab_results res ON res.test_id = lt.id 
                              AND res.patient_id = lr.patient_id 
                              AND DATE(res.result_at) = DATE(lr.requested_at)
     WHERE lri.request_id = ?
     ORDER BY lt.sort_order ASC, lt.code ASC`,
    [req.params.id]
  );
  res.json({ ...reqs[0], items });
});

router.post('/', authenticate, requirePermission('requests.manage'), async (req, res) => {
  const { patient_id, test_ids, priority, notes, simrs_order_id } = req.body;
  const request_no = genRequestNo();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO lab_requests (request_no, patient_id, simrs_order_id, priority, notes, requested_by, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [request_no, patient_id, simrs_order_id || null, priority || 'normal', notes, req.user.id]
    );
    const requestId = r.insertId;
    for (const testId of test_ids || []) {
      await conn.query(
        'INSERT INTO lab_request_items (request_id, test_id) VALUES (?, ?)',
        [requestId, testId]
      );
    }
    await conn.commit();
    await audit(req, 'CREATE', 'request', requestId, { request_no, patient_id, tests: (test_ids || []).length });
    const [rows] = await pool.query('SELECT * FROM lab_requests WHERE id = ?', [requestId]);
    res.status(201).json(rows[0]);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.put('/:id', authenticate, requirePermission('requests.manage'), async (req, res) => {
  const { test_ids, priority, notes, simrs_order_id } = req.body;
  const requestId = req.params.id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE lab_requests SET simrs_order_id=?, priority=?, notes=? WHERE id=?`,
      [simrs_order_id || null, priority || 'normal', notes, requestId]
    );
    await conn.query('DELETE FROM lab_request_items WHERE request_id=?', [requestId]);
    for (const testId of test_ids || []) {
      await conn.query('INSERT INTO lab_request_items (request_id, test_id) VALUES (?, ?)', [requestId, testId]);
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.patch('/:id/status', authenticate, requirePermission('requests.manage'), async (req, res) => {
  const { status } = req.body;
  const extra = status === 'collected' ? ', collected_at=NOW()' : status === 'completed' ? ', completed_at=NOW()' : '';
  await pool.query(`UPDATE lab_requests SET status=?${extra} WHERE id=?`, [status, req.params.id]);
  await audit(req, 'UPDATE', 'request', req.params.id, { status });
  res.json({ ok: true });
});

router.delete('/:id', authenticate, requirePermission('requests.manage'), async (req, res) => {
  const requestId = req.params.id;
  
  // Ambil data pasien dan tanggal dari permintaan ini
  const [[req_data]] = await pool.query('SELECT patient_id, requested_at FROM lab_requests WHERE id=?', [requestId]);
  
  if (req_data) {
    // Hapus hasil yang terhubung langsung ke order ini (request_id) ATAU
    // hasil dari alat (tanpa request_id) milik pasien di tanggal order ini.
    await pool.query(`
      DELETE FROM lab_results
      WHERE request_id = ?
         OR (request_id IS NULL AND patient_id = ? AND DATE(result_at) = DATE(?))
    `, [requestId, req_data.patient_id, req_data.requested_at]);
  }

  await pool.query('DELETE FROM lab_request_items WHERE request_id=?', [requestId]);
  await pool.query('DELETE FROM lab_requests WHERE id=?', [requestId]);
  await audit(req, 'DELETE', 'request', requestId);
  res.json({ ok: true });
});

export default router;

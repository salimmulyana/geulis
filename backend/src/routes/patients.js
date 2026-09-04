import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

router.get('/', authenticate, requirePermission('patients.view'), async (req, res) => {
  const q = req.query.q || '';
  const [rows] = await pool.query(
    `SELECT * FROM patients
     WHERE name LIKE ? OR medical_record_no LIKE ? OR order_no LIKE ?
     ORDER BY created_at DESC LIMIT 50`,
    [`%${q}%`, `%${q}%`, `%${q}%`]
  );
  res.json(rows);
});

router.get('/:id', authenticate, requirePermission('patients.view'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM patients WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Pasien tidak ditemukan' });
  res.json(rows[0]);
});

router.post('/', authenticate, requirePermission('patients.manage'), async (req, res) => {
  const { medical_record_no, order_no, name, birth_date, gender, phone, address } = req.body;
  const [r] = await pool.query(
    `INSERT INTO patients (medical_record_no, order_no, name, birth_date, gender, phone, address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [medical_record_no, order_no || null, name, birth_date || null, gender || 'L', phone, address]
  );
  const [rows] = await pool.query('SELECT * FROM patients WHERE id = ?', [r.insertId]);
  await audit(req, 'CREATE', 'patient', r.insertId, { medical_record_no, name });
  res.status(201).json(rows[0]);
});

router.put('/:id', authenticate, requirePermission('patients.manage'), async (req, res) => {
  const { medical_record_no, order_no, name, birth_date, gender, phone, address } = req.body;
  await pool.query(
    `UPDATE patients SET medical_record_no=?, order_no=?, name=?, birth_date=?, gender=?, phone=?, address=?
     WHERE id=?`,
    [medical_record_no, order_no, name, birth_date, gender, phone, address, req.params.id]
  );
  const [rows] = await pool.query('SELECT * FROM patients WHERE id = ?', [req.params.id]);
  await audit(req, 'UPDATE', 'patient', req.params.id, { medical_record_no, name });
  res.json(rows[0]);
});

router.delete('/:id', authenticate, requirePermission('patients.manage'), async (req, res) => {
  await pool.query('DELETE FROM patients WHERE id = ?', [req.params.id]);
  await audit(req, 'DELETE', 'patient', req.params.id);
  res.json({ ok: true });
});

export default router;

import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

const GENDER_COLS = ['reference_min_l', 'reference_max_l', 'reference_min_p', 'reference_max_p'];

router.get('/', authenticate, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT lt.*, i.name AS instrument_name, i.code AS instrument_code 
    FROM lab_tests lt 
    LEFT JOIN instruments i ON i.id = lt.instrument_id 
    ORDER BY lt.sort_order ASC, lt.code ASC
  `);
  res.json(rows);
});

router.post('/', authenticate, async (req, res) => {
  const { code, name, unit, reference_min, reference_max, is_active, instrument_id, sort_order } = req.body;
  const g = GENDER_COLS.map((c) => (req.body[c] === '' || req.body[c] == null ? null : req.body[c]));
  const [r] = await pool.query(
    `INSERT INTO lab_tests (code, name, unit, reference_min, reference_max, reference_min_l, reference_max_l, reference_min_p, reference_max_p, is_active, instrument_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [code, name, unit, reference_min || null, reference_max || null, ...g, is_active !== undefined ? is_active : 1, instrument_id || null, Number(sort_order) || 999]
  );
  await audit(req, 'CREATE', 'test', r.insertId, { code, name });
  const [rows] = await pool.query('SELECT * FROM lab_tests WHERE id = ?', [r.insertId]);
  res.status(201).json(rows[0]);
});

router.put('/:id', authenticate, async (req, res) => {
  const { code, name, unit, reference_min, reference_max, is_active, instrument_id, sort_order } = req.body;
  const g = GENDER_COLS.map((c) => (req.body[c] === '' || req.body[c] == null ? null : req.body[c]));
  await pool.query(
    `UPDATE lab_tests SET code=?, name=?, unit=?, reference_min=?, reference_max=?, reference_min_l=?, reference_max_l=?, reference_min_p=?, reference_max_p=?, is_active=?, instrument_id=?, sort_order=? WHERE id=?`,
    [code, name, unit, reference_min || null, reference_max || null, ...g, is_active, instrument_id || null, Number(sort_order) || 999, req.params.id]
  );
  await audit(req, 'UPDATE', 'test', req.params.id, { code, name });
  const [rows] = await pool.query('SELECT * FROM lab_tests WHERE id = ?', [req.params.id]);
  res.json(rows[0]);
});

router.delete('/:id', authenticate, async (req, res) => {
  await pool.query('DELETE FROM lab_tests WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

router.patch('/:id/visibility', authenticate, async (req, res) => {
  const { show_in_report } = req.body;
  await pool.query('UPDATE lab_tests SET show_in_report = ? WHERE id = ?', [show_in_report ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});

router.patch('/:id/sort-order', authenticate, async (req, res) => {
  const { sort_order } = req.body;
  await pool.query('UPDATE lab_tests SET sort_order = ? WHERE id = ?', [Number(sort_order) || 0, req.params.id]);
  res.json({ ok: true });
});

router.post('/reorder', authenticate, async (req, res) => {
  const { orders } = req.body;
  if (Array.isArray(orders)) {
    for (const item of orders) {
      await pool.query('UPDATE lab_tests SET sort_order = ? WHERE id = ?', [Number(item.sort_order), item.id]);
    }
  }
  res.json({ ok: true });
});

export default router;

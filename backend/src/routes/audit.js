import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();

// GET /api/audit?entity=result&q=&start_date=&end_date=
router.get('/', authenticate, requirePermission('audit.view'), async (req, res) => {
  const { entity, action, q, start_date, end_date } = req.query;
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];
  if (entity) { sql += ' AND entity = ?'; params.push(entity); }
  if (action) { sql += ' AND action = ?'; params.push(action); }
  if (q) { sql += ' AND (username LIKE ? OR detail LIKE ? OR entity_id LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (start_date && end_date) { sql += ' AND DATE(created_at) BETWEEN ? AND ?'; params.push(start_date, end_date); }
  sql += ' ORDER BY created_at DESC LIMIT 300';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

export default router;

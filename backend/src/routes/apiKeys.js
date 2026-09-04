import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

router.get('/', authenticate, requirePermission('settings.manage'), async (req, res) => {
  const [rows] = await pool.query(`
    SELECT k.*, u.full_name as creator_name 
    FROM api_keys k 
    LEFT JOIN users u ON u.id = k.created_by
    ORDER BY k.created_at DESC
  `);
  res.json(rows);
});

router.post('/', authenticate, requirePermission('settings.manage'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nama API Key wajib diisi' });
  
  // Generate a random key (32 bytes -> 64 chars hex)
  const apiKey = 'khanza_' + crypto.randomBytes(24).toString('hex');
  
  try {
    await pool.query(
      'INSERT INTO api_keys (name, api_key, created_by) VALUES (?, ?, ?)',
      [name, apiKey, req.user.id]
    );
    res.status(201).json({ api_key: apiKey });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membuat API Key' });
  }
});

router.delete('/:id', authenticate, requirePermission('settings.manage'), async (req, res) => {
  await pool.query('DELETE FROM api_keys WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

export default router;

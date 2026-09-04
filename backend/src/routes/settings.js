import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM settings');
  const settings = {};
  for (const row of rows) {
    settings[row.setting_key] = row.setting_value;
  }
  res.json(settings);
});

router.put('/', authenticate, async (req, res) => {
  // Hanya admin yang boleh mengubah pengaturan.
  // req.user berasal dari payload JWT, yang menyimpan roleCode secara datar
  // (lihat routes/auth.js). Sebelumnya di sini dibaca sebagai req.user.role.code
  // — objek 'role' hanya ada di balasan login, tidak pernah ada di token —
  // sehingga pemeriksaan ini SELALU gagal dan admin pun ditolak.
  if (req.user?.roleCode !== 'admin') {
    return res.status(403).json({ error: 'Akses ditolak' });
  }
  
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    await pool.query(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [key, value]
    );
  }
  res.json({ ok: true });
});

export default router;

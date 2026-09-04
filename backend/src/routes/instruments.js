import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PROTOCOL_HELP } from '../services/protocolParsers.js';
import { reloadInstrumentListeners } from '../services/instrumentListener.js';
import { audit } from '../services/audit.js';

const router = Router();

router.get('/protocols', authenticate, requirePermission('instruments.view'), (_req, res) => {
  res.json(PROTOCOL_HELP);
});

// #7 Reload listener alat tanpa restart backend
router.post('/reload', authenticate, requirePermission('instruments.manage'), async (req, res) => {
  try {
    const out = await reloadInstrumentListeners();
    await audit(req, 'RELOAD', 'instrument', null, out);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', authenticate, requirePermission('instruments.view'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM instruments ORDER BY name');
  res.json(rows);
});

router.get('/:id/maps', authenticate, requirePermission('instruments.view'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT m.*, lt.code AS test_code, lt.name AS test_name
     FROM instrument_test_map m
     JOIN lab_tests lt ON lt.id = m.test_id
     WHERE m.instrument_id = ?`,
    [req.params.id]
  );
  res.json(rows);
});

router.post('/', authenticate, requirePermission('instruments.manage'), async (req, res) => {
  // conn_mode menentukan arah koneksi: 'server' = alat menghubungi LIS,
  // 'client' = LIS menghubungi alat (Mindray BC-3600/BC-11). Sebelumnya kolom
  // ini tidak pernah dibaca di sini maupun di PUT, sehingga alat mode client
  // hanya bisa didaftarkan lewat SQL dan penambahan dari aplikasi selalu salah
  // arah — backend malah mencoba mendengarkan di alamat milik alat.
  const { code, name, manufacturer, model, protocol, conn_mode, host, port, config_json, is_active } = req.body;
  const [r] = await pool.query(
    `INSERT INTO instruments (code, name, manufacturer, model, protocol, conn_mode, host, port, config_json, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [code, name, manufacturer, model, protocol || 'astm', conn_mode === 'client' ? 'client' : 'server',
     host || '0.0.0.0', port || 5000, JSON.stringify(config_json || {}), is_active ?? 1] // protocol: astm|hl7|json|xml
  );
  await audit(req, 'CREATE', 'instrument', r.insertId, { code, name, port });
  res.status(201).json({ id: r.insertId });
});

router.put('/:id', authenticate, requirePermission('instruments.manage'), async (req, res) => {
  const { code, name, manufacturer, model, protocol, conn_mode, host, port, config_json, is_active } = req.body;
  await pool.query(
    `UPDATE instruments SET code=?, name=?, manufacturer=?, model=?, protocol=?, conn_mode=?, host=?, port=?, config_json=?, is_active=?
     WHERE id=?`,
    [code, name, manufacturer, model, protocol, conn_mode === 'client' ? 'client' : 'server',
     host, port, JSON.stringify(config_json || {}), is_active ? 1 : 0, req.params.id]
  );
  await audit(req, 'UPDATE', 'instrument', req.params.id, { code, port, is_active });
  res.json({ ok: true });
});

router.post('/:id/maps', authenticate, requirePermission('instruments.manage'), async (req, res) => {
  const { instrument_test_code, test_id } = req.body;
  await pool.query(
    'INSERT INTO instrument_test_map (instrument_id, instrument_test_code, test_id) VALUES (?, ?, ?)',
    [req.params.id, instrument_test_code, test_id]
  );
  res.json({ ok: true });
});

router.delete('/maps/:mapId', authenticate, requirePermission('instruments.manage'), async (req, res) => {
  await pool.query('DELETE FROM instrument_test_map WHERE id = ?', [req.params.mapId]);
  res.json({ ok: true });
});

router.get('/logs/recent', authenticate, requirePermission('instruments.view'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT l.*, i.name AS instrument_name FROM instrument_logs l
     LEFT JOIN instruments i ON i.id = l.instrument_id
     ORDER BY l.created_at DESC LIMIT 50`
  );
  res.json(rows);
});

router.delete('/:id', authenticate, requirePermission('instruments.manage'), async (req, res) => {
  await pool.query('DELETE FROM instruments WHERE id = ?', [req.params.id]);
  await audit(req, 'DELETE', 'instrument', req.params.id);
  res.json({ ok: true });
});

export default router;

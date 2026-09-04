import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

router.get('/roles', authenticate, requirePermission('users.view'), async (req, res) => {
  const [roles] = await pool.query('SELECT * FROM roles');
  const [perms] = await pool.query('SELECT * FROM permissions ORDER BY menu_key, code');
  const [rp] = await pool.query('SELECT role_id, permission_id FROM role_permissions');
  res.json({ roles, permissions: perms, rolePermissions: rp });
});

router.put('/roles/:roleId/permissions', authenticate, requirePermission('users.manage'), async (req, res) => {
  const { permission_ids } = req.body;
  const roleId = req.params.roleId;
  await pool.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
  for (const pid of permission_ids || []) {
    await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, pid]);
  }
  await audit(req, 'UPDATE', 'role_perms', roleId, { count: (permission_ids || []).length });
  res.json({ ok: true });
});

router.get('/', authenticate, requirePermission('users.view'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.email, u.is_active, u.last_login, r.code AS role_code, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.username`
  );
  res.json(rows);
});

router.post('/', authenticate, requirePermission('users.manage'), async (req, res) => {
  const { username, password, full_name, email, role_id } = req.body;
  const hash = await bcrypt.hash(password || 'changeme', 10);
  const [r] = await pool.query(
    'INSERT INTO users (username, password_hash, full_name, email, role_id) VALUES (?, ?, ?, ?, ?)',
    [username, hash, full_name, email, role_id]
  );
  await audit(req, 'CREATE', 'user', r.insertId, { username, role_id });
  res.status(201).json({ id: r.insertId });
});

router.patch('/:id/password', authenticate, requirePermission('users.manage'), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password_hash=? WHERE id=?', [hash, req.params.id]);
  await audit(req, 'UPDATE', 'user', req.params.id, { password_changed: true });
  res.json({ ok: true });
});

router.delete('/:id', authenticate, requirePermission('users.manage'), async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
  }
  const [rows] = await pool.query('SELECT id FROM users WHERE id = ?', [targetId]);
  if (!rows[0]) return res.status(404).json({ error: 'User tidak ditemukan' });
  await pool.query('DELETE FROM users WHERE id = ?', [targetId]);
  await audit(req, 'DELETE', 'user', targetId);
  res.json({ ok: true });
});

router.put('/:id', authenticate, requirePermission('users.manage'), async (req, res) => {
  const { full_name, email, role_id, is_active, password } = req.body;
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash=? WHERE id=?', [hash, req.params.id]);
  }
  await pool.query(
    'UPDATE users SET full_name=?, email=?, role_id=?, is_active=? WHERE id=?',
    [full_name, email, role_id, is_active ? 1 : 0, req.params.id]
  );
  await audit(req, 'UPDATE', 'user', req.params.id, { role_id, is_active });
  res.json({ ok: true });
});

export default router;

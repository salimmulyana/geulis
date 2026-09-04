import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib' });
  }
  const [users] = await pool.query(
    `SELECT u.*, r.code AS role_code, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.username = ? AND u.is_active = 1`,
    [username]
  );
  const user = users[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  const [perms] = await pool.query(
    `SELECT p.code, p.menu_key FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = ?`,
    [user.role_id]
  );
  await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
  await audit({ user: { id: user.id, username: user.username }, headers: req.headers, socket: req.socket }, 'LOGIN', 'user', user.id);
  const token = jwt.sign(
    { id: user.id, username: user.username, roleId: user.role_id, roleCode: user.role_code },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      email: user.email,
      role: { code: user.role_code, name: user.role_name },
      permissions: perms.map((p) => ({ code: p.code, menuKey: p.menu_key })),
      menus: [...new Set(perms.map((p) => p.menu_key))],
    },
  });
});

router.get('/me', authenticate, async (req, res) => {
  const [users] = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.email, r.code AS role_code, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [req.user.id]
  );
  const [perms] = await pool.query(
    `SELECT p.code, p.menu_key FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = ?`,
    [req.user.roleId]
  );
  const u = users[0];
  res.json({
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    email: u.email,
    role: { code: u.role_code, name: u.role_name },
    permissions: perms.map((p) => ({ code: p.code, menuKey: p.menu_key })),
    menus: [...new Set(perms.map((p) => p.menu_key))],
  });
});

export default router;

import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token tidak ditemukan' });
  }
  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token tidak valid' });
  }
}

export function requirePermission(...codes) {
  return async (req, res, next) => {
    if (!req.user?.permissions) {
      const [rows] = await pool.query(
        `SELECT p.code FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         WHERE rp.role_id = ?`,
        [req.user.roleId]
      );
      req.user.permissions = rows.map((r) => r.code);
    }
    const has = codes.some((c) => req.user.permissions.includes(c));
    if (!has && req.user.roleCode !== 'admin') {
      return res.status(403).json({ error: 'Akses ditolak' });
    }
    next();
  };
}

/**
 * Periksa hak akses di tengah handler, bukan sebagai middleware.
 *
 * Dipakai pada endpoint yang bisa MEMBUAT atau MEMPERBAIKI dalam satu jalur.
 * PMK 24/2022 Pasal 30 ayat (3) memisahkan hak penginputan data dari hak
 * perbaikan data, sedangkan endpointnya sendiri tidak terpisah.
 */
export async function punyaHak(req, code) {
  if (req.user?.roleCode === 'admin') return true;
  if (!req.user?.permissions) {
    const [rows] = await pool.query(
      `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = ?`,
      [req.user?.roleId]
    ).catch(() => [[]]);
    req.user.permissions = (rows || []).map((r) => r.code);
  }
  return req.user.permissions.includes(code);
}

export async function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'API Key tidak ditemukan di header (x-api-key)' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM api_keys WHERE api_key = ?', [apiKey]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'API Key tidak valid' });
    }
    // Lolos otentikasi
    req.apiKeyData = rows[0];
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Kesalahan server saat memvalidasi API Key' });
  }
}

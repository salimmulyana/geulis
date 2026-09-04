import pool from '../config/db.js';

/**
 * Catat aksi ke audit_logs. Tidak pernah melempar error (best-effort)
 * agar tidak mengganggu operasi utama.
 *
 * @param {object} req   - request Express (untuk user & IP)
 * @param {string} action - CREATE | UPDATE | DELETE | VERIFY | ACK | PUSH | LOGIN ...
 * @param {string} entity - patient | request | result | user | test | instrument ...
 * @param {string|number} entityId
 * @param {object} [detail] - data tambahan (disimpan sebagai JSON)
 */
export async function audit(req, action, entity, entityId, detail) {
  try {
    const ip =
      (req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() ||
      req?.socket?.remoteAddress ||
      null;
    await pool.query(
      'INSERT INTO audit_logs (user_id, username, action, entity, entity_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        req?.user?.id ?? null,
        req?.user?.username ?? req?.apiKeyData?.name ?? 'system',
        action,
        entity,
        entityId != null ? String(entityId) : null,
        detail ? JSON.stringify(detail).slice(0, 4000) : null,
        ip,
      ]
    );
  } catch (e) {
    // jangan ganggu alur utama
    console.warn('[audit]', e.message);
  }
}

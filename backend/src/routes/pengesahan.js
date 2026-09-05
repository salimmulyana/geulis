import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

/**
 * Pengesahan oleh dokter penanggung jawab — tahap kedua setelah verifikasi analis.
 *
 * Dua tanda tangan menjawab dua pertanyaan yang berbeda. Verifikasi analis
 * menjawab "apakah pemeriksaannya benar dikerjakan"; pengesahan dokter menjawab
 * "apakah hasil ini layak dikeluarkan atas nama laboratorium". Menggabungkan
 * keduanya membuat pertanyaan kedua tidak pernah ditanyakan.
 */

async function bolehMengesahkanSendiri() {
  const [[s]] = await pool
    .query("SELECT setting_value FROM settings WHERE setting_key = 'pengesahan.pemeriksa_boleh_mengesahkan'")
    .catch(() => [[]]);
  return String(s?.setting_value ?? '0') === '1';
}

/** Hasil kritis yang belum dilaporkan pada satu order. */
async function kritisBelumDilaporkan(requestId) {
  const [rows] = await pool.query(
    `SELECT r.id, t.code, t.name, r.result_value
       FROM lab_results r
       JOIN lab_tests t ON t.id = r.test_id
      WHERE r.request_id = ? AND r.flag = 'critical' AND (r.critical_ack IS NULL OR r.critical_ack = 0)`,
    [requestId]
  );
  return rows;
}

/** Daftar hasil yang sudah diverifikasi tetapi belum disahkan. */
router.get('/pending', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.id, r.request_id, r.result_value, r.flag, r.verified_at,
            t.code AS test_code, t.name AS test_name, t.unit,
            p.name AS patient_name, p.medical_record_no,
            u.full_name AS verified_by_name
       FROM lab_results r
       JOIN lab_tests t ON t.id = r.test_id
       JOIN patients p ON p.id = r.patient_id
       LEFT JOIN users u ON u.id = r.verified_by
      WHERE r.status = 'final' AND r.authorized_at IS NULL
      ORDER BY r.verified_at ASC
      LIMIT 500`
  );
  res.json(rows);
});

/**
 * Sahkan seluruh hasil satu order.
 *
 * Disahkan per ORDER, bukan per baris. Dokter menandatangani satu lembar hasil,
 * bukan dua puluh angka satu per satu — dan pengesahan per baris membuka
 * kemungkinan lembar yang separuh disahkan, yang tidak berarti apa-apa secara
 * hukum maupun klinis.
 */
router.post('/request/:requestId', authenticate, requirePermission('results.authorize'), async (req, res) => {
  const requestId = req.params.requestId;

  const [belum] = await pool.query(
    "SELECT COUNT(*) AS n FROM lab_results WHERE request_id = ? AND status <> 'final'",
    [requestId]
  );
  if (belum[0]?.n > 0) {
    return res.status(409).json({
      error: `Masih ada ${belum[0].n} hasil yang belum diverifikasi analis. Pengesahan menandatangani seluruh lembar, jadi lembarnya harus lengkap dulu.`,
    });
  }

  // Nilai kritis yang belum dilaporkan menghalangi pengesahan.
  //
  // Alasannya bukan administratif. Pengesahan berarti lembar hasil boleh
  // keluar; kalau ada nilai kritis yang belum disampaikan ke dokter pengirim,
  // lembar itu akan berjalan lewat jalur biasa dan angka yang menuntut
  // tindakan dalam hitungan menit ikut mengantre bersama hasil rutin.
  const kritis = await kritisBelumDilaporkan(requestId);
  if (kritis.length > 0 && !req.body?.paksa) {
    return res.status(409).json({
      error: 'Ada nilai kritis yang belum dilaporkan. Laporkan dulu ke dokter pengirim, catat siapa dan jam berapa, baru sahkan.',
      kritis,
    });
  }

  const sendiriBoleh = await bolehMengesahkanSendiri();
  if (!sendiriBoleh) {
    const [[sama]] = await pool.query(
      'SELECT COUNT(*) AS n FROM lab_results WHERE request_id = ? AND verified_by = ?',
      [requestId, req.user.id]
    );
    if (sama?.n > 0) {
      return res.status(403).json({
        error: 'Hasil ini Anda sendiri yang memverifikasi. Dua tanda tangan dari orang yang sama tidak menambah pemeriksaan apa pun. Minta dokter penanggung jawab lain, atau ubah setelan bila lab ini memang hanya punya satu orang berwenang.',
      });
    }
  }

  const [r] = await pool.query(
    `UPDATE lab_results SET authorized_by = ?, authorized_at = NOW()
      WHERE request_id = ? AND status = 'final' AND authorized_at IS NULL`,
    [req.user.id, requestId]
  );
  await audit(req, 'AUTHORIZE', 'request', requestId, {
    jumlah: r.affectedRows,
    kritis_dipaksa: kritis.length > 0 || undefined,
  });
  res.json({ ok: true, jumlah: r.affectedRows });
});

/**
 * Tarik pengesahan.
 *
 * Sengaja tidak menghapus jejaknya: yang dicatat audit adalah bahwa pengesahan
 * pernah ada dan dicabut, oleh siapa, dengan alasan apa. Lembar yang sudah
 * telanjur tercetak beredar di luar sistem, dan menghapus jejaknya membuat
 * lembar itu tidak bisa dijelaskan.
 */
router.post('/tarik/:requestId', authenticate, requirePermission('results.authorize'), async (req, res) => {
  const { alasan } = req.body || {};
  if (!alasan || String(alasan).trim().length < 5) {
    return res.status(400).json({ error: 'Alasan penarikan wajib diisi.' });
  }
  const [r] = await pool.query(
    'UPDATE lab_results SET authorized_by = NULL, authorized_at = NULL WHERE request_id = ?',
    [req.params.requestId]
  );
  await audit(req, 'UNAUTHORIZE', 'request', req.params.requestId, {
    jumlah: r.affectedRows,
    alasan,
  });
  res.json({ ok: true, jumlah: r.affectedRows });
});

export default router;

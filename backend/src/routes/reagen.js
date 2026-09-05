import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

/**
 * Reagen: stok per lot, kedaluwarsa, dan biaya per pemeriksaan.
 *
 * Sisa stok TIDAK PERNAH disunting langsung. Setiap perubahan dicatat sebagai
 * gerakan (masuk / pakai / buang / koreksi), dan sisa adalah akibat dari
 * gerakan-gerakan itu. Selisih stok reagen hampir selalu berarti salah satu dari
 * dua hal yang keduanya perlu diketahui — pencatatan yang terlewat, atau
 * pemakaian yang tidak tercatat — dan angka sisa yang bisa diketik menghapus
 * kedua jejak itu sekaligus.
 */

async function peringatanHari() {
  const [[s]] = await pool
    .query("SELECT setting_value FROM settings WHERE setting_key = 'reagen.peringatan_hari'")
    .catch(() => [[]]);
  const n = Number(s?.setting_value);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** Daftar reagen beserta stok terpakai dan keadaan lotnya. */
router.get('/', authenticate, async (req, res) => {
  const hari = await peringatanHari();
  const [rows] = await pool.query(
    `SELECT r.id, r.code, r.name, r.satuan, r.stok_minimum, r.is_active,
            COALESCE(SUM(CASE WHEN l.expires_on >= CURDATE() THEN l.sisa END), 0) AS stok_terpakai,
            COALESCE(SUM(CASE WHEN l.expires_on <  CURDATE() THEN l.sisa END), 0) AS stok_kedaluwarsa,
            MIN(CASE WHEN l.expires_on >= CURDATE() AND l.sisa > 0 THEN l.expires_on END) AS kedaluwarsa_terdekat
       FROM reagents r
       LEFT JOIN reagent_lots l ON l.reagent_id = r.id
      GROUP BY r.id
      ORDER BY r.name`
  );

  // Keadaan dihitung di server supaya semua layar memberi jawaban yang sama.
  const daftar = rows.map((r) => {
    const stok = Number(r.stok_terpakai);
    const min = r.stok_minimum != null ? Number(r.stok_minimum) : null;
    const sisaHari =
      r.kedaluwarsa_terdekat != null
        ? Math.ceil((new Date(r.kedaluwarsa_terdekat) - new Date()) / 86400000)
        : null;
    const masalah = [];
    if (stok <= 0) masalah.push('habis');
    else if (min != null && stok <= min) masalah.push('menipis');
    if (sisaHari != null && sisaHari <= hari) masalah.push('segera kedaluwarsa');
    if (Number(r.stok_kedaluwarsa) > 0) masalah.push('ada lot kedaluwarsa');
    return { ...r, sisa_hari: sisaHari, masalah };
  });

  res.json({ peringatan_hari: hari, daftar });
});

router.post('/', authenticate, async (req, res) => {
  const { code, name, satuan, stok_minimum } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: 'code dan name wajib diisi' });
  const [r] = await pool.query(
    'INSERT INTO reagents (code, name, satuan, stok_minimum) VALUES (?, ?, ?, ?)',
    [code, name, satuan || null, stok_minimum === '' || stok_minimum == null ? null : stok_minimum]
  );
  await audit(req, 'CREATE', 'reagent', r.insertId, { code, name });
  res.status(201).json({ id: r.insertId });
});

/** Lot satu reagen. */
router.get('/:id/lot', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT l.*, DATEDIFF(l.expires_on, CURDATE()) AS sisa_hari
       FROM reagent_lots l WHERE l.reagent_id = ?
      ORDER BY l.expires_on`,
    [req.params.id]
  );
  res.json(rows);
});

/**
 * Terima lot baru. Penerimaan adalah gerakan 'masuk', bukan pengisian angka
 * sisa — supaya jumlah yang diterima punya jejak seperti pemakaian.
 */
router.post('/:id/lot', authenticate, async (req, res) => {
  const { lot_no, expires_on, jumlah, harga_satuan, diterima_on, catatan } = req.body || {};
  if (!lot_no || !expires_on) {
    return res.status(400).json({ error: 'lot_no dan expires_on wajib diisi' });
  }
  const jml = Number(jumlah);
  if (!Number.isFinite(jml) || jml <= 0) {
    return res.status(400).json({ error: 'jumlah harus lebih besar dari nol' });
  }

  // Lot yang diterima dalam keadaan sudah kedaluwarsa hampir selalu salah ketik
  // tanggal. Ditolak, karena menerimanya diam-diam berarti stok tampak bertambah
  // padahal tidak ada yang bisa dipakai.
  if (new Date(expires_on) < new Date(new Date().toDateString())) {
    return res.status(400).json({
      error: `Tanggal kedaluwarsa ${expires_on} sudah lewat. Periksa kembali tanggalnya.`,
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [l] = await conn.query(
      `INSERT INTO reagent_lots (reagent_id, lot_no, expires_on, sisa, harga_satuan, diterima_on, catatan)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, lot_no, expires_on, jml, harga_satuan || null, diterima_on || new Date(), catatan || null]
    );
    await conn.query(
      "INSERT INTO reagent_movements (lot_id, jenis, jumlah, alasan, user_id) VALUES (?, 'masuk', ?, ?, ?)",
      [l.insertId, jml, 'penerimaan lot baru', req.user.id]
    );
    await conn.commit();
    await audit(req, 'CREATE', 'reagent_lot', l.insertId, { lot_no, expires_on, jumlah: jml });
    res.status(201).json({ id: l.insertId });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: e.message });
  } finally {
    conn.release();
  }
});

/** Catat pemakaian, pembuangan, atau koreksi. */
router.post('/lot/:lotId/gerakan', authenticate, async (req, res) => {
  const { jenis, jumlah, alasan } = req.body || {};
  if (!['pakai', 'buang', 'koreksi', 'masuk'].includes(jenis)) {
    return res.status(400).json({ error: 'jenis harus salah satu dari: masuk, pakai, buang, koreksi' });
  }
  const jml = Number(jumlah);
  if (!Number.isFinite(jml) || jml <= 0) {
    return res.status(400).json({ error: 'jumlah harus lebih besar dari nol' });
  }
  // Koreksi menuntut alasan. Koreksi tanpa alasan tidak bisa dibedakan dari
  // menutupi selisih, dan itulah satu-satunya hal yang koreksi tidak boleh jadi.
  if (jenis === 'koreksi' && (!alasan || String(alasan).trim().length < 5)) {
    return res.status(400).json({ error: 'Koreksi stok wajib menyertakan alasan.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[lot]] = await conn.query('SELECT * FROM reagent_lots WHERE id = ? FOR UPDATE', [req.params.lotId]);
    if (!lot) throw new Error('Lot tidak ditemukan');

    const arah = jenis === 'masuk' || jenis === 'koreksi' ? 1 : -1;
    const baru = Number(lot.sisa) + arah * jml;
    if (baru < 0) {
      throw new Error(
        `Sisa lot ${lot.lot_no} hanya ${lot.sisa}. Pemakaian ${jml} akan membuat stok negatif — periksa apakah ada penerimaan yang belum dicatat.`
      );
    }

    await conn.query('UPDATE reagent_lots SET sisa = ? WHERE id = ?', [baru, lot.id]);
    await conn.query(
      'INSERT INTO reagent_movements (lot_id, jenis, jumlah, alasan, user_id) VALUES (?, ?, ?, ?, ?)',
      [lot.id, jenis, jml, alasan || null, req.user.id]
    );
    await conn.commit();
    await audit(req, 'UPDATE', 'reagent_lot', lot.id, { jenis, jumlah: jml, sisa_baru: baru, alasan });
    res.json({ ok: true, sisa: baru });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: e.message });
  } finally {
    conn.release();
  }
});

/** Riwayat gerakan satu lot. */
router.get('/lot/:lotId/gerakan', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT m.*, u.full_name AS oleh
       FROM reagent_movements m LEFT JOIN users u ON u.id = m.user_id
      WHERE m.lot_id = ? ORDER BY m.created_at DESC LIMIT 200`,
    [req.params.lotId]
  );
  res.json(rows);
});

/**
 * Biaya reagen per pemeriksaan.
 *
 * Harga diambil dari lot yang MASIH BERLAKU dan paling baru diterima, bukan
 * rata-rata seluruh lot. Rata-rata mencampur harga lama yang sudah tidak
 * relevan; yang ingin diketahui manajemen adalah biaya bila memeriksa hari ini.
 */
router.get('/biaya-per-periksa', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.id AS test_id, t.code, t.name,
            r.code AS reagen_code, r.name AS reagen_name,
            u.jumlah_per_periksa, r.satuan,
            (SELECT l.harga_satuan FROM reagent_lots l
              WHERE l.reagent_id = r.id AND l.harga_satuan IS NOT NULL
                AND l.expires_on >= CURDATE()
              ORDER BY l.diterima_on DESC, l.id DESC LIMIT 1) AS harga_satuan
       FROM test_reagent_usage u
       JOIN lab_tests t ON t.id = u.test_id
       JOIN reagents r ON r.id = u.reagent_id
      ORDER BY t.code`
  );

  const per = new Map();
  for (const r of rows) {
    if (!per.has(r.test_id)) {
      per.set(r.test_id, { test_id: r.test_id, code: r.code, name: r.name, komponen: [], biaya: 0, lengkap: true });
    }
    const t = per.get(r.test_id);
    const harga = r.harga_satuan != null ? Number(r.harga_satuan) : null;
    const sub = harga != null ? harga * Number(r.jumlah_per_periksa) : null;
    // Harga yang belum diisi membuat biaya TIDAK dilaporkan, bukan dianggap nol.
    // Biaya yang terlihat murah karena satu komponen kosong lebih menyesatkan
    // daripada tidak ada angka sama sekali.
    if (sub == null) t.lengkap = false;
    else t.biaya += sub;
    t.komponen.push({ reagen: r.reagen_name, jumlah: r.jumlah_per_periksa, satuan: r.satuan, harga_satuan: harga, subtotal: sub });
  }

  res.json(
    [...per.values()].map((t) => ({ ...t, biaya: t.lengkap ? Math.round(t.biaya) : null }))
  );
});

/** Tetapkan pemakaian reagen untuk satu pemeriksaan. */
router.put('/pemakaian/:testId', authenticate, async (req, res) => {
  const { komponen } = req.body || {};
  if (!Array.isArray(komponen)) return res.status(400).json({ error: 'komponen harus berupa array' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM test_reagent_usage WHERE test_id = ?', [req.params.testId]);
    for (const k of komponen) {
      if (!k.reagent_id || !(Number(k.jumlah_per_periksa) > 0)) continue;
      await conn.query(
        'INSERT INTO test_reagent_usage (test_id, reagent_id, jumlah_per_periksa) VALUES (?, ?, ?)',
        [req.params.testId, k.reagent_id, k.jumlah_per_periksa]
      );
    }
    await conn.commit();
    await audit(req, 'UPDATE', 'test_reagent_usage', req.params.testId, { jumlah: komponen.length });
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: e.message });
  } finally {
    conn.release();
  }
});

export default router;

import { Router } from 'express';
import crypto from 'crypto';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { susunIsi, verifikasi, PERNYATAAN } from '../services/ttd.js';

const router = Router();

/**
 * Portal hasil untuk pasien.
 *
 * Ini satu-satunya bagian sistem yang mengeluarkan hasil dari jaringan tertutup,
 * jadi asumsinya dibalik: ANGGAP TAUTANNYA BOCOR, lalu rancang supaya bocornya
 * tidak cukup. Tautan bocor lewat riwayat peramban, tangkapan layar yang
 * diteruskan, WhatsApp yang salah kirim, dan ponsel yang dipinjam.
 *
 * Tujuh penjagaan, masing-masing menutup celah yang berbeda:
 *
 *  1. Token 256 bit acak — tidak bisa ditebak atau dijelajah.
 *  2. Disimpan sebagai HASH — basis data yang bocor tidak langsung menjadi
 *     hasil yang bocor.
 *  3. Faktor kedua: tanggal lahir — tautan saja tidak cukup.
 *  4. Kunci setelah beberapa kali salah — tanggal lahir hanya punya ribuan
 *     kemungkinan, jadi tanpa penguncian ia bisa ditebak habis-habisan.
 *  5. Pesan galat SERAGAM — tidak membocorkan mana yang salah.
 *  6. Hanya hasil yang SUDAH DISAHKAN — pasien tidak pernah menerima angka
 *     yang belum ditandatangani siapa pun.
 *  7. Kedaluwarsa dan bisa dicabut.
 *
 * Semua percobaan dicatat, terutama yang gagal.
 */

async function setelan() {
  const [rows] = await pool
    .query("SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'portal.%'")
    .catch(() => [[]]);
  const s = { aktif: false, masa_berlaku_hari: 30, maks_gagal: 5, kunci_menit: 30 };
  for (const r of rows || []) {
    const k = r.setting_key.replace('portal.', '');
    if (k === 'aktif') s.aktif = String(r.setting_value) === '1';
    else {
      const v = Number(r.setting_value);
      if (Number.isFinite(v) && v > 0) s[k] = v;
    }
  }
  return s;
}

const hashToken = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');

/**
 * Tanggal menjadi YYYY-MM-DD tanpa pergeseran zona waktu.
 *
 * toISOString() TIDAK aman untuk ini. Driver basis data boleh mengembalikan
 * kolom DATE sebagai teks atau sebagai objek Date; bila objek, ia dibaca sebagai
 * tengah malam waktu setempat, dan di WIB (+07:00) toISOString menggesernya
 * mundur satu hari. Akibatnya setiap pasien gagal membuka hasilnya sendiri
 * dengan tanggal lahir yang benar — kegagalan yang terlihat seperti serangan,
 * padahal salah hitung.
 */
function tanggalYMD(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  const b = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${b}-${t}`;
}

async function catatAkses(tokenId, berhasil, sebab, req) {
  await pool
    .query(
      'INSERT INTO portal_access_log (token_id, berhasil, sebab, ip, user_agent) VALUES (?, ?, ?, ?, ?)',
      [
        tokenId,
        berhasil ? 1 : 0,
        sebab || null,
        req.ip || null,
        String(req.get('user-agent') || '').slice(0, 255),
      ]
    )
    .catch(() => {});
}

// Satu pesan untuk SEMUA kegagalan.
//
// Pesan yang berbeda untuk "token tidak ada" dan "tanggal lahir salah"
// memberi tahu penebak bahwa tokennya benar — dan menyempitkan pekerjaannya
// dari menebak dua hal menjadi menebak satu.
const PESAN_GAGAL =
  'Tautan atau tanggal lahir tidak cocok, atau tautannya sudah tidak berlaku. Hubungi laboratorium.';

/* ---------------------------------------------------------------- sisi pasien */

router.post('/buka', async (req, res) => {
  const s = await setelan();
  if (!s.aktif) return res.status(404).json({ error: 'Portal tidak aktif.' });

  const { token, tanggal_lahir } = req.body || {};
  if (!token || !tanggal_lahir) return res.status(400).json({ error: PESAN_GAGAL });

  const [[t]] = await pool.query('SELECT * FROM portal_tokens WHERE token_hash = ?', [
    hashToken(token),
  ]);

  if (!t) {
    await catatAkses(null, false, 'token tidak dikenal', req);
    return res.status(403).json({ error: PESAN_GAGAL });
  }
  if (t.dicabut_pada) {
    await catatAkses(t.id, false, 'dicabut', req);
    return res.status(403).json({ error: PESAN_GAGAL });
  }
  if (new Date(t.kedaluwarsa_pada) < new Date()) {
    await catatAkses(t.id, false, 'kedaluwarsa', req);
    return res.status(403).json({ error: PESAN_GAGAL });
  }
  if (t.terkunci_sampai && new Date(t.terkunci_sampai) > new Date()) {
    await catatAkses(t.id, false, 'terkunci', req);
    return res.status(403).json({ error: PESAN_GAGAL });
  }

  const [[p]] = await pool.query(
    `SELECT p.birth_date FROM lab_requests r JOIN patients p ON p.id = r.patient_id WHERE r.id = ?`,
    [t.request_id]
  );

  const lahirDb = tanggalYMD(p?.birth_date);
  const lahirIsi = String(tanggal_lahir).slice(0, 10);

  // Pasien tanpa tanggal lahir tidak bisa memakai portal.
  //
  // Bukan kelalaian: tanpa faktor kedua, tautan saja sudah cukup membuka hasil,
  // dan justru pasien yang datanya tidak lengkap yang paling tidak boleh
  // dilindungi lebih longgar.
  if (!lahirDb) {
    await catatAkses(t.id, false, 'pasien tanpa tanggal lahir', req);
    return res.status(403).json({ error: PESAN_GAGAL });
  }

  const a = Buffer.from(lahirDb);
  const b = Buffer.from(lahirIsi);
  const cocok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!cocok) {
    const gagal = t.gagal_beruntun + 1;
    const kunci = gagal >= s.maks_gagal;
    await pool.query(
      'UPDATE portal_tokens SET gagal_beruntun = ?, terkunci_sampai = ? WHERE id = ?',
      [gagal, kunci ? new Date(Date.now() + s.kunci_menit * 60000) : null, t.id]
    );
    await catatAkses(t.id, false, kunci ? 'salah lahir, dikunci' : 'salah lahir', req);
    return res.status(403).json({ error: PESAN_GAGAL });
  }

  await pool.query('UPDATE portal_tokens SET gagal_beruntun = 0, terkunci_sampai = NULL WHERE id = ?', [t.id]);

  // HANYA hasil yang sudah disahkan. Pasien tidak boleh menerima angka yang
  // belum ditandatangani siapa pun — hasil sementara yang berubah kemudian
  // adalah cara tercepat menghilangkan kepercayaan pada seluruh laporan.
  const [[permintaan]] = await pool.query(
    `SELECT r.id, r.request_no, r.requested_at, r.interpretasi, r.ttd_hash, r.ttd_tanda, r.ttd_pada,
            p.name AS patient_name, p.medical_record_no, p.birth_date, p.gender,
            u.full_name AS disahkan_oleh
       FROM lab_requests r
       JOIN patients p ON p.id = r.patient_id
       LEFT JOIN users u ON u.id = r.ttd_oleh
      WHERE r.id = ?`,
    [t.request_id]
  );

  const [hasil] = await pool.query(
    `SELECT lt.code AS test_code, lt.name AS test_name, res.result_value, res.unit,
            res.rujukan_label, res.flag, res.authorized_at
       FROM lab_results res JOIN lab_tests lt ON lt.id = res.test_id
      WHERE res.request_id = ? AND res.authorized_at IS NOT NULL
      ORDER BY lt.sort_order, lt.code`,
    [t.request_id]
  );

  if (hasil.length === 0) {
    await catatAkses(t.id, false, 'belum ada hasil disahkan', req);
    return res.status(404).json({
      error: 'Hasil belum selesai disahkan. Silakan coba lagi nanti atau hubungi laboratorium.',
    });
  }

  await catatAkses(t.id, true, null, req);

  let keutuhan = null;
  if (permintaan.ttd_hash) {
    const v = verifikasi(
      susunIsi({ permintaan, hasil }),
      permintaan.ttd_hash,
      permintaan.ttd_tanda
    );
    keutuhan = { utuh: v.sah, catatan: v.sah ? null : v.sebab };
  }

  res.json({
    // Sengaja tidak memuat id internal, id pasien, maupun data pasien lain.
    // Yang dikirim hanya yang tercetak pada lembar hasil.
    pasien: {
      nama: permintaan.patient_name,
      no_rm: permintaan.medical_record_no,
      tanggal_lahir: permintaan.birth_date,
      jenis_kelamin: permintaan.gender,
    },
    pemeriksaan: {
      nomor: permintaan.request_no,
      tanggal: permintaan.requested_at,
      disahkan_oleh: permintaan.disahkan_oleh,
      disahkan_pada: permintaan.ttd_pada,
    },
    hasil: hasil.map((h) => ({
      pemeriksaan: h.test_name,
      hasil: h.result_value,
      satuan: h.unit,
      rujukan: h.rujukan_label,
      penanda: h.flag,
    })),
    interpretasi: permintaan.interpretasi,
    keutuhan,
    pernyataan: PERNYATAAN,
  });
});

/* ---------------------------------------------------------------- sisi petugas */

/**
 * Buat tautan. Token ASLI dikembalikan SEKALI dan tidak pernah tersimpan.
 *
 * Kalau hilang, tautan lama dicabut dan dibuatkan yang baru — bukan dibaca
 * ulang dari basis data. Itulah yang membuat penyimpanan berupa hash punya arti.
 */
router.post('/tautan/:requestId', authenticate, async (req, res) => {
  const s = await setelan();
  if (!s.aktif) {
    return res.status(400).json({
      error: 'Portal belum diaktifkan. Nyalakan setelan portal.aktif setelah jalur aksesnya diamankan.',
    });
  }

  const [[cek]] = await pool.query(
    `SELECT COUNT(*) AS n FROM lab_results WHERE request_id = ? AND authorized_at IS NOT NULL`,
    [req.params.requestId]
  );
  if (!cek?.n) {
    return res.status(409).json({
      error: 'Belum ada hasil yang disahkan pada permintaan ini. Tautan hanya menampilkan hasil yang sudah disahkan, jadi membuatnya sekarang hanya akan menghasilkan halaman kosong.',
    });
  }

  const [[pas]] = await pool.query(
    `SELECT p.birth_date FROM lab_requests r JOIN patients p ON p.id = r.patient_id WHERE r.id = ?`,
    [req.params.requestId]
  );
  if (!pas?.birth_date) {
    return res.status(409).json({
      error: 'Pasien ini belum punya tanggal lahir. Tanggal lahir dipakai sebagai kunci kedua — tanpa itu tautan saja sudah cukup membuka hasil.',
    });
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const kedaluwarsa = new Date(Date.now() + s.masa_berlaku_hari * 86400000);

  const [r] = await pool.query(
    'INSERT INTO portal_tokens (request_id, token_hash, dibuat_oleh, kedaluwarsa_pada) VALUES (?, ?, ?, ?)',
    [req.params.requestId, hashToken(token), req.user.id, kedaluwarsa]
  );
  await audit(req, 'CREATE', 'portal_token', r.insertId, { request_id: req.params.requestId });

  res.status(201).json({
    token,
    kedaluwarsa_pada: kedaluwarsa,
    catatan:
      'Token ini ditampilkan sekali dan tidak tersimpan. Bila hilang, cabut lalu buat baru. Pasien perlu memasukkan tanggal lahirnya untuk membukanya.',
  });
});

router.post('/cabut/:tokenId', authenticate, async (req, res) => {
  await pool.query(
    'UPDATE portal_tokens SET dicabut_pada = NOW(), dicabut_oleh = ? WHERE id = ?',
    [req.user.id, req.params.tokenId]
  );
  await audit(req, 'DELETE', 'portal_token', req.params.tokenId, {});
  res.json({ ok: true });
});

/** Riwayat akses satu permintaan — termasuk percobaan yang gagal. */
router.get('/riwayat/:requestId', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT l.*, t.request_id
       FROM portal_access_log l
       JOIN portal_tokens t ON t.id = l.token_id
      WHERE t.request_id = ?
      ORDER BY l.pada DESC LIMIT 200`,
    [req.params.requestId]
  );
  res.json(rows);
});

export default router;

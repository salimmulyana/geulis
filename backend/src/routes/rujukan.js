import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { kosongkanCacheRujukan, pilihRujukan, umurHari } from '../services/rujukanUmur.js';

const router = Router();

/**
 * Pengelolaan nilai rujukan menurut umur, jenis kelamin, dan kondisi.
 *
 * Semua penulisan mengosongkan cache pemilih rujukan. Tanpa itu, perubahan di
 * layar baru terasa setelah cache kedaluwarsa — dan petugas yang mengubah
 * rujukan lalu memasukkan hasil percobaan akan melihat penanda lama, lalu
 * menyimpulkan perubahannya tidak tersimpan.
 */

/** Nilai desimal yang boleh kosong; string kosong dari formulir dianggap NULL. */
function angka(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Bilangan bulat umur; menolak angka negatif. */
function hari(v) {
  const n = angka(v);
  if (n == null) return null;
  const b = Math.trunc(n);
  return b < 0 ? null : b;
}

router.get('/', authenticate, async (req, res) => {
  const { test_id } = req.query;
  const syarat = test_id ? 'WHERE r.test_id = ?' : '';
  const [rows] = await pool.query(
    `SELECT r.*, t.code AS test_code, t.name AS test_name, t.unit
       FROM reference_ranges r
       JOIN lab_tests t ON t.id = r.test_id
       ${syarat}
      ORDER BY t.sort_order, t.code, r.umur_min_hari IS NULL DESC, r.umur_min_hari, r.id`,
    test_id ? [test_id] : []
  );
  res.json(rows);
});

/**
 * Periksa rentang yang tumpang tindih sebelum menyimpan.
 *
 * Tumpang tindih tidak membuat sistem gagal — pemilih akan tetap memilih satu.
 * Justru itu masalahnya: petugas mengira rentang barunya berlaku, padahal yang
 * menang rentang lain yang sama khususnya dan lebih dulu terdaftar. Lebih baik
 * ditolak di depan daripada salah diam-diam.
 */
async function bertabrakan(testId, baru, kecualiId = null) {
  const [rows] = await pool.query(
    'SELECT * FROM reference_ranges WHERE test_id = ? AND is_active = 1' +
      (kecualiId ? ' AND id <> ?' : ''),
    kecualiId ? [testId, kecualiId] : [testId]
  );
  const samaGender = (a, b) => (a ?? null) === (b ?? null);
  const samaKondisi = (a, b) =>
    String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

  for (const r of rows) {
    if (!samaGender(r.gender, baru.gender)) continue;
    if (!samaKondisi(r.kondisi, baru.kondisi)) continue;

    const aMin = r.umur_min_hari ?? -Infinity;
    const aMax = r.umur_max_hari ?? Infinity;
    const bMin = baru.umur_min_hari ?? -Infinity;
    const bMax = baru.umur_max_hari ?? Infinity;
    // Batas atas eksklusif: 0-30 dan 30-365 TIDAK bertabrakan.
    if (aMin < bMax && bMin < aMax) return r;
  }
  return null;
}

function bacaBadan(b) {
  return {
    test_id: b.test_id,
    gender: b.gender === 'L' || b.gender === 'P' ? b.gender : null,
    umur_min_hari: hari(b.umur_min_hari),
    umur_max_hari: hari(b.umur_max_hari),
    kondisi: b.kondisi ? String(b.kondisi).trim().toLowerCase() : null,
    label: (b.label || '').trim(),
    ref_min: angka(b.ref_min),
    ref_max: angka(b.ref_max),
    critical_min: angka(b.critical_min),
    critical_max: angka(b.critical_max),
    sumber: b.sumber ? String(b.sumber).trim() : null,
    is_active: b.is_active === 0 || b.is_active === false ? 0 : 1,
  };
}

function periksa(d) {
  if (!d.test_id) return 'test_id wajib diisi';
  if (!d.label) return 'label wajib diisi — ini yang tercetak di lembar hasil';
  if (d.umur_min_hari != null && d.umur_max_hari != null && d.umur_min_hari >= d.umur_max_hari) {
    return 'umur_min_hari harus lebih kecil dari umur_max_hari (batas atas eksklusif)';
  }
  if (d.ref_min != null && d.ref_max != null && d.ref_min > d.ref_max) {
    return 'ref_min tidak boleh lebih besar dari ref_max';
  }
  // Rentang tanpa satu pun batas tidak menilai apa-apa, tetapi tetap menang atas
  // rujukan katalog karena lebih khusus — akibatnya penandaan mati diam-diam.
  if (d.ref_min == null && d.ref_max == null && d.critical_min == null && d.critical_max == null) {
    return 'isi minimal satu batas; rentang tanpa batas akan mematikan penandaan';
  }
  return null;
}

router.post('/', authenticate, async (req, res) => {
  const d = bacaBadan(req.body);
  const salah = periksa(d);
  if (salah) return res.status(400).json({ error: salah });

  const tabrakan = await bertabrakan(d.test_id, d);
  if (tabrakan && !req.body.paksa) {
    return res.status(409).json({
      error: `Bertabrakan dengan rentang "${tabrakan.label}". Perbaiki batas umurnya, atau kirim paksa=true bila memang disengaja.`,
      bentrok: tabrakan,
    });
  }

  const [r] = await pool.query(
    `INSERT INTO reference_ranges
       (test_id, gender, umur_min_hari, umur_max_hari, kondisi, label,
        ref_min, ref_max, critical_min, critical_max, sumber, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.test_id, d.gender, d.umur_min_hari, d.umur_max_hari, d.kondisi, d.label,
     d.ref_min, d.ref_max, d.critical_min, d.critical_max, d.sumber, d.is_active]
  );
  kosongkanCacheRujukan(d.test_id);
  await audit(req, 'CREATE', 'reference_range', r.insertId, d);
  res.status(201).json({ id: r.insertId, ...d });
});

router.put('/:id', authenticate, async (req, res) => {
  const d = bacaBadan(req.body);
  const salah = periksa(d);
  if (salah) return res.status(400).json({ error: salah });

  const tabrakan = await bertabrakan(d.test_id, d, req.params.id);
  if (tabrakan && !req.body.paksa) {
    return res.status(409).json({
      error: `Bertabrakan dengan rentang "${tabrakan.label}".`,
      bentrok: tabrakan,
    });
  }

  await pool.query(
    `UPDATE reference_ranges SET gender=?, umur_min_hari=?, umur_max_hari=?, kondisi=?,
            label=?, ref_min=?, ref_max=?, critical_min=?, critical_max=?, sumber=?, is_active=?
      WHERE id=?`,
    [d.gender, d.umur_min_hari, d.umur_max_hari, d.kondisi, d.label,
     d.ref_min, d.ref_max, d.critical_min, d.critical_max, d.sumber, d.is_active, req.params.id]
  );
  kosongkanCacheRujukan(d.test_id);
  await audit(req, 'UPDATE', 'reference_range', req.params.id, d);
  res.json({ ok: true });
});

router.delete('/:id', authenticate, async (req, res) => {
  const [[lama]] = await pool.query('SELECT * FROM reference_ranges WHERE id = ?', [req.params.id]);
  await pool.query('DELETE FROM reference_ranges WHERE id = ?', [req.params.id]);
  kosongkanCacheRujukan(lama?.test_id ?? null);
  await audit(req, 'DELETE', 'reference_range', req.params.id, lama || {});
  res.json({ ok: true });
});

/**
 * Coba rujukan tanpa menyimpan hasil apa pun.
 *
 * Ini yang membuat rentang umur bisa dipercaya. Tanpa cara mencobanya, satu-satunya
 * cara memastikan rentang neonatus benar adalah menunggu ada bayi diperiksa —
 * dan kalau ternyata salah, kesalahannya sudah masuk rekam medis.
 */
router.get('/coba', authenticate, async (req, res) => {
  const { test_id, gender, umur_hari, tanggal_lahir, kondisi, nilai } = req.query;
  if (!test_id) return res.status(400).json({ error: 'test_id wajib diisi' });

  const [[test]] = await pool.query('SELECT * FROM lab_tests WHERE id = ?', [test_id]);
  if (!test) return res.status(404).json({ error: 'Pemeriksaan tidak dikenal' });

  const [daftar] = await pool.query(
    'SELECT * FROM reference_ranges WHERE test_id = ? AND is_active = 1 ORDER BY id',
    [test_id]
  );

  const uh =
    umur_hari != null && umur_hari !== ''
      ? Number(umur_hari)
      : tanggal_lahir
      ? umurHari(tanggal_lahir)
      : null;

  const konteks = {
    gender: gender === 'L' || gender === 'P' ? gender : null,
    umurHari: Number.isFinite(uh) ? uh : null,
    kondisi: kondisi || null,
  };

  const terpilih = pilihRujukan(daftar, konteks);
  const { nilaiHasil } = await import('../services/flags.js');
  const dinilai = nilai != null && nilai !== '' ? await nilaiHasil(nilai, test, konteks) : null;

  res.json({
    konteks,
    terpilih: terpilih
      ? { id: terpilih.id, label: terpilih.label, ref_min: terpilih.ref_min, ref_max: terpilih.ref_max }
      : null,
    sumber: terpilih ? 'rentang' : 'katalog',
    penilaian: dinilai,
  });
});

export default router;

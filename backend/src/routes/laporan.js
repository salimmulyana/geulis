import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * Laporan operasional: waktu tunggu hasil (TAT), beban kerja, dan rekap bulanan.
 *
 * TAT DIHITUNG DARI WAKTU PERMINTAAN SAMPAI HASIL DIVERIFIKASI, bukan sampai
 * hasil masuk dari alat. Alasannya: hasil yang belum diverifikasi belum boleh
 * dipakai klinisi, jadi menghitung sampai alat selesai memberi angka yang enak
 * dilihat tetapi tidak menggambarkan kapan dokter benar-benar bisa membacanya.
 *
 * Angka yang dilaporkan adalah MEDIAN dan persentil 90, bukan rata-rata.
 * Rata-rata mudah dirusak satu sampel yang tertahan semalaman, dan lab yang
 * melihat rata-rata membaik sering justru sedang menumpuk kasus lambat di ekor
 * sebaran. Persentil 90 menjawab pertanyaan yang sebenarnya: "seberapa lambat
 * bagi pasien yang paling lama menunggu?"
 */

const TARGET_BAWAAN = { normal: 180, cito: 60, stat: 30 };

async function targetMenit() {
  const [rows] = await pool
    .query("SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'tat.target_%'")
    .catch(() => [[]]);
  const t = { ...TARGET_BAWAAN };
  for (const r of rows || []) {
    const k = r.setting_key.replace('tat.target_', '');
    const v = Number(r.setting_value);
    if (Number.isFinite(v) && v > 0) t[k] = v;
  }
  return t;
}

/** Persentil dari daftar angka yang SUDAH terurut. */
function persentil(urut, p) {
  if (!urut.length) return null;
  const i = Math.min(urut.length - 1, Math.max(0, Math.ceil((p / 100) * urut.length) - 1));
  return urut[i];
}

function ringkas(menitList) {
  const urut = [...menitList].sort((a, b) => a - b);
  return {
    jumlah: urut.length,
    median: persentil(urut, 50),
    p90: persentil(urut, 90),
    tercepat: urut[0] ?? null,
    terlama: urut[urut.length - 1] ?? null,
  };
}

/** TAT per pemeriksaan pada satu rentang tanggal. */
router.get('/tat', authenticate, async (req, res) => {
  const { dari, sampai } = req.query;
  const [rows] = await pool.query(
    `SELECT t.code, t.name, r.priority,
            TIMESTAMPDIFF(MINUTE, r.requested_at, res.verified_at) AS menit
       FROM lab_results res
       JOIN lab_tests t ON t.id = res.test_id
       JOIN lab_requests r ON r.id = res.request_id
      WHERE res.verified_at IS NOT NULL
        AND (? IS NULL OR DATE(r.requested_at) >= ?)
        AND (? IS NULL OR DATE(r.requested_at) <= ?)`,
    [dari || null, dari || null, sampai || null, sampai || null]
  );

  // Nilai negatif dibuang, bukan diperbaiki diam-diam. Ia muncul bila jam server
  // pernah mundur atau permintaan dibuat setelah hasilnya — dan memaksanya
  // menjadi nol akan menyembunyikan masalah pencatatan waktu yang justru perlu
  // diketahui.
  const bersih = rows.filter((r) => r.menit != null && r.menit >= 0);
  const dibuang = rows.length - bersih.length;

  const per = new Map();
  for (const r of bersih) {
    const k = r.code;
    if (!per.has(k)) per.set(k, { code: r.code, name: r.name, menit: [] });
    per.get(k).menit.push(r.menit);
  }

  const target = await targetMenit();
  const hasil = [...per.values()]
    .map((x) => ({ code: x.code, name: x.name, ...ringkas(x.menit) }))
    .sort((a, b) => (b.p90 ?? 0) - (a.p90 ?? 0));

  res.json({
    target,
    keseluruhan: ringkas(bersih.map((r) => r.menit)),
    per_prioritas: ['normal', 'cito', 'stat'].map((p) => ({
      priority: p,
      target_menit: target[p],
      ...ringkas(bersih.filter((r) => r.priority === p).map((r) => r.menit)),
    })),
    per_pemeriksaan: hasil,
    baris_dibuang: dibuang,
  });
});

/**
 * Order yang sedang berjalan dan terancam melewati target.
 *
 * Ini yang membedakan TAT sebagai laporan dari TAT sebagai alat kerja. Laporan
 * bulanan memberi tahu bahwa cito bulan lalu rata-rata terlambat; layar ini
 * memberi tahu bahwa ADA CITO YANG SEDANG TERLAMBAT SEKARANG, saat masih bisa
 * dikerjakan.
 */
router.get('/terlambat', authenticate, async (req, res) => {
  const target = await targetMenit();
  const [rows] = await pool.query(
    `SELECT r.id, r.request_no, r.priority, r.requested_at, r.status,
            p.name AS patient_name, p.medical_record_no,
            TIMESTAMPDIFF(MINUTE, r.requested_at, NOW()) AS umur_menit,
            (SELECT COUNT(*) FROM lab_request_items i WHERE i.request_id = r.id) AS jumlah_item,
            (SELECT COUNT(*) FROM lab_results res WHERE res.request_id = r.id AND res.verified_at IS NOT NULL) AS sudah_verifikasi
       FROM lab_requests r
       JOIN patients p ON p.id = r.patient_id
      WHERE r.status NOT IN ('completed','cancelled')
      ORDER BY r.requested_at ASC
      LIMIT 200`
  );

  const daftar = rows
    .map((r) => {
      const t = target[r.priority] ?? target.normal;
      const sisa = t - r.umur_menit;
      return {
        ...r,
        target_menit: t,
        sisa_menit: sisa,
        // Tiga keadaan, bukan dua. "Hampir" memberi kesempatan bertindak;
        // sistem yang hanya mengenal "aman" dan "telat" selalu memberi tahu
        // terlambat, dan pemberitahuan yang selalu terlambat akan diabaikan.
        keadaan: sisa < 0 ? 'lewat' : sisa <= t * 0.25 ? 'hampir' : 'aman',
      };
    })
    .filter((r) => r.keadaan !== 'aman')
    .sort((a, b) => a.sisa_menit - b.sisa_menit);

  res.json({ target, jumlah: daftar.length, daftar });
});

/** Rekap bulanan: jumlah pemeriksaan, pasien, dan sebaran penanda. */
router.get('/bulanan', authenticate, async (req, res) => {
  const bulan = req.query.bulan || new Date().toISOString().slice(0, 7);
  const [[ringkasan]] = await pool.query(
    `SELECT COUNT(*) AS jumlah_hasil,
            COUNT(DISTINCT res.patient_id) AS jumlah_pasien,
            COUNT(DISTINCT res.request_id) AS jumlah_order,
            SUM(res.flag = 'critical') AS kritis,
            SUM(res.flag IN ('high','low')) AS di_luar_rujukan,
            SUM(res.flag = 'critical' AND (res.critical_ack IS NULL OR res.critical_ack = 0)) AS kritis_belum_dilaporkan
       FROM lab_results res
      WHERE DATE_FORMAT(res.result_at, '%Y-%m') = ?`,
    [bulan]
  );

  const [perPemeriksaan] = await pool.query(
    `SELECT t.code, t.name, COUNT(*) AS jumlah
       FROM lab_results res JOIN lab_tests t ON t.id = res.test_id
      WHERE DATE_FORMAT(res.result_at, '%Y-%m') = ?
      GROUP BY t.id ORDER BY jumlah DESC`,
    [bulan]
  );

  const [perPetugas] = await pool.query(
    `SELECT u.full_name, COUNT(*) AS diverifikasi
       FROM lab_results res JOIN users u ON u.id = res.verified_by
      WHERE DATE_FORMAT(res.verified_at, '%Y-%m') = ?
      GROUP BY u.id ORDER BY diverifikasi DESC`,
    [bulan]
  );

  res.json({ bulan, ringkasan, per_pemeriksaan: perPemeriksaan, per_petugas: perPetugas });
});

export default router;

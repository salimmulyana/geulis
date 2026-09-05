import { Router } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import pool from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { susunIsi, tandaTangani, verifikasi, PERNYATAAN } from '../services/ttd.js';

const router = Router();

/**
 * Tanda tangan elektronik dan QR verifikasi.
 *
 * QR pada laporan mengarah ke halaman verifikasi PUBLIK. Yang ditampilkan di
 * sana sengaja dibatasi, dan pembatasannya adalah keputusan rancangan yang
 * paling penting di berkas ini:
 *
 *   QR tercetak di kertas yang beredar. Siapa pun yang memotret laporan — atau
 *   melihatnya sekilas di meja — bisa memindainya. Karena itu halaman verifikasi
 *   TIDAK menampilkan hasil pemeriksaan. Ia hanya menjawab satu pertanyaan:
 *   "apakah dokumen ini asli dan belum diubah?"
 *
 * Konsekuensinya: memindai QR yang bocor tidak membocorkan apa pun. Pertanyaan
 * "apa isinya" hanya bisa dijawab oleh kertas yang sudah ada di tangan.
 *
 * Untuk membuktikan bahwa KERTAS DI TANGAN itu yang ditandatangani — bukan
 * sekadar bahwa ada dokumen asli bernomor sama — laporan mencetak delapan
 * karakter pertama sidik isinya di samping QR, dan halaman verifikasi
 * menampilkan sidik yang sama. Pembaca membandingkan keduanya. Tanpa itu,
 * verifikasi hanya membuktikan salinan di basis data utuh, bukan kertasnya.
 */

async function muatLaporan(requestId) {
  const [[permintaan]] = await pool.query(
    `SELECT r.id, r.request_no, r.interpretasi, r.ttd_hash, r.ttd_tanda, r.ttd_pada, r.ttd_kode,
            p.name AS patient_name, p.medical_record_no, p.birth_date,
            u.full_name AS ttd_nama
       FROM lab_requests r
       JOIN patients p ON p.id = r.patient_id
       LEFT JOIN users u ON u.id = r.ttd_oleh
      WHERE r.id = ?`,
    [requestId]
  );
  if (!permintaan) return null;
  const [hasil] = await pool.query(
    `SELECT lt.code AS test_code, res.result_value, res.unit, res.rujukan_label, res.flag
       FROM lab_results res JOIN lab_tests lt ON lt.id = res.test_id
      WHERE res.request_id = ? AND res.authorized_at IS NOT NULL`,
    [requestId]
  );
  return { permintaan, hasil };
}

/** Alamat dasar halaman verifikasi, untuk dimuat ke dalam QR. */
function alamatVerifikasi(req, kode) {
  const dasar =
    process.env.PORTAL_BASE_URL ||
    `${req.protocol}://${req.get('host')}`;
  return `${dasar.replace(/\/$/, '')}/verifikasi/${kode}`;
}

/** Samarkan nama: "Budi Santoso" -> "Budi S." */
function samarkanNama(n) {
  const bagian = String(n || '').trim().split(/\s+/);
  if (bagian.length <= 1) return bagian[0] || '';
  return `${bagian[0]} ${bagian.slice(1).map((x) => x[0].toUpperCase() + '.').join(' ')}`;
}

/** Samarkan nomor rekam medis: "088910" -> "08****" */
function samarkanRM(rm) {
  const s = String(rm || '');
  if (s.length <= 2) return '*'.repeat(s.length);
  return s.slice(0, 2) + '*'.repeat(s.length - 2);
}

/* ---------------------------------------------------------------- penandatanganan */

router.post('/:requestId', authenticate, requirePermission('results.authorize'), async (req, res) => {
  const laporan = await muatLaporan(req.params.requestId);
  if (!laporan) return res.status(404).json({ error: 'Permintaan tidak ditemukan' });
  if (laporan.hasil.length === 0) {
    return res.status(409).json({
      error:
        'Belum ada hasil yang disahkan. Tanda tangan menjamin keutuhan isi, dan isi yang belum lengkap belum ada yang perlu dijamin.',
    });
  }

  try {
    const { hash, tanda } = tandaTangani(susunIsi(laporan));
    // Kode dipertahankan bila sudah ada, supaya laporan yang telanjur tercetak
    // dengan QR lama tetap bisa diverifikasi setelah penandatanganan ulang.
    const kode =
      laporan.permintaan.ttd_kode || crypto.randomBytes(9).toString('base64url');

    await pool.query(
      'UPDATE lab_requests SET ttd_hash=?, ttd_tanda=?, ttd_kode=?, ttd_oleh=?, ttd_pada=NOW() WHERE id=?',
      [hash, tanda, kode, req.user.id, req.params.requestId]
    );
    await audit(req, 'SIGN', 'request', req.params.requestId, { hash });

    res.json({
      ok: true,
      kode,
      // Delapan karakter ini yang dicetak di samping QR pada laporan.
      sidik_singkat: hash.slice(0, 8).toUpperCase(),
      url_verifikasi: alamatVerifikasi(req, kode),
      pernyataan: PERNYATAAN,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** QR siap cetak, sebagai SVG. Dibuat di server supaya laporan tidak perlu pustaka apa pun. */
router.get('/qr/:requestId', authenticate, async (req, res) => {
  const [[r]] = await pool.query('SELECT ttd_kode, ttd_hash FROM lab_requests WHERE id = ?', [
    req.params.requestId,
  ]);
  if (!r?.ttd_kode) {
    return res.status(404).json({ error: 'Laporan ini belum ditandatangani, jadi belum ada QR.' });
  }
  const svg = await QRCode.toString(alamatVerifikasi(req, r.ttd_kode), {
    type: 'svg',
    margin: 1,
    // Toleransi kesalahan sedang: laporan lab difotokopi, dilipat, dan discan
    // ulang, dan QR yang tidak terbaca setelah difotokopi tidak ada gunanya.
    errorCorrectionLevel: 'M',
  });
  res.json({
    svg,
    kode: r.ttd_kode,
    sidik_singkat: String(r.ttd_hash || '').slice(0, 8).toUpperCase(),
    url: alamatVerifikasi(req, r.ttd_kode),
  });
});

/** Periksa keutuhan dari dalam aplikasi (sudah login). */
router.get('/:requestId', authenticate, async (req, res) => {
  const laporan = await muatLaporan(req.params.requestId);
  if (!laporan) return res.status(404).json({ error: 'Permintaan tidak ditemukan' });
  if (!laporan.permintaan.ttd_hash) return res.json({ ditandatangani: false });

  const v = verifikasi(susunIsi(laporan), laporan.permintaan.ttd_hash, laporan.permintaan.ttd_tanda);
  res.json({
    ditandatangani: true,
    pada: laporan.permintaan.ttd_pada,
    oleh: laporan.permintaan.ttd_nama,
    utuh: v.sah,
    catatan: v.sah ? null : v.sebab,
    sidik_singkat: laporan.permintaan.ttd_hash.slice(0, 8).toUpperCase(),
    pernyataan: PERNYATAAN,
  });
});

export default router;

/* ---------------------------------------------------------------- halaman publik */

/**
 * Verifikasi publik — inilah yang dibuka saat QR dipindai.
 *
 * TIDAK memerlukan login, dan TIDAK menampilkan hasil pemeriksaan.
 */
export const rutePublik = Router();

rutePublik.get('/:kode', async (req, res) => {
  const kode = String(req.params.kode || '').slice(0, 24);
  const [[r]] = await pool.query(
    `SELECT r.id, r.request_no, r.ttd_hash, r.ttd_tanda, r.ttd_pada,
            p.name AS patient_name, p.medical_record_no,
            u.full_name AS ttd_nama
       FROM lab_requests r
       JOIN patients p ON p.id = r.patient_id
       LEFT JOIN users u ON u.id = r.ttd_oleh
      WHERE r.ttd_kode = ?`,
    [kode]
  );

  if (!r || !r.ttd_hash) {
    // Tidak dibedakan antara "kode tidak ada" dan "belum ditandatangani":
    // keduanya berarti dokumen itu tidak bisa dipertanggungjawabkan, dan
    // membedakannya hanya memberi tahu penebak bahwa kodenya benar.
    return res.status(404).json({
      sah: false,
      pesan: 'Kode ini tidak dikenal. Dokumen tidak dapat diverifikasi.',
    });
  }

  const laporan = await muatLaporan(r.id);
  const v = verifikasi(susunIsi(laporan), r.ttd_hash, r.ttd_tanda);

  res.json({
    sah: v.sah,
    pesan: v.sah
      ? 'Dokumen asli dan isinya tidak berubah sejak ditandatangani.'
      : 'Dokumen TIDAK cocok dengan yang ditandatangani. Jangan dipakai; hubungi laboratorium penerbit.',
    // Cukup untuk memastikan halaman ini memang tentang kertas yang dipegang,
    // tanpa memberi tahu apa pun yang belum tertulis di kertas itu.
    nomor_pemeriksaan: r.request_no,
    pasien: samarkanNama(r.patient_name),
    no_rm: samarkanRM(r.medical_record_no),
    ditandatangani_oleh: r.ttd_nama,
    ditandatangani_pada: r.ttd_pada,
    // Bandingkan dengan yang tercetak di samping QR pada kertas.
    sidik_singkat: r.ttd_hash.slice(0, 8).toUpperCase(),
    catatan_pembanding:
      'Cocokkan sidik di atas dengan yang tercetak di samping QR pada laporan. Bila berbeda, kertas itu bukan yang diverifikasi di sini.',
    pernyataan: PERNYATAAN,
  });
});

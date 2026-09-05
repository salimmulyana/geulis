import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

// Template bagian sebagai konstanta: tiga jenis ini bagiannya baku secara
// profesi, jadi tabel yang bisa disunting hanya menambah cara untuk salah.
const TEMPLATE = {
  darah_tepi: { nama: 'Gambaran Darah Tepi', bagian: ['Eritrosit','Lekosit','Trombosit','Kesan','Saran'] },
  sumsum_tulang: { nama: 'Gambaran Sumsum Tulang', bagian: ['Selularitas','Sistem Eritropoiesis','Sistem Granulopoiesis','Sistem Megakariopoiesis','Sel Lain','Kesan','Saran'] },
  patologi_anatomi: { nama: 'Patologi Anatomi', bagian: ['Lokasi','Cara Pengambilan Bahan','Diagnosa Klinis','Keterangan Klinis','Makroskopis','Mikroskopis','Kesimpulan','Anjuran'] },
};

router.get('/template', authenticate, async (req, res) => {
  res.json(['darah_tepi','sumsum_tulang','patologi_anatomi'].map((k) => ({ kode: k, ...TEMPLATE[k] })));
});

router.get('/:requestId', authenticate, async (req, res) => {
  const [[q]] = await pool.query(
    `SELECT p.name AS pasien, p.medical_record_no AS no_rm, r.request_no FROM lab_requests r JOIN patients p ON p.id=r.patient_id WHERE r.id=?`, [req.params.requestId]);
  if (!q) return res.status(404).json({ error: 'Permintaan tidak ditemukan' });
  const [hasil] = await pool.query(
    `SELECT h.jenis, h.isi, h.verified_at, u.full_name AS verified_by_nama FROM hasil_naratif h LEFT JOIN users u ON u.id=h.verified_by WHERE h.request_id=?`, [req.params.requestId]);
  res.json({ request_no: q.request_no, pasien: q.pasien, no_rm: q.no_rm,
    hasil: hasil.map(h => ({ ...h, isi: typeof h.isi === 'string' ? JSON.parse(h.isi) : h.isi })) });
});

router.put('/:requestId', authenticate, async (req, res) => {
  const { jenis, isi } = req.body || {};
  if (!TEMPLATE[jenis]) return res.status(400).json({ error: 'jenis naratif tidak dikenal' });
  // Menyimpan isi baru menggugurkan verifikasi (sama seperti hasil numerik).
  await pool.query(
    `INSERT INTO hasil_naratif (request_id, jenis, isi, dibuat_oleh) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE isi=VALUES(isi), diperbarui_pada=NOW(), verified_by=NULL, verified_at=NULL`,
    [req.params.requestId, jenis, JSON.stringify(isi || {}), req.user.id]);
  await audit(req, 'SIMPAN_NARATIF', 'request', req.params.requestId, { jenis });
  res.json({ ok: true });
});

router.post('/:requestId/verifikasi', authenticate, async (req, res) => {
  const { jenis } = req.body || {};
  const [r] = await pool.query(
    `UPDATE hasil_naratif SET verified_by=?, verified_at=NOW() WHERE request_id=? AND jenis=?`, [req.user.id, req.params.requestId, jenis]);
  if (!r.affectedRows) return res.status(409).json({ error: 'Belum ada isi untuk diverifikasi. Simpan dulu.' });
  await audit(req, 'VERIF_NARATIF', 'request', req.params.requestId, { jenis });
  res.json({ ok: true });
});

export default router;

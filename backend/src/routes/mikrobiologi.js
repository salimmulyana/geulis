import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

// Interpretasi S/I/R diisi manusia (sumber_interpretasi='manual'). Auto dari
// breakpoint CLSI/EUCAST menyusul setelah tabel resmi diimpor.

router.get('/organisme', authenticate, async (req, res) => {
  const [rows] = await pool.query(`SELECT id, nama, gram FROM micro_organism WHERE aktif=1 ORDER BY nama`);
  res.json(rows);
});
router.post('/organisme', authenticate, async (req, res) => {
  const { nama, gram } = req.body || {};
  if (!nama) return res.status(400).json({ error: 'nama wajib diisi' });
  const [r] = await pool.query(`INSERT INTO micro_organism (nama, gram) VALUES (?,?) ON DUPLICATE KEY UPDATE gram=VALUES(gram)`, [nama, gram || null]);
  res.status(201).json({ id: r.insertId });
});
router.get('/antibiotik', authenticate, async (req, res) => {
  const [rows] = await pool.query(`SELECT id, kode, nama FROM micro_antibiotic WHERE aktif=1 ORDER BY nama`);
  res.json(rows);
});
router.post('/antibiotik', authenticate, async (req, res) => {
  const { kode, nama } = req.body || {};
  if (!kode || !nama) return res.status(400).json({ error: 'kode dan nama wajib diisi' });
  const [r] = await pool.query(`INSERT INTO micro_antibiotic (kode, nama) VALUES (?,?) ON DUPLICATE KEY UPDATE nama=VALUES(nama)`, [kode, nama]);
  res.status(201).json({ id: r.insertId });
});

router.get('/kultur', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.id, c.nama_pasien, c.no_rm, c.spesimen, c.pertumbuhan, o.nama AS organisme, c.status, c.verified_at, c.dibuat_pada
       FROM micro_culture c LEFT JOIN micro_organism o ON o.id=c.organism_id ORDER BY c.dibuat_pada DESC LIMIT 200`);
  res.json(rows);
});
router.post('/kultur', authenticate, async (req, res) => {
  const b = req.body || {};
  if (!b.namaPasien) return res.status(400).json({ error: 'nama pasien wajib diisi' });
  const [r] = await pool.query(
    `INSERT INTO micro_culture (request_id, nama_pasien, no_rm, spesimen, media, tgl_tanam, dibuat_oleh) VALUES (?,?,?,?,?,?,?)`,
    [b.requestId || null, b.namaPasien, b.noRM || null, b.spesimen || null, b.media || null, b.tglTanam || null, req.user.id]);
  await audit(req, 'KULTUR_BUAT', 'micro_culture', r.insertId, null);
  res.status(201).json({ id: r.insertId });
});
router.get('/kultur/:id', authenticate, async (req, res) => {
  const [[kultur]] = await pool.query(
    `SELECT c.*, o.nama AS organisme FROM micro_culture c LEFT JOIN micro_organism o ON o.id=c.organism_id WHERE c.id=?`, [req.params.id]);
  if (!kultur) return res.status(404).json({ error: 'Kultur tidak ditemukan' });
  const [ast] = await pool.query(
    `SELECT a.id, a.antibiotic_id, ab.kode, ab.nama, a.metode, a.zona_mm, a.mic, a.sir
       FROM micro_ast a JOIN micro_antibiotic ab ON ab.id=a.antibiotic_id WHERE a.culture_id=? ORDER BY ab.nama`, [req.params.id]);
  res.json({ kultur, antibiogram: ast });
});
router.post('/kultur/:id/pertumbuhan', authenticate, async (req, res) => {
  const { pertumbuhan, organismID, catatan } = req.body || {};
  if (!['ada','tidak ada','menunggu'].includes(pertumbuhan)) return res.status(400).json({ error: 'pertumbuhan harus ada/tidak ada/menunggu' });
  if (pertumbuhan === 'ada' && !organismID) return res.status(400).json({ error: 'Pertumbuhan ada — pilih organisme yang teridentifikasi.' });
  await pool.query(`UPDATE micro_culture SET pertumbuhan=?, organism_id=?, catatan=? WHERE id=?`,
    [pertumbuhan, organismID || null, catatan || null, req.params.id]);
  res.json({ ok: true });
});
router.post('/kultur/:id/ast', authenticate, async (req, res) => {
  const b = req.body || {};
  if (!b.antibioticID) return res.status(400).json({ error: 'antibiotik wajib dipilih' });
  if (b.sir && !['S','I','R'].includes(b.sir)) return res.status(400).json({ error: 'interpretasi harus S, I, atau R' });
  await pool.query(
    `INSERT INTO micro_ast (culture_id, antibiotic_id, metode, zona_mm, mic, sir, sumber_interpretasi)
     VALUES (?,?,?,?,?,?,'manual')
     ON DUPLICATE KEY UPDATE metode=VALUES(metode), zona_mm=VALUES(zona_mm), mic=VALUES(mic), sir=VALUES(sir), sumber_interpretasi='manual'`,
    [req.params.id, b.antibioticID, b.metode || null, b.zonaMm ?? null, b.mic || null, b.sir || null]);
  res.json({ ok: true });
});
router.delete('/ast/:astId', authenticate, async (req, res) => {
  await pool.query(`DELETE FROM micro_ast WHERE id=?`, [req.params.astId]);
  res.json({ ok: true });
});
router.post('/kultur/:id/verifikasi', authenticate, async (req, res) => {
  await pool.query(`UPDATE micro_culture SET status='selesai', verified_by=?, verified_at=NOW() WHERE id=?`, [req.user.id, req.params.id]);
  await audit(req, 'KULTUR_VERIFIKASI', 'micro_culture', req.params.id, null);
  res.json({ ok: true });
});

export default router;

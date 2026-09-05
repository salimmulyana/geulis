import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { aboRhPeringatan } from '../services/aboRh.js';

const router = Router();
const nz = (v) => (String(v ?? '').trim() === '' ? null : v);

/* stok */
router.get('/stok', authenticate, async (req, res) => {
  const status = req.query.status || 'tersedia';
  const [rows] = await pool.query(
    `SELECT *, (tgl_kedaluwarsa < CURDATE()) AS kedaluwarsa FROM blood_stock
      WHERE (? = 'semua' OR status = ?) ORDER BY tgl_kedaluwarsa`, [status, status]);
  res.json(rows);
});
router.post('/stok', authenticate, async (req, res) => {
  const b = req.body || {};
  if (!b.noKantong || !b.golDarah || !b.rhesus || !b.komponen || !b.tglKedaluwarsa)
    return res.status(400).json({ error: 'no kantong, golongan, rhesus, komponen, dan tanggal kedaluwarsa wajib diisi' });
  if (new Date(b.tglKedaluwarsa) < new Date(new Date().toDateString()))
    return res.status(400).json({ error: 'Tanggal kedaluwarsa sudah lewat — periksa kembali.' });
  try {
    const [r] = await pool.query(
      `INSERT INTO blood_stock (no_kantong, gol_darah, rhesus, komponen, volume_ml, sumber, refrigerator, tgl_kedaluwarsa)
       VALUES (?,?,?,?,?,?,?,?)`,
      [b.noKantong, b.golDarah, b.rhesus, b.komponen, b.volumeMl || null, nz(b.sumber), nz(b.refrigerator), b.tglKedaluwarsa]);
    await audit(req, 'STOK_DARAH_MASUK', 'blood_stock', r.insertId, { no_kantong: b.noKantong });
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (String(e.message).includes('Duplicate')) return res.status(409).json({ error: 'Nomor kantong sudah terdaftar.' });
    res.status(500).json({ error: e.message });
  }
});

/* permintaan */
router.get('/permintaan', authenticate, async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM transfusion_request ORDER BY tgl_permintaan DESC LIMIT 200`);
  res.json(rows);
});
router.post('/permintaan', authenticate, async (req, res) => {
  const b = req.body || {};
  if (!b.namaPasien || !b.komponen) return res.status(400).json({ error: 'nama pasien dan komponen wajib diisi' });
  const no = 'BD' + new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14);
  const [r] = await pool.query(
    `INSERT INTO transfusion_request (no_permintaan, patient_id, nama_pasien, no_rm, gol_darah, rhesus, komponen, jumlah, ruang, dokter, indikasi, hb_terakhir, dibuat_oleh)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [no, b.patientId || null, b.namaPasien, nz(b.noRM), nz(b.golDarah), nz(b.rhesus), b.komponen, b.jumlah || 1, nz(b.ruang), nz(b.dokter), nz(b.indikasi), b.hbTerakhir || null, req.user.id]);
  await audit(req, 'TRANSFUSI_MINTA', 'transfusion_request', r.insertId, { no });
  res.status(201).json({ id: r.insertId, no_permintaan: no });
});

/* crossmatch */
router.post('/crossmatch', authenticate, async (req, res) => {
  const b = req.body || {};
  if (!['compatible','incompatible','pending'].includes(b.hasil))
    return res.status(400).json({ error: 'hasil harus compatible/incompatible/pending' });
  const [[info]] = await pool.query(
    `SELECT tr.gol_darah AS gp, tr.rhesus AS rp, tr.komponen AS komp, bs.gol_darah AS gk, bs.rhesus AS rk, bs.status AS st
       FROM transfusion_request tr, blood_stock bs WHERE tr.id=? AND bs.id=?`, [b.requestID, b.stockID]);
  const peringatan = info ? aboRhPeringatan(info.komp, info.gp, info.rp, info.gk, info.rk) : '';
  const [r] = await pool.query(
    `INSERT INTO crossmatch (request_id, stock_id, metode, mayor, minor, auto_control, hasil, peringatan, catatan, oleh)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [b.requestID, b.stockID, nz(b.metode), nz(b.mayor), nz(b.minor), nz(b.autoControl), b.hasil, nz(peringatan), nz(b.catatan), req.user.id]);
  if (b.hasil === 'compatible' && info && info.st === 'tersedia') {
    await pool.query(`UPDATE blood_stock SET status='dipesan' WHERE id=?`, [b.stockID]);
    await pool.query(`UPDATE transfusion_request SET status='siap' WHERE id=? AND status IN ('baru','crossmatch')`, [b.requestID]);
  }
  await audit(req, 'CROSSMATCH', 'transfusion_request', b.requestID, { stock_id: b.stockID, hasil: b.hasil, peringatan: !!peringatan });
  res.status(201).json({ id: r.insertId, hasil: b.hasil, peringatan, kantong_tersedia: info?.st === 'tersedia' });
});
router.get('/crossmatch/:requestId', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT x.id, x.hasil, x.mayor, x.minor, x.peringatan, x.catatan, x.tgl,
            bs.no_kantong, bs.gol_darah, bs.rhesus, bs.komponen
       FROM crossmatch x JOIN blood_stock bs ON bs.id=x.stock_id WHERE x.request_id=? ORDER BY x.tgl DESC`, [req.params.requestId]);
  res.json(rows);
});

/* reaksi */
router.get('/reaksi', authenticate, async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM transfusion_reaction ORDER BY tgl DESC LIMIT 200`);
  res.json(rows);
});
router.post('/reaksi', authenticate, async (req, res) => {
  const b = req.body || {};
  if (!b.namaPasien || !b.jenisReaksi) return res.status(400).json({ error: 'nama pasien dan jenis reaksi wajib diisi' });
  const [r] = await pool.query(
    `INSERT INTO transfusion_reaction (patient_id, nama_pasien, no_rm, no_kantong, komponen, gol_darah, ruang, jenis_reaksi, tindakan, keterangan, dilaporkan_oleh)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [b.patientId||null, b.namaPasien, nz(b.noRM), nz(b.noKantong), nz(b.komponen), nz(b.golDarah), nz(b.ruang), b.jenisReaksi, nz(b.tindakan), nz(b.keterangan), req.user.id]);
  await audit(req, 'REAKSI_TRANSFUSI', 'transfusion_reaction', r.insertId, { jenis: b.jenisReaksi });
  res.status(201).json({ id: r.insertId });
});

export default router;

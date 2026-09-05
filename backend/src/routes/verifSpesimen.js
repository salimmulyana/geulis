import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

// Gerbang pra-analitik: spesimen tak layak menolak permintaannya (status
// 'rejected'), bukan sekadar ditandai — supaya hasil dari sampel cacat tidak
// pernah sempat dimasukkan.
function rapikan(k){ return String(k||'').trim().toUpperCase().replace(/\s+/g,''); }

router.get('/', authenticate, async (req, res) => {
  const kode = rapikan(req.query.kode);
  if (!kode) return res.status(400).json({ error: 'Kode kosong' });
  const [[r]] = await pool.query(
    `SELECT r.id, r.request_no, r.status, r.priority, r.specimen_type, r.specimen_note,
            r.spesimen_layak, r.spesimen_kondisi, p.name AS pasien, p.medical_record_no AS no_rm
       FROM lab_requests r JOIN patients p ON p.id = r.patient_id
      WHERE UPPER(r.request_no) = ? OR UPPER(COALESCE(r.simrs_order_id,'')) = ? LIMIT 1`,
    [kode, kode]);
  if (!r) return res.status(404).json({ error: `Kode "${kode}" tidak dikenal. Periksa labelnya atau ketik nomor permintaannya.` });
  const [items] = await pool.query(
    `SELECT t.code AS kode, t.name AS nama FROM lab_request_items i JOIN lab_tests t ON t.id=i.test_id WHERE i.request_id=? ORDER BY t.code`, [r.id]);
  res.json({ ...r, sudah_diperiksa: r.spesimen_layak !== null, layak: r.spesimen_layak, kondisi: r.spesimen_kondisi, pemeriksaan: items });
});

router.post('/:id', authenticate, async (req, res) => {
  const { layak, kondisi, catatan } = req.body || {};
  if (!layak && !String(kondisi || '').trim()) {
    return res.status(400).json({ error: 'Spesimen tidak layak wajib menyertakan kondisinya (mis. lisis, kurang volume, salah wadah), supaya bisa diambil ulang dengan benar.' });
  }
  await pool.query(
    `UPDATE lab_requests SET spesimen_layak=?, spesimen_kondisi=?, spesimen_verif_catatan=?,
            spesimen_verif_oleh=?, spesimen_verif_pada=NOW(),
            status = CASE WHEN ? THEN status ELSE 'rejected' END
      WHERE id=?`,
    [layak ? 1 : 0, kondisi || null, catatan || null, req.user.id, layak ? 1 : 0, req.params.id]);
  await audit(req, 'VERIF_SPESIMEN', 'request', req.params.id, { layak: !!layak, kondisi });
  res.json({ ok: true, ditolak: !layak });
});

export default router;

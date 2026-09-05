import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();
const BATAS_BAWAAN = 10.0;

function rapikan(k){ return String(k||'').trim().toUpperCase().replace(/\s+/g,''); }

router.get('/', authenticate, async (req, res) => {
  const kode = rapikan(req.query.kode);
  if (!kode) return res.status(400).json({ error: 'Kode kosong' });
  const [[q]] = await pool.query(
    `SELECT r.id, p.name AS pasien, p.medical_record_no AS no_rm FROM lab_requests r JOIN patients p ON p.id=r.patient_id
      WHERE UPPER(r.request_no)=? OR UPPER(COALESCE(r.simrs_order_id,''))=? LIMIT 1`, [kode, kode]);
  if (!q) return res.status(404).json({ error: 'Kode tidak dikenal' });
  const [hasil] = await pool.query(
    `SELECT res.id, t.name AS pemeriksaan, res.result_value AS nilai, res.unit,
            res.duplo_nilai, res.duplo_selisih_persen, res.duplo_dalam_batas
       FROM lab_results res JOIN lab_tests t ON t.id=res.test_id
      WHERE res.request_id=? AND res.result_numeric IS NOT NULL ORDER BY t.sort_order, t.name`, [q.id]);
  res.json({ pasien: q.pasien, no_rm: q.no_rm, hasil });
});

router.post('/:id', authenticate, async (req, res) => {
  const { nilai } = req.body || {};
  if (!String(nilai || '').trim()) return res.status(400).json({ error: 'nilai duplo wajib diisi' });
  const [[row]] = await pool.query(
    `SELECT res.result_numeric AS n1, t.delta_limit_percent AS batas FROM lab_results res JOIN lab_tests t ON t.id=res.test_id WHERE res.id=?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Hasil tidak ditemukan' });
  const n2 = parseFloat(String(nilai).replace(',', '.'));
  if (isNaN(n2)) return res.status(400).json({ error: 'Nilai duplo harus berupa angka' });
  if (row.n1 == null) return res.status(409).json({ error: 'Hasil pertama bukan nilai numerik, jadi tidak bisa diduplo secara angka.' });
  if (Number(row.n1) === 0) return res.status(409).json({ error: 'Hasil pertama bernilai nol; selisih persen tidak terdefinisi. Periksa manual.' });
  const amb = row.batas > 0 ? Number(row.batas) : BATAS_BAWAAN;
  const selisih = Math.round(Math.abs((n2 - row.n1) / row.n1) * 100 * 100) / 100;
  const dalam = selisih <= amb;
  await pool.query(
    `UPDATE lab_results SET duplo_nilai=?, duplo_selisih_persen=?, duplo_dalam_batas=?, duplo_oleh=?, duplo_pada=NOW() WHERE id=?`,
    [nilai, selisih, dalam ? 1 : 0, req.user.id, req.params.id]);
  await audit(req, 'DUPLO', 'result', req.params.id, { selisih, dalam_batas: dalam });
  res.json({ selisih_persen: selisih, batas_persen: amb, dalam_batas: dalam,
    pesan: dalam ? 'Selisih dalam batas — hasil terkonfirmasi.' : 'Selisih MELEBIHI batas. Jangan dirilis; telusuri kemungkinan bekuan, gelembung, atau carry-over, lalu ulangi.' });
});

export default router;

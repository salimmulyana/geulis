import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * Terjemahkan satu hasil pindaian barcode menjadi order yang harus dibuka.
 *
 * Dibuat sebagai endpoint tersendiri, bukan pencarian biasa, karena yang
 * dituntut berbeda: pencarian boleh mengembalikan banyak kemungkinan dan
 * menyerahkan pilihan ke manusia, sedangkan pindaian harus menghasilkan SATU
 * jawaban pasti atau menolak dengan jelas. Petugas yang memegang tabung tidak
 * sedang mencari — ia sudah tahu tabung mana yang di tangannya.
 */

/**
 * Barcode dibaca pemindai sebagai ketikan cepat, dan sebagian pemindai
 * menambahkan spasi atau mengubah huruf besar-kecil. Dirapikan di server supaya
 * semua jalur masuk diperlakukan sama.
 */
function rapikan(kode) {
  return String(kode || '').trim().toUpperCase().replace(/\s+/g, '');
}

router.get('/', authenticate, async (req, res) => {
  const kode = rapikan(req.query.kode);
  if (!kode) return res.status(400).json({ error: 'Kode kosong' });

  // 1. Nomor order — ini yang dicetak pada label tabung, jadi dicoba lebih dulu.
  const [[order]] = await pool.query(
    `SELECT r.id, r.request_no, r.status, r.priority, r.patient_id,
            p.name AS patient_name, p.medical_record_no, p.birth_date, p.gender
       FROM lab_requests r
       JOIN patients p ON p.id = r.patient_id
      WHERE UPPER(r.request_no) = ?
      LIMIT 1`,
    [kode]
  );
  if (order) {
    return res.json({ jenis: 'order', ...order, ...(await ringkasan(order.id)) });
  }

  // 2. Nomor order dari SIMRS, untuk label yang dicetak SIMRS bukan oleh LIS.
  const [[dariSimrs]] = await pool.query(
    `SELECT r.id, r.request_no, r.status, r.priority, r.patient_id,
            p.name AS patient_name, p.medical_record_no, p.birth_date, p.gender
       FROM lab_requests r
       JOIN patients p ON p.id = r.patient_id
      WHERE UPPER(r.simrs_order_id) = ?
      LIMIT 1`,
    [kode]
  );
  if (dariSimrs) {
    return res.json({ jenis: 'order', ...dariSimrs, ...(await ringkasan(dariSimrs.id)) });
  }

  // 3. Nomor rekam medis. Sengaja TIDAK langsung membuka order terbaru bila
  //    pasien punya lebih dari satu order terbuka: memilihkan salah satu berarti
  //    menebak tabung mana yang dipegang petugas, dan tebakan yang salah membuat
  //    hasil masuk ke order yang keliru tanpa gejala apa pun.
  const [[pasien]] = await pool.query(
    'SELECT id, name, medical_record_no, birth_date, gender FROM patients WHERE UPPER(medical_record_no) = ? LIMIT 1',
    [kode]
  );
  if (pasien) {
    const [orders] = await pool.query(
      `SELECT id, request_no, status, priority, requested_at
         FROM lab_requests
        WHERE patient_id = ? AND status NOT IN ('completed','cancelled')
        ORDER BY requested_at DESC
        LIMIT 20`,
      [pasien.id]
    );
    if (orders.length === 1) {
      return res.json({
        jenis: 'order',
        id: orders[0].id,
        request_no: orders[0].request_no,
        status: orders[0].status,
        priority: orders[0].priority,
        patient_id: pasien.id,
        patient_name: pasien.name,
        medical_record_no: pasien.medical_record_no,
        birth_date: pasien.birth_date,
        gender: pasien.gender,
        ...(await ringkasan(orders[0].id)),
      });
    }
    return res.json({ jenis: 'pasien', pasien, orders });
  }

  res.status(404).json({
    error: `Kode "${kode}" tidak dikenal. Periksa apakah labelnya milik lab ini, atau ketik nomor ordernya.`,
  });
});

/** Berapa banyak yang sudah ada hasilnya — supaya layar bisa langsung berguna. */
async function ringkasan(requestId) {
  const [[n]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(res.id IS NOT NULL) AS sudah_ada_hasil
       FROM lab_request_items i
       LEFT JOIN lab_results res ON res.request_item_id = i.id
      WHERE i.request_id = ?`,
    [requestId]
  );
  return { jumlah_item: n?.total ?? 0, jumlah_berhasil: Number(n?.sudah_ada_hasil ?? 0) };
}

export default router;

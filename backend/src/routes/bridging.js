import { Router } from 'express';
import pool from '../config/db.js';
import { requireApiKey } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

// Middleware auth untuk semua endpoint di router ini
router.use(requireApiKey);

function genRequestNo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `REQ${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${Date.now().toString().slice(-6)}`;
}

// POST /bridging/order
router.post('/order', async (req, res) => {
  const { 
    simrs_order_id, 
    medical_record_no, 
    patient_name, 
    gender, 
    birth_date, 
    priority = 'normal',
    notes,
    // Komponen wajib laporan hasil (PMK 43/2013 Bab IX): pemohon (4), jenis
    // spesimen (7), waktu pengambilan dan penerimaan (5). SIMRS sudah punya
    // datanya — sebelumnya hanya dititipkan sebagai teks di dalam `notes`.
    clinician_name,
    clinician_unit,
    specimen_type,
    collected_at,
    tests // Array of test codes, e.g. ["HGB", "LEU"]
  } = req.body;

  if (!simrs_order_id || !medical_record_no || !patient_name || !tests || !Array.isArray(tests)) {
    return res.status(400).json({ error: 'Data tidak lengkap. simrs_order_id, medical_record_no, patient_name, dan tests wajib diisi.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Cek atau buat Pasien
    let patientId;
    const [existingPatient] = await conn.query('SELECT id FROM patients WHERE medical_record_no = ?', [medical_record_no]);
    
    if (existingPatient.length > 0) {
      patientId = existingPatient[0].id;
      // Update data pasien jika ada perubahan
      await conn.query(
        'UPDATE patients SET name=?, gender=?, birth_date=? WHERE id=?',
        [patient_name, gender || 'L', birth_date || null, patientId]
      );
    } else {
      const [newPatient] = await conn.query(
        'INSERT INTO patients (medical_record_no, name, gender, birth_date) VALUES (?, ?, ?, ?)',
        [medical_record_no, patient_name, gender || 'L', birth_date || null]
      );
      patientId = newPatient.insertId;
    }

    // 2. Cek apakah nomor order SIMRS sudah pernah masuk
    const [existingOrder] = await conn.query('SELECT id FROM lab_requests WHERE simrs_order_id = ?', [simrs_order_id]);
    if (existingOrder.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'Order dengan simrs_order_id tersebut sudah ada.' });
    }

    // 3. Translasi kode tes SIMRS ke LIS dan cari ID tes
    const testIds = [];
    if (tests.length > 0) {
      const [mappings] = await conn.query("SELECT lis_field, simrs_field FROM simrs_mappings WHERE mapping_type = 'test'");
      const mappingDict = {};
      mappings.forEach(m => { if (m.simrs_field) mappingDict[m.simrs_field.trim()] = m.lis_field; });
      
      // Simpan pasangan (kode asli SIMRS -> kode LIS). Kode aslinya dibutuhkan
      // saat hasil ditarik kembali: satu kode LIS bisa punya puluhan id_template
      // di SIMRS, jadi menebaknya lewat tabel pemetaan akan sering meleset.
      const pasangan = tests.map((t) => {
        const asli = String(t).trim();
        return { asli, kode: mappingDict[asli] || asli };
      });

      const [testRows] = await conn.query('SELECT id, code FROM lab_tests WHERE code IN (?)', [
        pasangan.map((x) => x.kode),
      ]);
      if (testRows.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'Tidak ada kode tes yang valid ditemukan di LIS.' });
      }
      const idPerKode = new Map(testRows.map((r) => [r.code, r.id]));
      for (const { asli, kode } of pasangan) {
        const id = idPerKode.get(kode);
        if (id != null) testIds.push({ id, asli });
      }
    } else {
      await conn.rollback();
      return res.status(400).json({ error: 'Daftar tests tidak boleh kosong.' });
    }

    // 4. Buat Permintaan
    const request_no = genRequestNo();
    const [reqResult] = await conn.query(
      `INSERT INTO lab_requests (request_no, patient_id, simrs_order_id, priority, notes, requested_by, status,
                                 clinician_name, clinician_unit, specimen_type, collected_at, received_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NOW())`,
      [request_no, patientId, simrs_order_id, priority, notes || null, req.apiKeyData.created_by,
       clinician_name || null, clinician_unit || null, specimen_type || null, collected_at || null]
    );
    const requestId = reqResult.insertId;

    // 5. Insert item permintaan
    for (const { id, asli } of testIds) {
      await conn.query(
        'INSERT INTO lab_request_items (request_id, test_id, simrs_code) VALUES (?, ?, ?)',
        [requestId, id, asli]
      );
    }

    await conn.commit();
    await audit(req, 'CREATE', 'request', requestId, { source: 'bridging', simrs_order_id, request_no, tests });
    res.status(201).json({
      message: 'Order berhasil diterima',
      data: {
        request_no: request_no,
        simrs_order_id: simrs_order_id,
        patient_id: patientId,
        request_id: requestId
      }
    });

  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Gagal memproses order', details: err.message });
  } finally {
    conn.release();
  }
});

// GET /bridging/result/:simrs_order_id
router.get('/result/:simrs_order_id', async (req, res) => {
  const simrsOrderId = req.params.simrs_order_id;

  try {
    // Cari Request ID dari simrs_order_id
    const [reqRows] = await pool.query(`
      SELECT lr.*, p.name as patient_name, p.medical_record_no, p.gender, p.birth_date
      FROM lab_requests lr
      JOIN patients p ON p.id = lr.patient_id
      WHERE lr.simrs_order_id = ?
    `, [simrsOrderId]);

    if (reqRows.length === 0) {
      return res.status(404).json({ error: 'Data order tidak ditemukan.' });
    }

    const requestData = reqRows[0];

    // Ambil hasil berdasarkan patient_id dan item permintaan
    // Asumsi: Hasil-hasil yang terkait dengan order ini adalah hasil tes yang ada di lab_request_items
    // dan result_at (waktu hasil) >= requested_at. Idealnya LIS punya relasi langsung lab_results -> request_id.
    // Karena saat ini lab_results terhubung ke patient_id dan test_id, kita lakukan mapping.
    
    // #3/#6: relasi presisi via request_id (bukan tebakan tanggal), dan
    // satu baris per pemeriksaan (hindari duplikat akibat >1 kode SIMRS per tes).
    const [resultRows] = await pool.query(`
      SELECT lri.test_id,
             lt.code as test_code, lt.name as test_name, lt.reference_min, lt.reference_max,
             COALESCE(lri.simrs_code,
               (SELECT sm.simrs_field FROM simrs_mappings sm
                  WHERE sm.lis_field = lt.code AND sm.mapping_type = 'test'
                  ORDER BY sm.is_active DESC, sm.id ASC LIMIT 1)) as code_simrs,
             res.id AS result_id, res.result_value, res.unit, res.flag, res.status,
             res.verified_at, res.result_at
      FROM lab_request_items lri
      JOIN lab_tests lt ON lt.id = lri.test_id
      LEFT JOIN lab_results res ON res.id = (
        SELECT r2.id FROM lab_results r2
        WHERE r2.test_id = lri.test_id
          AND (r2.request_id = ? OR (r2.request_id IS NULL AND r2.patient_id = ? AND r2.result_at >= ?))
        ORDER BY (r2.request_id = ?) DESC, r2.result_at DESC LIMIT 1
      )
      WHERE lri.request_id = ?
      GROUP BY lri.test_id
      ORDER BY lt.sort_order ASC, lt.code ASC
    `, [requestData.id, requestData.patient_id, requestData.requested_at, requestData.id, requestData.id]);

    // Format output
    const formattedResults = resultRows.map(r => {
      const hasValue = r.result_value != null && r.result_value !== '';
      const verified = r.status === 'final' || r.status === 'corrected';
      return {
        test_code: r.test_code,
        code_simrs: r.code_simrs || null,
        test_name: r.test_name,
        result_value: hasValue ? r.result_value : null,
        unit: r.unit,
        reference: r.reference_min || r.reference_max ? `${r.reference_min || ''} - ${r.reference_max || ''}` : null,
        flag: r.flag,
        result_time: r.result_at,
        // completed hanya bila sudah diverifikasi; jika ada nilai tapi belum verifikasi => preliminary
        status: hasValue ? (verified ? 'completed' : 'preliminary') : 'pending',
      };
    });

    res.json({
      simrs_order_id: requestData.simrs_order_id,
      request_no: requestData.request_no,
      status: requestData.status,
      patient: {
        medical_record_no: requestData.medical_record_no,
        name: requestData.patient_name,
        gender: requestData.gender,
        birth_date: requestData.birth_date
      },
      results: formattedResults
    });

  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil hasil', details: err.message });
  }
});

export default router;

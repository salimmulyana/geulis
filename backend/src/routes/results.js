import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, requirePermission, punyaHak } from '../middleware/auth.js';
import { calcFlag } from '../services/flags.js';
import { simpanRevisi } from '../services/revisiHasil.js';
import { audit } from '../services/audit.js';
import { pushRequestResultsToSimrs } from '../services/simrsPush.js';

const router = Router();

async function patientGender(patientId) {
  const [[p]] = await pool.query('SELECT gender FROM patients WHERE id = ?', [patientId]);
  return p?.gender ?? null;
}

/** Cari request+item aktif untuk pasien+tes agar hasil terhubung ke order */
async function findRequestLink(patientId, testId, preferItemId) {
  if (preferItemId) {
    const [[it]] = await pool.query('SELECT id AS request_item_id, request_id FROM lab_request_items WHERE id = ?', [preferItemId]);
    if (it) return it;
  }
  const [[row]] = await pool.query(
    `SELECT lri.id AS request_item_id, lri.request_id
     FROM lab_request_items lri
     JOIN lab_requests lr ON lr.id = lri.request_id
     WHERE lr.patient_id = ? AND lri.test_id = ? AND lr.status <> 'cancelled'
     ORDER BY lr.requested_at DESC LIMIT 1`,
    [patientId, testId]
  );
  return { request_item_id: row?.request_item_id ?? null, request_id: row?.request_id ?? null };
}

router.get('/groups', authenticate, requirePermission('results.view'), async (req, res) => {
  const q = req.query.q || '';
  const date = req.query.date;

  let sql = `
    SELECT p.id as patient_id, p.name as patient_name, p.medical_record_no,
           p.gender, p.birth_date, p.order_no,
           COALESCE(req.request_no, (
             SELECT r.request_no FROM lab_requests r
             WHERE r.patient_id = p.id AND DATE(r.requested_at) = DATE(res.result_at)
             ORDER BY r.requested_at DESC LIMIT 1
           )) as request_no,
           DATE(res.result_at) as exam_date,
           MAX(res.result_at) as latest_result_at,
           SUM(res.status = 'preliminary') AS pending_verify,
           SUM(res.flag = 'critical' AND res.critical_ack = 0) AS unacked_critical,
           COUNT(*) AS total_results
    FROM lab_results res
    JOIN patients p ON p.id = res.patient_id
    LEFT JOIN lab_request_items req_items ON req_items.id = res.request_item_id
    LEFT JOIN lab_requests req ON req.id = req_items.request_id
    WHERE (p.name LIKE ? OR p.medical_record_no LIKE ?)
  `;
  const params = [`%${q}%`, `%${q}%`];

  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  if (startDate && endDate) {
    sql += ' AND DATE(res.result_at) BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else if (date) {
    sql += ' AND DATE(res.result_at) = ?';
    params.push(date);
  }

  sql += `
    GROUP BY p.id, p.name, p.medical_record_no, p.gender, p.birth_date, p.order_no, DATE(res.result_at), req.request_no
    ORDER BY latest_result_at DESC
    LIMIT 50
  `;
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.get('/', authenticate, requirePermission('results.view'), async (req, res) => {
  const patientId = req.query.patient_id;
  let sql = `SELECT res.*, lt.code AS test_code, lt.name AS test_name,
                    lt.reference_min, lt.reference_max,
                    lt.reference_min_l, lt.reference_max_l, lt.reference_min_p, lt.reference_max_p,
                    lt.show_in_report, lt.sort_order,
                    p.name AS patient_name, p.gender AS patient_gender,
                    p.medical_record_no, i.name AS instrument_name,
                    vu.full_name AS verified_by_name,
                    cu.full_name AS corrected_by_name,
                    -- Komponen wajib laporan hasil (PMK 43/2013 Bab IX):
                    -- pemohon (4), waktu sampling & penerimaan (5), jenis
                    -- spesimen (7), tanggapan mutu spesimen (11).
                    lr.clinician_name, lr.clinician_unit, lr.specimen_type,
                    lr.collected_at, lr.received_at, lr.specimen_note,
                    lr.request_no
             FROM lab_results res
             JOIN lab_tests lt ON lt.id = res.test_id
             JOIN patients p ON p.id = res.patient_id
             LEFT JOIN instruments i ON i.id = res.instrument_id
             LEFT JOIN users vu ON vu.id = res.verified_by
             LEFT JOIN users cu ON cu.id = res.corrected_by
             LEFT JOIN lab_requests lr ON lr.id = res.request_id`;
  const params = [];
  if (patientId) {
    sql += ' WHERE res.patient_id = ?';
    params.push(patientId);
  }
  sql += ' ORDER BY res.result_at DESC LIMIT 200';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// #10 Tren hasil numerik satu pasien untuk satu pemeriksaan
router.get('/trend', authenticate, requirePermission('results.view'), async (req, res) => {
  const { patient_id, test_id } = req.query;
  if (!patient_id || !test_id) return res.status(400).json({ error: 'patient_id & test_id diperlukan' });
  const [rows] = await pool.query(
    `SELECT res.result_at, res.result_numeric, res.result_value, res.flag, res.unit,
            lt.name AS test_name, lt.reference_min, lt.reference_max
     FROM lab_results res JOIN lab_tests lt ON lt.id = res.test_id
     WHERE res.patient_id = ? AND res.test_id = ? AND res.result_numeric IS NOT NULL
     ORDER BY res.result_at ASC LIMIT 100`,
    [patient_id, test_id]
  );
  res.json(rows);
});

// #11 Hasil kritis yang belum di-acknowledge (untuk notifikasi dashboard)
router.get('/critical/unacked', authenticate, requirePermission('results.view'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT res.id, res.result_value, res.flag, res.result_at,
            res.delta_percent, res.delta_flag,
            lt.name AS test_name, lt.code AS test_code, lt.unit,
            p.name AS patient_name, p.medical_record_no
     FROM lab_results res
     JOIN lab_tests lt ON lt.id = res.test_id
     JOIN patients p ON p.id = res.patient_id
     WHERE res.flag = 'critical' AND res.critical_ack = 0
     ORDER BY res.result_at DESC LIMIT 50`
  );
  res.json(rows);
});

router.post('/', authenticate, requirePermission('results.manage'), async (req, res) => {
  const { patient_id, test_id, request_item_id, result_value, unit, instrument_id } = req.body;

  // Diperiksa sebelum menyentuh basis data. Tanpa ini, isian yang salah bentuk
  // -- misalnya array yang seharusnya dikirim ke /batch -- menghasilkan INSERT
  // berisi NULL yang ditolak basis data, dan galatnya muncul sebagai kegagalan
  // server alih-alih memberi tahu pemanggil apa yang salah.
  if (Array.isArray(req.body)) {
    return res.status(400).json({
      error: 'Kirim satu hasil per permintaan. Untuk banyak hasil sekaligus, pakai POST /api/results/batch.',
    });
  }
  if (!patient_id || !test_id) {
    return res.status(400).json({ error: 'patient_id dan test_id wajib diisi' });
  }

  const [[test]] = await pool.query('SELECT * FROM lab_tests WHERE id = ?', [test_id]);
  if (!test) return res.status(400).json({ error: 'Pemeriksaan tidak dikenal' });
  const gender = await patientGender(patient_id);
  const numeric = parseFloat(result_value);
  const flag = calcFlag(result_value, test, gender);
  const link = await findRequestLink(patient_id, test_id, request_item_id);
  const [r] = await pool.query(
    `INSERT INTO lab_results (request_item_id, request_id, patient_id, test_id, result_value, result_numeric, unit, flag, instrument_id, verified_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      link.request_item_id,
      link.request_id,
      patient_id,
      test_id,
      result_value,
      isNaN(numeric) ? null : numeric,
      unit || test?.unit,
      flag,
      instrument_id || null,
      req.user.id,
    ]
  );
  if (link.request_item_id) {
    await pool.query("UPDATE lab_request_items SET status='done' WHERE id=?", [link.request_item_id]);
  }
  await audit(req, 'CREATE', 'result', r.insertId, { patient_id, test_id, result_value, flag });
  const [rows] = await pool.query('SELECT * FROM lab_results WHERE id = ?', [r.insertId]);
  res.status(201).json(rows[0]);
});

router.post('/batch', authenticate, requirePermission('results.manage'), async (req, res) => {
  const results = req.body; // array of results
  if (!Array.isArray(results)) return res.status(400).json({ error: 'Body harus berupa array' });

  const savedIds = [];
  for (const item of results) {
    const { patient_id, test_id, request_item_id, result_value, unit, instrument_id, is_printable } = item;
    const [[test]] = await pool.query('SELECT * FROM lab_tests WHERE id = ?', [test_id]);
    const gender = await patientGender(patient_id);
    const numeric = parseFloat(result_value);
    const flag = calcFlag(result_value, test, gender);
    const link = await findRequestLink(patient_id, test_id, request_item_id);

    const [[existingResult]] = await pool.query(
      'SELECT id FROM lab_results WHERE patient_id = ? AND test_id = ? AND DATE(result_at) = CURDATE() LIMIT 1',
      [patient_id, test_id]
    );

    if (existingResult) {
      // Memasukkan hasil baru dan MEMPERBAIKI hasil yang sudah tersimpan adalah
      // dua hak yang berbeda menurut PMK 24/2022 Pasal 30 ayat (3), walaupun
      // lewat endpoint yang sama.
      if (!(await punyaHak(req, 'results.correct'))) {
        return res.status(403).json({
          error: 'Hasil ini sudah tersimpan. Memperbaikinya butuh hak "Perbaiki/Hapus Hasil".',
        });
      }
      // Simpan keadaan lama dulu; result_at TIDAK ditimpa karena itu waktu
      // pemeriksaan asli, yang wajib tetap dapat ditelusuri.
      // Alasan diambil dari item, bukan req.body — pada endpoint batch
      // req.body adalah array sehingga req.body.reason selalu undefined.
      await simpanRevisi(existingResult.id, req.user?.id, item.reason || null);
      await pool.query(
        `UPDATE lab_results
         SET result_value=?, result_numeric=?, unit=?, flag=?, verified_by=?, is_printable=?,
             request_id=COALESCE(request_id, ?), request_item_id=COALESCE(request_item_id, ?)
         WHERE id=?`,
        [
          result_value,
          isNaN(numeric) ? null : numeric,
          unit || test?.unit,
          flag,
          req.user.id,
          is_printable ?? 1,
          link.request_id,
          link.request_item_id,
          existingResult.id,
        ]
      );
      savedIds.push(existingResult.id);
    } else {
      const [r] = await pool.query(
        `INSERT INTO lab_results (request_item_id, request_id, patient_id, test_id, result_value, result_numeric, unit, flag, instrument_id, verified_by, is_printable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          link.request_item_id,
          link.request_id,
          patient_id,
          test_id,
          result_value,
          isNaN(numeric) ? null : numeric,
          unit || test?.unit,
          flag,
          instrument_id || null,
          req.user.id,
          is_printable ?? 1,
        ]
      );
      savedIds.push(r.insertId);
    }

    if (link.request_item_id) {
      await pool.query("UPDATE lab_request_items SET status='done' WHERE id=?", [link.request_item_id]);
    }
  }
  await audit(req, 'CREATE', 'result', null, { batch: savedIds.length, ids: savedIds });
  res.status(201).json({ saved: savedIds.length, ids: savedIds });
});

router.post('/from-instrument', authenticate, requirePermission('results.manage'), async (req, res) => {
  const { instrument_id, sample_id, patient_name, gender, birth_date, results } = req.body;
  const saved = [];

  if (!sample_id) return res.status(400).json({ error: 'sample_id diperlukan' });

  let [[patient]] = await pool.query(
    'SELECT id, gender FROM patients WHERE medical_record_no = ? OR order_no = ? LIMIT 1',
    [sample_id, sample_id]
  );

  if (!patient) {
    const name = patient_name || `Pasien ${sample_id}`;
    const [pRes] = await pool.query(
      'INSERT INTO patients (medical_record_no, name, gender, birth_date) VALUES (?, ?, ?, ?)',
      [sample_id, name, gender || null, birth_date || null]
    );
    patient = { id: pRes.insertId, gender: gender || null };
  }

  for (const item of results || []) {
    const [[map]] = await pool.query(
      `SELECT test_id FROM instrument_test_map WHERE instrument_id=? AND instrument_test_code=?`,
      [instrument_id, item.test_code]
    );
    if (!map) continue;
    const [[test]] = await pool.query('SELECT * FROM lab_tests WHERE id = ?', [map.test_id]);
    const flag = calcFlag(item.value, test, patient.gender);
    const link = await findRequestLink(patient.id, map.test_id);

    const [[existingResult]] = await pool.query(
      'SELECT id FROM lab_results WHERE patient_id = ? AND test_id = ? AND DATE(result_at) = CURDATE() LIMIT 1',
      [patient.id, map.test_id]
    );

    if (existingResult) {
      // Pengiriman ulang dari alat juga menimpa hasil, jadi versi lamanya
      // ikut disimpan. result_at dipertahankan sebagai waktu pemeriksaan asli.
      await simpanRevisi(existingResult.id, req.user?.id, 'kiriman ulang dari alat');
      await pool.query(
        `UPDATE lab_results
         SET result_value=?, result_numeric=?, unit=?, flag=?, instrument_id=?, raw_message=?,
             request_id=COALESCE(request_id, ?)
         WHERE id=?`,
        [
          item.value,
          parseFloat(item.value) || null,
          item.unit || test?.unit,
          flag,
          instrument_id,
          JSON.stringify(item),
          link.request_id,
          existingResult.id,
        ]
      );
      saved.push(existingResult.id);
    } else {
      const [r] = await pool.query(
        `INSERT INTO lab_results (patient_id, test_id, request_id, request_item_id, result_value, result_numeric, unit, flag, instrument_id, raw_message, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'preliminary')`,
        [
          patient.id,
          map.test_id,
          link.request_id,
          link.request_item_id,
          item.value,
          parseFloat(item.value) || null,
          item.unit || test?.unit,
          flag,
          instrument_id,
          JSON.stringify(item),
        ]
      );
      saved.push(r.insertId);
    }
  }
  res.json({ saved: saved.length, ids: saved });
});

// #1 Verifikasi satu hasil (preliminary -> final)
router.patch('/:id/verify', authenticate, requirePermission('results.manage'), async (req, res) => {
  await pool.query(
    "UPDATE lab_results SET status='final', verified_by=?, verified_at=NOW() WHERE id=?",
    [req.user.id, req.params.id]
  );
  await audit(req, 'VERIFY', 'result', req.params.id);
  res.json({ ok: true });
});

// #1 + #5 Verifikasi semua hasil satu order, lalu push ke SIMRS
router.post('/verify-request/:requestId', authenticate, requirePermission('results.manage'), async (req, res) => {
  const requestId = req.params.requestId;
  const [r] = await pool.query(
    "UPDATE lab_results SET status='final', verified_by=?, verified_at=NOW() WHERE request_id=? AND status='preliminary'",
    [req.user.id, requestId]
  );
  await pool.query("UPDATE lab_requests SET status='completed', completed_at=NOW() WHERE id=?", [requestId]).catch(() => {});
  await audit(req, 'VERIFY', 'request', requestId, { verified: r.affectedRows });
  // #5 push otomatis (best-effort, tidak menggagalkan verifikasi)
  let push = null;
  try {
    push = await pushRequestResultsToSimrs(requestId);
    await audit(req, 'PUSH', 'request', requestId, push);
  } catch (e) {
    push = { error: e.message };
  }
  res.json({ ok: true, verified: r.affectedRows, push });
});

// #1 Verifikasi semua hasil satu pasien pada satu tanggal
router.post('/verify-group', authenticate, requirePermission('results.manage'), async (req, res) => {
  const { patient_id, exam_date } = req.body;
  if (!patient_id || !exam_date) return res.status(400).json({ error: 'Parameter tidak lengkap' });
  const [r] = await pool.query(
    "UPDATE lab_results SET status='final', verified_by=?, verified_at=NOW() WHERE patient_id=? AND DATE(result_at)=? AND status='preliminary'",
    [req.user.id, patient_id, exam_date]
  );
  await audit(req, 'VERIFY', 'result', null, { patient_id, exam_date, verified: r.affectedRows });
  res.json({ ok: true, verified: r.affectedRows });
});

// Pelaporan hasil kritis.
//
// Dulu ini hanya menandai "sudah dilihat". Yang dituntut akreditasi dan yang
// benar-benar mengubah angka merah jadi tindakan adalah catatan: siapa yang
// dihubungi, lewat apa, dan apakah angkanya dibacakan ulang oleh penerima.
// Nama penerima wajib diisi; tanpa itu catatannya tidak membuktikan apa pun.
router.patch('/:id/ack-critical', authenticate, requirePermission('results.view'), async (req, res) => {
  const { reported_to, reported_via, readback, note } = req.body || {};
  if (!reported_to || !String(reported_to).trim()) {
    return res.status(400).json({ error: 'Nama dokter/perawat yang dihubungi wajib diisi' });
  }
  await pool.query(
    `UPDATE lab_results
        SET critical_ack = 1, critical_ack_by = ?, critical_ack_at = NOW(),
            critical_reported_to = ?, critical_reported_via = ?, critical_readback = ?, critical_note = ?
      WHERE id = ?`,
    [req.user.id, String(reported_to).trim(), reported_via || null, readback ? 1 : 0, note || null, req.params.id]
  );
  await audit(req, 'ACK', 'result', req.params.id, { reported_to, reported_via, readback: !!readback });
  res.json({ ok: true });
});

// Riwayat pelaporan nilai kritis, untuk telusur akreditasi.
router.get('/critical/log', authenticate, requirePermission('results.view'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT res.id, res.result_value, res.unit, res.result_at,
            res.critical_ack_at, res.critical_reported_to, res.critical_reported_via,
            res.critical_readback, res.critical_note,
            lt.code AS test_code, lt.name AS test_name,
            p.name AS patient_name, p.medical_record_no,
            u.full_name AS dilaporkan_oleh
       FROM lab_results res
       JOIN lab_tests lt ON lt.id = res.test_id
       JOIN patients p ON p.id = res.patient_id
       LEFT JOIN users u ON u.id = res.critical_ack_by
      WHERE res.flag = 'critical' AND res.critical_ack = 1
      ORDER BY res.critical_ack_at DESC LIMIT 200`
  );
  res.json(rows);
});

// Riwayat perbaikan satu hasil — "hasil asli dan hasil yang diperbaiki",
// komponen wajib laporan nomor 13 (PMK 43/2013 Bab IX).
router.get('/:id/revisions', authenticate, requirePermission('results.view'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT rev.id, rev.result_value, rev.unit, rev.flag, rev.result_at,
            rev.changed_at, rev.reason, u.full_name AS diubah_oleh
       FROM lab_result_revisions rev
       LEFT JOIN users u ON u.id = rev.changed_by
      WHERE rev.result_id = ?
      ORDER BY rev.changed_at ASC`,
    [req.params.id]
  );
  res.json(rows);
});

router.patch('/:id/visibility', authenticate, requirePermission('results.manage'), async (req, res) => {
  const { is_printable } = req.body;
  await pool.query('UPDATE lab_results SET is_printable = ? WHERE id = ?', [is_printable ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});

router.delete('/:id', authenticate, requirePermission('results.correct'), async (req, res) => {
  await pool.query('DELETE FROM lab_results WHERE id = ?', [req.params.id]);
  await audit(req, 'DELETE', 'result', req.params.id);
  res.json({ ok: true });
});

router.delete('/group/batch', authenticate, requirePermission('results.correct'), async (req, res) => {
  const { patient_id, exam_date } = req.query;
  if (!patient_id || !exam_date) return res.status(400).json({ error: 'Parameter tidak lengkap' });
  await pool.query('DELETE FROM lab_results WHERE patient_id = ? AND DATE(result_at) = ?', [patient_id, exam_date]);
  await audit(req, 'DELETE', 'result', null, { patient_id, exam_date, group: true });
  res.json({ ok: true });
});

export default router;

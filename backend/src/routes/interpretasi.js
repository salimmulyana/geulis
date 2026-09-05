import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

/**
 * Template interpretasi hasil.
 *
 * ATURAN POKOK: template diusulkan, tidak pernah diterapkan sendiri.
 *
 * Interpretasi adalah pendapat klinis, dan pendapat yang muncul tanpa dipilih
 * manusia adalah pernyataan yang tidak pernah dibuat dokter tetapi ikut
 * ditandatanganinya. Sistem boleh menghemat pengetikan; ia tidak boleh
 * menyimpulkan.
 */

/** Isi placeholder dari data yang benar-benar ada. */
function isiPlaceholder(teks, data) {
  return String(teks).replace(/\{(\w+)\}/g, (utuh, kunci) => {
    const v = data[kunci];
    // Placeholder yang datanya tidak ada DIBIARKAN apa adanya, bukan dikosongkan.
    // Kalimat "Nilai HbA1c  memenuhi kriteria" terbaca seolah lengkap dan akan
    // lolos dibaca; "{nilai}" yang masih menganga jelas menuntut perbaikan.
    return v == null || v === '' ? utuh : String(v);
  });
}

router.get('/template', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT it.*, t.code AS test_code, t.name AS test_name
       FROM interpretation_templates it
       LEFT JOIN lab_tests t ON t.id = it.test_id
      WHERE it.is_active = 1
      ORDER BY t.code IS NULL DESC, t.code, it.name`
  );
  res.json(rows);
});

router.post('/template', authenticate, async (req, res) => {
  const { code, name, test_id, pemicu_flag, isi } = req.body || {};
  if (!code || !name || !isi) {
    return res.status(400).json({ error: 'code, name, dan isi wajib diisi' });
  }
  const [r] = await pool.query(
    'INSERT INTO interpretation_templates (code, name, test_id, pemicu_flag, isi) VALUES (?, ?, ?, ?, ?)',
    [code, name, test_id || null, pemicu_flag || null, isi]
  );
  await audit(req, 'CREATE', 'interpretation_template', r.insertId, { code, name });
  res.status(201).json({ id: r.insertId });
});

router.put('/template/:id', authenticate, async (req, res) => {
  const { name, test_id, pemicu_flag, isi, is_active } = req.body || {};
  await pool.query(
    'UPDATE interpretation_templates SET name=?, test_id=?, pemicu_flag=?, isi=?, is_active=? WHERE id=?',
    [name, test_id || null, pemicu_flag || null, isi, is_active === 0 ? 0 : 1, req.params.id]
  );
  await audit(req, 'UPDATE', 'interpretation_template', req.params.id, { name });
  res.json({ ok: true });
});

router.delete('/template/:id', authenticate, async (req, res) => {
  // Dinonaktifkan, bukan dihapus. Laporan lama yang memakai template ini tetap
  // perlu bisa dijelaskan asal kalimatnya.
  await pool.query('UPDATE interpretation_templates SET is_active = 0 WHERE id = ?', [req.params.id]);
  await audit(req, 'DELETE', 'interpretation_template', req.params.id, {});
  res.json({ ok: true });
});

/**
 * Template yang RELEVAN untuk satu permintaan, beserta isinya yang sudah terisi.
 *
 * Diurutkan menurut kecocokan: yang terpicu oleh penanda hasil lebih dulu,
 * karena itulah yang biasanya dicari. Yang umum tetap ditampilkan di bawah —
 * menyembunyikannya akan memaksa dokter mengetik ulang kalimat yang sudah ada.
 */
router.get('/usulan/:requestId', authenticate, async (req, res) => {
  const [[permintaan]] = await pool.query(
    `SELECT r.id, r.diagnosa_klinis, p.name AS patient_name, p.birth_date, p.gender
       FROM lab_requests r JOIN patients p ON p.id = r.patient_id WHERE r.id = ?`,
    [req.params.requestId]
  );
  if (!permintaan) return res.status(404).json({ error: 'Permintaan tidak ditemukan' });

  const [hasil] = await pool.query(
    `SELECT res.test_id, res.result_value, res.flag, res.unit, res.rujukan_label,
            t.code AS test_code, t.name AS test_name
       FROM lab_results res JOIN lab_tests t ON t.id = res.test_id
      WHERE res.request_id = ?`,
    [req.params.requestId]
  );

  const [templates] = await pool.query(
    'SELECT * FROM interpretation_templates WHERE is_active = 1'
  );

  const usulan = [];
  for (const tpl of templates) {
    let cocokPada = null;

    if (tpl.test_id != null) {
      const h = hasil.find((x) => x.test_id === tpl.test_id);
      if (!h) continue;
      if (tpl.pemicu_flag && h.flag !== tpl.pemicu_flag) continue;
      cocokPada = h;
    } else if (tpl.pemicu_flag) {
      cocokPada = hasil.find((x) => x.flag === tpl.pemicu_flag);
      if (!cocokPada) continue;
    }

    usulan.push({
      id: tpl.id,
      code: tpl.code,
      name: tpl.name,
      terpicu: cocokPada != null && tpl.pemicu_flag != null,
      untuk: cocokPada ? `${cocokPada.test_code} = ${cocokPada.result_value}` : 'umum',
      isi: isiPlaceholder(tpl.isi, {
        nilai: cocokPada?.result_value,
        satuan: cocokPada?.unit,
        rujukan: cocokPada?.rujukan_label,
        pemeriksaan: cocokPada?.test_name,
        pasien: permintaan.patient_name,
        diagnosis: permintaan.diagnosa_klinis,
      }),
    });
  }

  usulan.sort((a, b) => Number(b.terpicu) - Number(a.terpicu));
  res.json({ jumlah: usulan.length, usulan });
});

/** Simpan interpretasi yang sudah dipilih dan disunting manusia. */
router.put('/:requestId', authenticate, async (req, res) => {
  const { interpretasi } = req.body || {};
  await pool.query(
    'UPDATE lab_requests SET interpretasi=?, interpretasi_oleh=?, interpretasi_pada=NOW() WHERE id=?',
    [interpretasi || null, req.user.id, req.params.requestId]
  );
  await audit(req, 'UPDATE', 'interpretasi', req.params.requestId, {
    panjang: String(interpretasi || '').length,
  });
  res.json({ ok: true });
});

export default router;

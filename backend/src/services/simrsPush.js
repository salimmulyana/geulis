import pool from '../config/db.js';

/**
 * Kirim satu hasil lab ke SIMRS eksternal sesuai konfigurasi simrs_config
 * dan mapping simrs_mappings (mapping_type='result' & 'test').
 * Best-effort: mengembalikan {ok, skipped?, status?, error?} — tidak melempar.
 */
export async function pushResultToSimrs(resultId) {
  const [results] = await pool.query(
    `SELECT res.*, lt.code AS test_code, p.medical_record_no, p.order_no
     FROM lab_results res
     JOIN lab_tests lt ON lt.id = res.test_id
     JOIN patients p ON p.id = res.patient_id
     WHERE res.id = ?`,
    [resultId]
  );
  const result = results[0];
  if (!result) return { ok: false, error: 'Hasil tidak ditemukan' };

  const [cfgRows] = await pool.query('SELECT * FROM simrs_config WHERE is_active=1 LIMIT 1');
  const cfg = cfgRows[0];
  if (!cfg) return { ok: false, skipped: true, reason: 'Konfigurasi SIMRS tidak aktif' };

  const [mappings] = await pool.query("SELECT * FROM simrs_mappings WHERE mapping_type='result' AND is_active=1");
  const payload = {};
  for (const m of mappings) {
    const camel = m.lis_field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    payload[m.simrs_field] = result[m.lis_field] ?? result[camel];
  }
  payload.no_rm = result.medical_record_no;
  payload.no_order = result.order_no;

  const [testMappings] = await pool.query("SELECT lis_field, simrs_field FROM simrs_mappings WHERE mapping_type='test' AND is_active=1");
  const testMapDict = {};
  testMappings.forEach((m) => { testMapDict[m.lis_field] = m.simrs_field; });
  payload.kode_pemeriksaan = testMapDict[result.test_code] || result.test_code;
  payload.nilai_hasil = result.result_value;
  payload.flag = result.flag;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.auth_type === 'bearer' && cfg.api_key) headers.Authorization = `Bearer ${cfg.api_key}`;
    if (cfg.auth_type === 'api_key' && cfg.api_key) headers['x-api-key'] = cfg.api_key;
    const url = `${cfg.base_url.replace(/\/$/, '')}/hasil-lab`;
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const text = await resp.text().catch(() => '');
    return { ok: resp.ok, status: resp.status, response: text.slice(0, 500) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Push semua hasil pada satu request (dipakai saat verifikasi order selesai). */
export async function pushRequestResultsToSimrs(requestId) {
  const [rows] = await pool.query('SELECT id FROM lab_results WHERE request_id = ?', [requestId]);
  const out = [];
  for (const r of rows) out.push(await pushResultToSimrs(r.id));
  return { total: rows.length, pushed: out.filter((x) => x.ok).length, details: out };
}

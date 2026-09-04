import pool from './config/db.js';

/** Upgrade skema lama (simrs_patient_id) ke order_no */
export async function ensureSchema() {
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patients' AND COLUMN_NAME IN ('order_no', 'simrs_patient_id')`
  );
  const names = cols.map((c) => c.COLUMN_NAME);

  if (!names.includes('order_no') && names.includes('simrs_patient_id')) {
    await pool.query(
      'ALTER TABLE patients CHANGE COLUMN simrs_patient_id order_no VARCHAR(50) NULL COMMENT \'Nomor order lab / SIMRS\''
    );
    console.log('[schema] Kolom simrs_patient_id diubah menjadi order_no');
  } else if (!names.includes('order_no') && !names.includes('simrs_patient_id')) {
    await pool.query(
      "ALTER TABLE patients ADD COLUMN order_no VARCHAR(50) NULL COMMENT 'Nomor order lab / SIMRS' AFTER medical_record_no"
    );
    console.log('[schema] Kolom order_no ditambahkan');
  }

  const [instCols] = await pool.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'instruments' AND COLUMN_NAME = 'protocol'`
  );
  const colType = instCols[0]?.COLUMN_TYPE || '';
  if (colType && !colType.includes('json')) {
    await pool.query(
      "ALTER TABLE instruments MODIFY protocol ENUM('astm','hl7','json','xml','tcp_json') DEFAULT 'astm'"
    );
    console.log('[schema] ENUM protocol instruments diperbarui');
  }

  // Arah koneksi: 'server' = alat yang menghubungi LIS (Sysmex/ASTM),
  // 'client' = LIS yang menghubungi alat (mis. Mindray BC-3600, lihat manual D.3)
  await ensureColumn(
    'instruments',
    'conn_mode',
    "ADD COLUMN conn_mode ENUM('server','client') DEFAULT 'server' COMMENT 'server = alat menghubungi LIS; client = LIS menghubungi alat'"
  );

  await pool.query(
    "UPDATE simrs_mappings SET lis_field = 'order_no' WHERE lis_field = 'simrs_patient_id'"
  ).catch(() => {});

  const [testCols] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lab_tests' AND COLUMN_NAME = 'sort_order'`
  );
  if (!testCols || testCols.length === 0) {
    await pool.query(
      'ALTER TABLE lab_tests ADD COLUMN sort_order INT DEFAULT 999'
    );
    console.log('[schema] Kolom sort_order ditambahkan ke lab_tests');
  }

  // Auto-sequence any unsequenced tests (1, 2, 3...)
  await pool.query("UPDATE lab_tests SET sort_order = id WHERE sort_order = 999 OR sort_order IS NULL").catch(() => {});

  await ensureColumn('lab_results', 'request_id', 'ADD COLUMN request_id INT NULL AFTER request_item_id');
  await ensureColumn('lab_results', 'critical_ack', "ADD COLUMN critical_ack TINYINT(1) DEFAULT 0");
  await ensureColumn('lab_results', 'critical_ack_by', 'ADD COLUMN critical_ack_by INT NULL');
  await ensureColumn('lab_results', 'critical_ack_at', 'ADD COLUMN critical_ack_at TIMESTAMP NULL');

  // Backfill request_id dari request_item_id yang sudah ada
  await pool.query(
    `UPDATE lab_results res
     JOIN lab_request_items lri ON lri.id = res.request_item_id
     SET res.request_id = lri.request_id
     WHERE res.request_id IS NULL AND res.request_item_id IS NOT NULL`
  ).catch(() => {});

  // #8 Nilai rujukan spesifik gender (fallback ke reference_min/max bila NULL)
  // Dijoin oleh routes/tests.js. Pernah hilang pada pemasangan yang dibuat
  // dari schema.sql, dan akibatnya bukan tampilan yang kosong melainkan
  // backend yang berhenti begitu halaman katalog dibuka.
  await ensureColumn('lab_tests', 'instrument_id', 'ADD COLUMN instrument_id INT NULL');
  await ensureColumn('lab_tests', 'reference_min_l', 'ADD COLUMN reference_min_l DECIMAL(12,4) NULL');
  await ensureColumn('lab_tests', 'reference_max_l', 'ADD COLUMN reference_max_l DECIMAL(12,4) NULL');
  await ensureColumn('lab_tests', 'reference_min_p', 'ADD COLUMN reference_min_p DECIMAL(12,4) NULL');
  await ensureColumn('lab_tests', 'reference_max_p', 'ADD COLUMN reference_max_p DECIMAL(12,4) NULL');

  // Nilai kritis resmi lab (mis. daftar Wallach's yang ditempel di dinding lab).
  // Berbeda dari nilai rujukan: rujukan = batas normal, kritis = ambang yang
  // menuntut pemberitahuan segera ke dokter. Tanpa kolom ini calcFlag hanya
  // bisa menebak lewat aturan 70%/130% dari rujukan.
  await ensureColumn('lab_tests', 'critical_min', 'ADD COLUMN critical_min DECIMAL(12,4) NULL');
  await ensureColumn('lab_tests', 'critical_max', 'ADD COLUMN critical_max DECIMAL(12,4) NULL');

  // Kode pemeriksaan asli dari SIMRS (mis. id_template Khanza) untuk tiap item
  // permintaan. Satu kode LIS bisa punya PULUHAN id_template di SIMRS — satu per
  // panel/kelas — sehingga menebaknya lewat tabel pemetaan saat mengembalikan
  // hasil akan sering meleset. Disimpan apa adanya saat order masuk.
  await ensureColumn('lab_request_items', 'simrs_code', 'ADD COLUMN simrs_code VARCHAR(50) NULL');

  // #2 Tabel audit trail
  await pool.query(
    `CREATE TABLE IF NOT EXISTS audit_logs (
       id BIGINT PRIMARY KEY AUTO_INCREMENT,
       user_id INT NULL,
       username VARCHAR(80),
       action VARCHAR(40) NOT NULL,
       entity VARCHAR(40) NOT NULL,
       entity_id VARCHAR(50),
       detail TEXT,
       ip VARCHAR(45),
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_entity (entity, entity_id),
       INDEX idx_created (created_at)
     )`
  ).catch((e) => console.warn('[schema] audit_logs:', e.message));

  // Permission untuk lihat audit (admin sudah punya semua via bypass)
  await pool.query(
    "INSERT IGNORE INTO permissions (code, name, menu_key) VALUES ('audit.view', 'Lihat Log Audit', 'audit')"
  ).catch(() => {});

  // --- Hasil yang tidak cocok dengan pasien mana pun ---
  //
  // Sebelumnya nomor sampel asing langsung dibuatkan pasien baru. Akibatnya di
  // lokasi pemasangan lain muncul pasien "121/WASTIAH", "1/muryati", "2/Pasien 2", dan hasil
  // milik pasien asli menempel pada pasien karangan itu. Lebih buruk lagi, karena
  // pasien karangan itu ada, worklist mengembalikan namanya ke layar alat sehingga
  // tampak sah. Sekarang hasil semacam itu ditahan di sini untuk dicocokkan orang.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS unmatched_results (
       id BIGINT PRIMARY KEY AUTO_INCREMENT,
       instrument_id INT NULL,
       sample_id VARCHAR(64),
       patient_info JSON NULL COMMENT 'identitas yang dikirim alat, bila ada',
       payload JSON NOT NULL COMMENT 'hasil terurai, menunggu dicocokkan',
       raw_message MEDIUMTEXT,
       status ENUM('pending','matched','discarded') DEFAULT 'pending',
       matched_patient_id INT NULL,
       matched_request_id INT NULL,
       handled_by INT NULL,
       handled_at TIMESTAMP NULL,
       note VARCHAR(255) NULL,
       received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_status (status, received_at),
       INDEX idx_sample (sample_id)
     )`
  ).catch((e) => console.warn('[schema] unmatched_results:', e.message));

  // --- Kontrol mutu (QC) ---
  //
  // Alat mengirim data QC lewat jalur yang sama dengan hasil pasien. Dulu data
  // itu dibuang supaya nomor kontrol tidak terdaftar sebagai pasien. Sekarang
  // disimpan: QC harian adalah satu-satunya cara tahu alat melenceng SEBELUM
  // hasil pasien ikut salah, dan wajib untuk akreditasi.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS qc_lots (
       id INT PRIMARY KEY AUTO_INCREMENT,
       instrument_id INT NOT NULL,
       test_id INT NOT NULL,
       level VARCHAR(20) NOT NULL COMMENT 'low / normal / high',
       lot_no VARCHAR(50) NULL,
       target_mean DECIMAL(12,4) NULL,
       target_sd DECIMAL(12,4) NULL,
       expires_on DATE NULL,
       is_active TINYINT(1) DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       UNIQUE KEY uq_lot (instrument_id, test_id, level, lot_no)
     )`
  ).catch((e) => console.warn('[schema] qc_lots:', e.message));

  await pool.query(
    `CREATE TABLE IF NOT EXISTS qc_results (
       id BIGINT PRIMARY KEY AUTO_INCREMENT,
       instrument_id INT NULL,
       qc_lot_id INT NULL,
       test_id INT NULL,
       test_code VARCHAR(50),
       control_id VARCHAR(50) NULL COMMENT 'nomor kontrol yang dikirim alat',
       level VARCHAR(20) NULL,
       value DECIMAL(16,4) NULL,
       unit VARCHAR(20) NULL,
       z_score DECIMAL(10,3) NULL COMMENT 'simpangan dari mean dalam satuan SD',
       verdict ENUM('in','warning','out','unknown') DEFAULT 'unknown',
       rule_broken VARCHAR(40) NULL COMMENT 'aturan Westgard yang dilanggar',
       measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_qc (instrument_id, test_id, measured_at),
       INDEX idx_verdict (verdict, measured_at)
     )`
  ).catch((e) => console.warn('[schema] qc_results:', e.message));

  // --- Pelaporan nilai kritis ---
  //
  // critical_ack sebelumnya hanya berarti "sudah dilihat". Yang dituntut
  // akreditasi dan yang berguna secara klinis adalah catatan siapa dihubungi,
  // jam berapa, dan apakah angkanya dibacakan ulang.
  await ensureColumn('lab_results', 'critical_reported_to', "ADD COLUMN critical_reported_to VARCHAR(120) NULL COMMENT 'nama dokter/perawat yang dihubungi'");
  await ensureColumn('lab_results', 'critical_reported_via', "ADD COLUMN critical_reported_via VARCHAR(30) NULL COMMENT 'telepon / WA / lisan'");
  await ensureColumn('lab_results', 'critical_readback', "ADD COLUMN critical_readback TINYINT(1) DEFAULT 0 COMMENT 'penerima membacakan ulang hasilnya'");
  await ensureColumn('lab_results', 'critical_note', 'ADD COLUMN critical_note VARCHAR(255) NULL');

  // --- Delta check ---
  //
  // Perbandingan dengan hasil sebelumnya milik pasien yang sama. Penangkap
  // sampel tertukar paling murah: HGB turun 4 g/dL dalam sehari jauh lebih
  // sering berarti tabung tertukar daripada pasien memburuk secepat itu.
  await ensureColumn('lab_results', 'delta_percent', 'ADD COLUMN delta_percent DECIMAL(10,2) NULL');
  await ensureColumn('lab_results', 'delta_flag', "ADD COLUMN delta_flag ENUM('none','check') DEFAULT 'none'");
  await ensureColumn('lab_tests', 'delta_limit_percent', "ADD COLUMN delta_limit_percent DECIMAL(10,2) NULL COMMENT 'ambang perubahan yang dianggap mencurigakan'");

  await pool.query(
    "INSERT IGNORE INTO permissions (code, name, menu_key) VALUES ('qc.view', 'Kontrol Mutu', 'qc'), ('unmatched.view', 'Hasil Belum Cocok', 'unmatched')"
  ).catch(() => {});

  // --- Riwayat perbaikan hasil ---
  //
  // PMK 43/2013 Bab IX menuntut laporan memuat "hasil asli dan hasil yang
  // diperbaiki", dan PMK 24/2022 Pasal 29 menuntut integritas data. Sebelumnya
  // perbaikan menimpa result_value SEKALIGUS result_at, sehingga nilai asli
  // maupun waktu pemeriksaan aslinya hilang tanpa jejak.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS lab_result_revisions (
       id BIGINT PRIMARY KEY AUTO_INCREMENT,
       result_id BIGINT NOT NULL,
       result_value VARCHAR(255) NULL COMMENT 'nilai SEBELUM diperbaiki',
       result_numeric DECIMAL(16,4) NULL,
       unit VARCHAR(20) NULL,
       flag VARCHAR(20) NULL,
       result_at TIMESTAMP NULL COMMENT 'waktu hasil versi ini',
       changed_by INT NULL,
       changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       reason VARCHAR(255) NULL,
       INDEX idx_result (result_id, changed_at)
     )`
  ).catch((e) => console.warn('[schema] lab_result_revisions:', e.message));

  await ensureColumn('lab_results', 'corrected_at', 'ADD COLUMN corrected_at TIMESTAMP NULL');
  await ensureColumn('lab_results', 'corrected_by', 'ADD COLUMN corrected_by INT NULL');
  await ensureColumn('lab_results', 'revision_count', 'ADD COLUMN revision_count INT DEFAULT 0');

  // --- Kelengkapan laporan hasil (PMK 43/2013 Bab IX, komponen 4, 5, 7, 11) ---
  //
  // requested_by menunjuk user LIS, bukan dokter yang meminta pemeriksaan.
  await ensureColumn('lab_requests', 'clinician_name', "ADD COLUMN clinician_name VARCHAR(120) NULL COMMENT 'dokter pemohon'");
  await ensureColumn('lab_requests', 'clinician_unit', "ADD COLUMN clinician_unit VARCHAR(120) NULL COMMENT 'ruangan/poli/alamat pemohon'");
  await ensureColumn('lab_requests', 'specimen_type', "ADD COLUMN specimen_type VARCHAR(60) NULL COMMENT 'mis. darah vena, urin'");
  await ensureColumn('lab_requests', 'received_at', "ADD COLUMN received_at TIMESTAMP NULL COMMENT 'waktu spesimen diterima lab'");
  await ensureColumn('lab_requests', 'specimen_note', "ADD COLUMN specimen_note VARCHAR(255) NULL COMMENT 'tanggapan mutu/kecukupan spesimen'");

  // --- Pemisahan hak akses (PMK 24/2022 Pasal 30 ayat 3) ---
  //
  // Regulasi memisahkan penginputan data, PERBAIKAN data, dan melihat data.
  // Sebelumnya memasukkan hasil dan mengubah hasil yang sudah tersimpan sama-sama
  // bergantung results.manage, padahal justru perbaikan yang perlu dibatasi.
  await pool.query(
    "INSERT IGNORE INTO permissions (code, name, menu_key) VALUES ('results.correct', 'Perbaiki/Hapus Hasil', 'results')"
  ).catch(() => {});

  // Diberikan otomatis ke peran yang sudah punya results.manage supaya tidak ada
  // yang kehilangan kemampuan saat pembaruan ini dipasang. Admin bisa mencabutnya.
  await pool.query(
    `INSERT IGNORE INTO role_permissions (role_id, permission_id)
     SELECT rp.role_id, (SELECT id FROM permissions WHERE code = 'results.correct')
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE p.code = 'results.manage'`
  ).catch((e) => console.warn('[schema] hak results.correct:', e.message));

  // --- Pemantapan Mutu Eksternal (PMK 411/2010 Pasal 6 huruf a) ---
  await pool.query(
    `CREATE TABLE IF NOT EXISTS pme_programs (
       id INT PRIMARY KEY AUTO_INCREMENT,
       name VARCHAR(150) NOT NULL COMMENT 'mis. PNPME Kemenkes, PME Hematologi',
       organizer VARCHAR(150) NULL COMMENT 'penyelenggara',
       cycle VARCHAR(50) NULL COMMENT 'siklus/periode, mis. Siklus 1 2026',
       period_start DATE NULL,
       period_end DATE NULL,
       is_active TINYINT(1) DEFAULT 1,
       note VARCHAR(255) NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`
  ).catch((e) => console.warn('[schema] pme_programs:', e.message));

  await pool.query(
    `CREATE TABLE IF NOT EXISTS pme_results (
       id BIGINT PRIMARY KEY AUTO_INCREMENT,
       program_id INT NOT NULL,
       test_id INT NULL,
       test_code VARCHAR(50) NULL,
       sample_code VARCHAR(50) NULL COMMENT 'kode bahan uji dari penyelenggara',
       our_value DECIMAL(16,4) NULL COMMENT 'hasil laboratorium kita',
       target_value DECIMAL(16,4) NULL COMMENT 'nilai rujukan/konsensus',
       target_sd DECIMAL(16,4) NULL,
       z_score DECIMAL(10,3) NULL COMMENT 'SDI, simpangan dari konsensus',
       verdict ENUM('baik','ragu','buruk','belum') DEFAULT 'belum',
       reported_at DATE NULL,
       note VARCHAR(255) NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_program (program_id)
     )`
  ).catch((e) => console.warn('[schema] pme_results:', e.message));

  await pool.query(
    "INSERT IGNORE INTO permissions (code, name, menu_key) VALUES ('pme.view', 'Pemantapan Mutu Eksternal', 'pme')"
  ).catch(() => {});
}

/** Tambah kolom hanya jika belum ada (idempoten) */
async function ensureColumn(table, column, alterClause) {
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (!cols || cols.length === 0) {
    await pool.query(`ALTER TABLE ${table} ${alterClause}`).catch((e) =>
      console.warn(`[schema] ${table}.${column}:`, e.message)
    );
    console.log(`[schema] Kolom ${table}.${column} ditambahkan`);
  }
}

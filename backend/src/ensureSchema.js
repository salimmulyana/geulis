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

  // --- Pengesahan dokter penanggung jawab ---
  //
  // Sebelum ini hasil hanya punya satu tanda tangan: verified_by. PMK 43/2013
  // Bab IX menuntut laporan memuat penanggung jawab yang mengesahkan, dan itu
  // peran yang berbeda dari analis yang memeriksa. Menggabungkan keduanya
  // membuat "sudah diperiksa" dan "sudah disahkan" tidak bisa dibedakan.
  await ensureColumn('lab_results', 'authorized_by', 'ADD COLUMN authorized_by INT NULL');
  await ensureColumn('lab_results', 'authorized_at', 'ADD COLUMN authorized_at TIMESTAMP NULL');
  await pool.query(
    "INSERT IGNORE INTO permissions (code, name, menu_key) VALUES ('results.authorize', 'Mengesahkan Hasil', 'pengesahan')"
  ).catch(() => {});
  await pool.query(
    "INSERT IGNORE INTO roles (code, name) VALUES ('dokter_pj', 'Dokter Penanggung Jawab')"
  ).catch(() => {});

  // Boleh tidaknya satu orang memverifikasi sekaligus mengesahkan hasil yang
  // sama. Bawaannya TIDAK, karena dua tanda tangan dari orang yang sama tidak
  // menambah pemeriksaan apa pun. Tetapi lab kecil sering hanya punya satu
  // orang berwenang, dan memaksakan aturan itu di sana hanya akan membuat
  // pengesahan dilewati sama sekali.
  await pool.query(
    "INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('pengesahan.pemeriksa_boleh_mengesahkan', '0')"
  ).catch(() => {});

  // Target waktu tunggu hasil, dalam menit, per prioritas. Angka bawaan ini
  // hanya titik awal yang masuk akal — tiap lab menetapkan sendiri sesuai
  // kemampuan alat dan jam kerjanya, dan target yang tidak pernah tercapai
  // sama tidak bergunanya dengan tidak punya target.
  await pool.query(
    "INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('tat.target_normal','180'), ('tat.target_cito','60'), ('tat.target_stat','30')"
  ).catch(() => {});

  // --- Portal hasil untuk pasien ---
  //
  // Ini satu-satunya bagian sistem yang mengeluarkan hasil dari jaringan
  // tertutup, jadi asumsinya dibalik: anggap tautannya BOCOR, lalu rancang
  // supaya bocornya tidak cukup.
  //
  // Token disimpan sebagai HASH, bukan apa adanya. Kalau basis data bocor —
  // lewat cadangan yang salah tempat, dump untuk keperluan lain, atau akses
  // baca — token yang tersimpan apa adanya langsung bisa dipakai membuka hasil
  // setiap pasien. Hash membuat kebocoran basis data tidak otomatis menjadi
  // kebocoran hasil.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS portal_tokens (
       id INT PRIMARY KEY AUTO_INCREMENT,
       request_id INT NOT NULL,
       token_hash CHAR(64) NOT NULL UNIQUE COMMENT 'sha256 dari token; token asli tidak pernah disimpan',
       dibuat_oleh INT NULL,
       dibuat_pada TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       kedaluwarsa_pada TIMESTAMP NOT NULL,
       dicabut_pada TIMESTAMP NULL,
       dicabut_oleh INT NULL,
       gagal_beruntun INT NOT NULL DEFAULT 0,
       terkunci_sampai TIMESTAMP NULL,
       KEY idx_request (request_id),
       FOREIGN KEY (request_id) REFERENCES lab_requests(id) ON DELETE CASCADE
     )`
  ).catch((e) => console.warn('[schema] portal_tokens:', e.message));

  // Setiap percobaan akses dicatat, yang GAGAL maupun yang berhasil.
  //
  // Yang gagal justru lebih penting: rentetan kegagalan pada satu token adalah
  // satu-satunya tanda seseorang sedang menebak tanggal lahir, dan tanpa catatan
  // itu percobaan penebakan tidak meninggalkan jejak apa pun.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS portal_access_log (
       id BIGINT PRIMARY KEY AUTO_INCREMENT,
       token_id INT NULL,
       berhasil TINYINT(1) NOT NULL,
       sebab VARCHAR(40) NULL,
       ip VARCHAR(45),
       user_agent VARCHAR(255),
       pada TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       KEY idx_token (token_id, pada),
       KEY idx_pada (pada)
     )`
  ).catch((e) => console.warn('[schema] portal_access_log:', e.message));

  // Portal MATI secara bawaan. Fitur yang membuka data pasien ke luar jaringan
  // tidak boleh menyala hanya karena ikut terpasang.
  await pool.query(
    "INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('portal.aktif','0'), ('portal.masa_berlaku_hari','30'), ('portal.maks_gagal','5'), ('portal.kunci_menit','30')"
  ).catch(() => {});

  // --- Tanda tangan elektronik (belum tersertifikasi) ---
  //
  // Bukan TTE tersertifikasi BSrE. Yang dijamin di sini bukan identitas hukum
  // penanda tangan, melainkan KEUTUHAN isi: bila satu angka pada laporan diubah
  // setelah disahkan, tanda tangannya tidak lagi cocok dan itu bisa dibuktikan.
  // Ini pengganti sementara, dan laporannya harus menyatakan demikian.
  await ensureColumn('lab_requests', 'ttd_hash', "ADD COLUMN ttd_hash CHAR(64) NULL COMMENT 'sidik isi laporan saat disahkan'");
  await ensureColumn('lab_requests', 'ttd_tanda', 'ADD COLUMN ttd_tanda VARCHAR(128) NULL');
  await ensureColumn('lab_requests', 'ttd_oleh', 'ADD COLUMN ttd_oleh INT NULL');
  await ensureColumn('lab_requests', 'ttd_pada', 'ADD COLUMN ttd_pada TIMESTAMP NULL');

  // Kode verifikasi yang dimuat QR pada laporan cetak.
  //
  // ACAK, bukan diturunkan dari tanda tangannya. Kode yang diturunkan berarti
  // memasang potongan tanda tangan di kertas yang beredar bebas — dan potongan
  // itu tidak pernah bisa diganti tanpa menandatangani ulang. Kode acak bisa
  // dicabut sendiri bila selebarannya tersebar.
  await ensureColumn('lab_requests', 'ttd_kode', "ADD COLUMN ttd_kode VARCHAR(24) NULL COMMENT 'kode pada QR laporan'");
  await pool.query('CREATE INDEX idx_ttd_kode ON lab_requests (ttd_kode)').catch(() => {});

  // --- Template interpretasi ---
  //
  // Kalimat interpretasi yang sama diketik ulang puluhan kali seminggu, dan
  // setiap pengetikan ulang adalah kesempatan salah ketik pada bagian laporan
  // yang justru paling dibaca klinisi.
  //
  // Template TIDAK PERNAH diterapkan sendiri, hanya diusulkan. Interpretasi
  // yang muncul tanpa dipilih manusia adalah pernyataan yang tidak pernah dibuat
  // dokter tetapi ikut ditandatanganinya.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS interpretation_templates (
       id INT PRIMARY KEY AUTO_INCREMENT,
       code VARCHAR(40) NOT NULL UNIQUE,
       name VARCHAR(150) NOT NULL,
       test_id INT NULL COMMENT 'NULL = berlaku umum, tidak terikat satu pemeriksaan',
       pemicu_flag VARCHAR(20) NULL COMMENT 'usulkan bila hasil berpenanda ini',
       isi TEXT NOT NULL,
       is_active TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       KEY idx_test (test_id, is_active)
     )`
  ).catch((e) => console.warn('[schema] interpretation_templates:', e.message));

  // Interpretasi disimpan pada PERMINTAAN, bukan per hasil. Klinisi membaca satu
  // kesimpulan untuk satu lembar, bukan dua puluh kesimpulan untuk dua puluh
  // angka — dan interpretasi per baris membuat lembar yang saling bertentangan.
  await ensureColumn('lab_requests', 'interpretasi', 'ADD COLUMN interpretasi TEXT NULL');
  await ensureColumn('lab_requests', 'interpretasi_oleh', 'ADD COLUMN interpretasi_oleh INT NULL');
  await ensureColumn('lab_requests', 'interpretasi_pada', 'ADD COLUMN interpretasi_pada TIMESTAMP NULL');

  // is_active yang NULL membuat pemeriksaan HILANG, bukan nonaktif.
  //
  // Ditemukan pada pemasangan nyata: tiga belas pemeriksaan klinis inti — HGB,
  // WBC, PLT, RBC, HCT dan lainnya — tersimpan dengan is_active NULL, sementara
  // penanda alat seperti "Fragments?" dan "Blasts/Abn_Lympho?" justru aktif.
  //
  // NULL bukan 0. Setiap kueri memakai "WHERE is_active = 1", sehingga baris itu
  // tidak muncul di daftar aktif MAUPUN di daftar nonaktif. Pemeriksaan itu
  // lenyap tanpa ada tempat untuk menemukannya kembali, dan tidak ada galat.
  //
  // Diisi 1 karena NULL tidak pernah bisa dihasilkan dari layar mana pun —
  // artinya itu bukan keputusan seseorang untuk menonaktifkan, melainkan kolom
  // yang tidak terisi saat pendaftaran otomatis dari alat.
  const [nullAktif] = await pool.query('SELECT COUNT(*) AS n FROM lab_tests WHERE is_active IS NULL').catch(() => [[{ n: 0 }]]);
  if (nullAktif?.[0]?.n > 0) {
    await pool.query('UPDATE lab_tests SET is_active = 1 WHERE is_active IS NULL');
    console.log(`[schema] ${nullAktif[0].n} pemeriksaan dengan is_active NULL diaktifkan — sebelumnya tidak terlihat di layar mana pun`);
  }
  await pool.query('ALTER TABLE lab_tests MODIFY is_active TINYINT(1) NOT NULL DEFAULT 1')
    .catch((e) => console.warn('[schema] lab_tests.is_active:', e.message));

  // Kode LOINC per pemeriksaan — prasyarat pengiriman ke SATUSEHAT lewat FHIR.
  //
  // Tanpa ini, yang terkirim hanya nama lokal, dan "HGB", "Hb", "Hemoglobin",
  // "HEMOGLOBIN (HB)" adalah empat hal berbeda bagi sistem penerima meskipun
  // sama bagi manusia.
  await ensureColumn('lab_tests', 'loinc_code', "ADD COLUMN loinc_code VARCHAR(12) NULL COMMENT 'mis. 718-7'");
  await ensureColumn('lab_tests', 'loinc_name', 'ADD COLUMN loinc_name VARCHAR(200) NULL');

  // Diagnosis klinis pada permintaan.
  //
  // Bukan kelengkapan administrasi. Nilai yang sama berarti berbeda tergantung
  // pertanyaan klinisnya: hemoglobin 9 pada pasien pascaoperasi adalah temuan
  // yang diharapkan, pada pemeriksaan rutin adalah temuan yang perlu ditelusuri.
  // Verifikator yang tidak melihat konteksnya hanya bisa menilai angkanya.
  await ensureColumn('lab_requests', 'diagnosa_klinis', 'ADD COLUMN diagnosa_klinis VARCHAR(255) NULL');

  // --- Reagen ---
  //
  // Sisa stok disimpan PER LOT, bukan per reagen. Yang menentukan boleh dipakai
  // atau tidak adalah lotnya: satu lot bisa kedaluwarsa sementara lot lain dari
  // reagen yang sama masih baik. Stok yang dijumlahkan per jenis menyembunyikan
  // itu, dan lab yang melihat "stok 12" akan terkejut menemukan sembilan di
  // antaranya sudah lewat tanggal.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS reagents (
       id INT PRIMARY KEY AUTO_INCREMENT,
       code VARCHAR(50) NOT NULL UNIQUE,
       name VARCHAR(150) NOT NULL,
       satuan VARCHAR(30) NULL,
       stok_minimum DECIMAL(12,2) NULL COMMENT 'ambang peringatan stok menipis',
       is_active TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`
  ).catch((e) => console.warn('[schema] reagents:', e.message));

  await pool.query(
    `CREATE TABLE IF NOT EXISTS reagent_lots (
       id BIGINT PRIMARY KEY AUTO_INCREMENT,
       reagent_id INT NOT NULL,
       lot_no VARCHAR(50) NOT NULL,
       expires_on DATE NOT NULL,
       sisa DECIMAL(12,2) NOT NULL DEFAULT 0,
       harga_satuan DECIMAL(14,2) NULL COMMENT 'untuk menghitung biaya per pemeriksaan',
       diterima_on DATE NULL,
       catatan VARCHAR(255) NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       UNIQUE KEY uk_lot (reagent_id, lot_no),
       KEY idx_kedaluwarsa (expires_on),
       FOREIGN KEY (reagent_id) REFERENCES reagents(id) ON DELETE CASCADE
     )`
  ).catch((e) => console.warn('[schema] reagent_lots:', e.message));

  // Setiap perubahan stok dicatat sebagai gerakan, dan sisa dihitung dari
  // gerakan. Menyunting angka sisa secara langsung membuat selisih stok tidak
  // bisa ditelusuri -- dan selisih stok reagen hampir selalu berarti salah satu
  // dari dua hal yang keduanya perlu diketahui: pencatatan yang terlewat, atau
  // pemakaian yang tidak tercatat.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS reagent_movements (
       id BIGINT PRIMARY KEY AUTO_INCREMENT,
       lot_id BIGINT NOT NULL,
       jenis ENUM('masuk','pakai','buang','koreksi') NOT NULL,
       jumlah DECIMAL(12,2) NOT NULL,
       alasan VARCHAR(255) NULL,
       user_id INT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       KEY idx_lot (lot_id, created_at),
       FOREIGN KEY (lot_id) REFERENCES reagent_lots(id) ON DELETE CASCADE
     )`
  ).catch((e) => console.warn('[schema] reagent_movements:', e.message));

  // Pemakaian reagen per pemeriksaan, untuk menghitung biaya per pemeriksaan.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS test_reagent_usage (
       id INT PRIMARY KEY AUTO_INCREMENT,
       test_id INT NOT NULL,
       reagent_id INT NOT NULL,
       jumlah_per_periksa DECIMAL(12,4) NOT NULL,
       UNIQUE KEY uk_test_reagent (test_id, reagent_id),
       FOREIGN KEY (test_id) REFERENCES lab_tests(id) ON DELETE CASCADE,
       FOREIGN KEY (reagent_id) REFERENCES reagents(id) ON DELETE CASCADE
     )`
  ).catch((e) => console.warn('[schema] test_reagent_usage:', e.message));

  await pool.query(
    "INSERT IGNORE INTO permissions (code, name, menu_key) VALUES ('reagen.view', 'Reagen', 'reagen')"
  ).catch(() => {});

  // Berapa hari sebelum kedaluwarsa reagen mulai diperingatkan. Tiga puluh hari
  // memberi waktu memesan ulang; peringatan pada hari-H hanya memberi tahu
  // bahwa pemeriksaan hari itu harus dibatalkan.
  await pool.query(
    "INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('reagen.peringatan_hari', '30')"
  ).catch(() => {});

  // --- Nilai rujukan menurut umur ---
  //
  // Sebelum ini rujukan hanya bisa dibedakan menurut jenis kelamin. Pada pasien
  // anak, apalagi neonatus, penandaannya salah secara sistematis — dan salahnya
  // sunyi: hemoglobin 18 g/dL normal untuk bayi tiga hari, tetapi tinggi untuk
  // orang dewasa. Tidak ada galat, hanya penanda yang keliru pada rekam medis.
  //
  // Umur disimpan dalam HARI, bukan tahun. Rentang yang paling menentukan justru
  // di bawah satu tahun: neonatus 0-3 hari berbeda dari 4-30 hari, dan keduanya
  // berbeda dari bayi tiga bulan. Satuan tahun tidak bisa menyatakan itu.
  //
  // Batas atas EKSKLUSIF (umur_max_hari tidak termasuk). Dengan begitu rentang
  // berurutan bisa ditulis 0-30, 30-365 tanpa celah dan tanpa tumpang tindih;
  // batas inklusif memaksa menulis 29 dan 364, yang mengundang salah ketik.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS reference_ranges (
       id INT PRIMARY KEY AUTO_INCREMENT,
       test_id INT NOT NULL,
       gender ENUM('L','P') NULL COMMENT 'NULL = berlaku untuk semua',
       umur_min_hari INT NULL COMMENT 'NULL = tanpa batas bawah',
       umur_max_hari INT NULL COMMENT 'eksklusif; NULL = tanpa batas atas',
       kondisi VARCHAR(40) NULL COMMENT 'mis. hamil',
       label VARCHAR(120) NOT NULL COMMENT 'yang dicetak di lembar hasil',
       ref_min DECIMAL(12,4) NULL,
       ref_max DECIMAL(12,4) NULL,
       critical_min DECIMAL(12,4) NULL,
       critical_max DECIMAL(12,4) NULL,
       sumber VARCHAR(200) NULL COMMENT 'rujukan pustaka atau sisipan reagen',
       is_active TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       KEY idx_test (test_id, is_active),
       FOREIGN KEY (test_id) REFERENCES lab_tests(id) ON DELETE CASCADE
     )`
  ).catch((e) => console.warn('[schema] reference_ranges:', e.message));

  // Rujukan yang DIPAKAI ikut disimpan bersama hasilnya.
  //
  // Kalau tidak, lembar hasil menghitung ulang saat dicetak — dan hasil bayi
  // yang dicetak ulang setahun kemudian akan dinilai dengan rujukan dewasa,
  // karena umurnya sudah berbeda. Yang tercetak harus sama dengan yang dinilai
  // saat hasil dikeluarkan.
  await ensureColumn('lab_results', 'ref_min_dipakai', 'ADD COLUMN ref_min_dipakai DECIMAL(12,4) NULL');
  await ensureColumn('lab_results', 'ref_max_dipakai', 'ADD COLUMN ref_max_dipakai DECIMAL(12,4) NULL');
  await ensureColumn('lab_results', 'rujukan_label', 'ADD COLUMN rujukan_label VARCHAR(120) NULL');

  // Jenis kelamin yang tidak diketahui tidak boleh diam-diam menjadi laki-laki.
  //
  // Kolom gender dulu DEFAULT 'L'. Pasien yang jenis kelaminnya belum terisi
  // akan dinilai dengan rujukan laki-laki tanpa ada yang menyadarinya. Lebih
  // baik NULL: rujukan spesifik gender dilewati, dan yang dipakai rujukan umum.
  await pool.query(
    "ALTER TABLE patients MODIFY gender ENUM('L','P') NULL DEFAULT NULL"
  ).catch((e) => console.warn('[schema] patients.gender:', e.message));

  await pool.query(
    "INSERT IGNORE INTO permissions (code, name, menu_key) VALUES ('qc.view', 'Kontrol Mutu', 'qc'), ('unmatched.view', 'Hasil Belum Cocok', 'unmatched'), ('rujukan.manage', 'Nilai Rujukan', 'rujukan')"
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

  // ============ Modul lanjutan (mutu & layanan) ============

  // Verifikasi kelayakan spesimen (pra-analitik). Status 'rejected' ditambahkan
  // supaya spesimen tak layak menolak permintaannya, bukan sekadar ditandai.
  await pool.query(
    "ALTER TABLE lab_requests MODIFY status ENUM('pending','collected','processing','completed','cancelled','rejected') DEFAULT 'pending'"
  ).catch((e) => console.warn('[schema] status rejected:', e.message));
  await ensureColumn('lab_requests', 'spesimen_layak', 'ADD COLUMN spesimen_layak TINYINT(1) NULL');
  await ensureColumn('lab_requests', 'spesimen_kondisi', 'ADD COLUMN spesimen_kondisi VARCHAR(80) NULL');
  await ensureColumn('lab_requests', 'spesimen_verif_oleh', 'ADD COLUMN spesimen_verif_oleh INT NULL');
  await ensureColumn('lab_requests', 'spesimen_verif_pada', 'ADD COLUMN spesimen_verif_pada TIMESTAMP NULL');
  await ensureColumn('lab_requests', 'spesimen_verif_catatan', 'ADD COLUMN spesimen_verif_catatan VARCHAR(255) NULL');

  // Duplo
  await ensureColumn('lab_results', 'duplo_nilai', 'ADD COLUMN duplo_nilai VARCHAR(100) NULL');
  await ensureColumn('lab_results', 'duplo_selisih_persen', 'ADD COLUMN duplo_selisih_persen DECIMAL(10,2) NULL');
  await ensureColumn('lab_results', 'duplo_dalam_batas', 'ADD COLUMN duplo_dalam_batas TINYINT(1) NULL');
  await ensureColumn('lab_results', 'duplo_oleh', 'ADD COLUMN duplo_oleh INT NULL');
  await ensureColumn('lab_results', 'duplo_pada', 'ADD COLUMN duplo_pada TIMESTAMP NULL');

  // Hasil naratif
  await pool.query(
    `CREATE TABLE IF NOT EXISTS hasil_naratif (
       id BIGINT PRIMARY KEY AUTO_INCREMENT, request_id INT NOT NULL,
       jenis VARCHAR(30) NOT NULL, isi JSON NOT NULL,
       verified_by INT NULL, verified_at TIMESTAMP NULL,
       dibuat_oleh INT NULL, dibuat_pada TIMESTAMP DEFAULT CURRENT_TIMESTAMP, diperbarui_pada TIMESTAMP NULL,
       UNIQUE KEY uk_req_jenis (request_id, jenis),
       FOREIGN KEY (request_id) REFERENCES lab_requests(id) ON DELETE CASCADE)`
  ).catch((e) => console.warn('[schema] hasil_naratif:', e.message));

  // Bank Darah
  await pool.query(
    `CREATE TABLE IF NOT EXISTS blood_stock (
       id BIGINT PRIMARY KEY AUTO_INCREMENT, no_kantong VARCHAR(60) NOT NULL UNIQUE,
       gol_darah ENUM('A','B','AB','O') NOT NULL, rhesus ENUM('+','-') NOT NULL,
       komponen VARCHAR(20) NOT NULL, volume_ml INT NULL, sumber VARCHAR(60) NULL, refrigerator VARCHAR(60) NULL,
       tgl_masuk DATE NOT NULL DEFAULT (CURDATE()), tgl_kedaluwarsa DATE NOT NULL,
       status ENUM('tersedia','dipesan','dikeluarkan','kedaluwarsa','dibuang','rusak') NOT NULL DEFAULT 'tersedia',
       dibuat_pada TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_cari (status, gol_darah, rhesus, komponen))`
  ).catch((e) => console.warn('[schema] blood_stock:', e.message));
  await pool.query(
    `CREATE TABLE IF NOT EXISTS transfusion_request (
       id BIGINT PRIMARY KEY AUTO_INCREMENT, no_permintaan VARCHAR(40) NOT NULL UNIQUE,
       patient_id INT NULL, nama_pasien VARCHAR(200) NOT NULL, no_rm VARCHAR(50) NULL,
       gol_darah ENUM('A','B','AB','O') NULL, rhesus ENUM('+','-') NULL,
       komponen VARCHAR(20) NOT NULL, jumlah INT NOT NULL DEFAULT 1,
       ruang VARCHAR(100) NULL, dokter VARCHAR(120) NULL, indikasi VARCHAR(255) NULL, hb_terakhir DECIMAL(5,2) NULL,
       status ENUM('baru','crossmatch','siap','dikeluarkan','selesai','batal') NOT NULL DEFAULT 'baru',
       tgl_permintaan TIMESTAMP DEFAULT CURRENT_TIMESTAMP, dibuat_oleh INT NULL)`
  ).catch((e) => console.warn('[schema] transfusion_request:', e.message));
  await pool.query(
    `CREATE TABLE IF NOT EXISTS crossmatch (
       id BIGINT PRIMARY KEY AUTO_INCREMENT, request_id BIGINT NOT NULL, stock_id BIGINT NOT NULL,
       metode VARCHAR(40) NULL, mayor VARCHAR(40) NULL, minor VARCHAR(40) NULL, auto_control VARCHAR(40) NULL,
       hasil ENUM('compatible','incompatible','pending') NOT NULL, peringatan VARCHAR(255) NULL, catatan VARCHAR(255) NULL,
       oleh INT NULL, tgl TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_req (request_id),
       FOREIGN KEY (request_id) REFERENCES transfusion_request(id) ON DELETE CASCADE)`
  ).catch((e) => console.warn('[schema] crossmatch:', e.message));
  await pool.query(
    `CREATE TABLE IF NOT EXISTS transfusion_reaction (
       id BIGINT PRIMARY KEY AUTO_INCREMENT, patient_id INT NULL, nama_pasien VARCHAR(200) NOT NULL, no_rm VARCHAR(50) NULL,
       no_kantong VARCHAR(60) NULL, komponen VARCHAR(20) NULL, gol_darah VARCHAR(4) NULL, ruang VARCHAR(100) NULL,
       jenis_reaksi VARCHAR(120) NOT NULL, tindakan TEXT NULL, keterangan TEXT NULL,
       tgl TIMESTAMP DEFAULT CURRENT_TIMESTAMP, dilaporkan_oleh INT NULL)`
  ).catch((e) => console.warn('[schema] transfusion_reaction:', e.message));

  // Mikrobiologi kultur + antibiogram
  await pool.query(
    `CREATE TABLE IF NOT EXISTS micro_organism (id INT PRIMARY KEY AUTO_INCREMENT, nama VARCHAR(150) NOT NULL UNIQUE, gram VARCHAR(20) NULL, aktif TINYINT(1) NOT NULL DEFAULT 1)`
  ).catch((e) => console.warn('[schema] micro_organism:', e.message));
  await pool.query(
    `CREATE TABLE IF NOT EXISTS micro_antibiotic (id INT PRIMARY KEY AUTO_INCREMENT, kode VARCHAR(20) NOT NULL UNIQUE, nama VARCHAR(120) NOT NULL, aktif TINYINT(1) NOT NULL DEFAULT 1)`
  ).catch((e) => console.warn('[schema] micro_antibiotic:', e.message));
  await pool.query(
    `CREATE TABLE IF NOT EXISTS micro_culture (
       id BIGINT PRIMARY KEY AUTO_INCREMENT, request_id INT NULL, nama_pasien VARCHAR(200) NOT NULL, no_rm VARCHAR(50) NULL,
       spesimen VARCHAR(60) NULL, tgl_tanam DATE NULL, media VARCHAR(120) NULL,
       pertumbuhan ENUM('menunggu','tidak ada','ada') NOT NULL DEFAULT 'menunggu',
       organism_id INT NULL, catatan TEXT NULL, status ENUM('proses','selesai','batal') NOT NULL DEFAULT 'proses',
       verified_by INT NULL, verified_at TIMESTAMP NULL, dibuat_oleh INT NULL, dibuat_pada TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       KEY idx_req (request_id))`
  ).catch((e) => console.warn('[schema] micro_culture:', e.message));
  await pool.query(
    `CREATE TABLE IF NOT EXISTS micro_ast (
       id BIGINT PRIMARY KEY AUTO_INCREMENT, culture_id BIGINT NOT NULL, antibiotic_id INT NOT NULL,
       metode VARCHAR(30) NULL, zona_mm DECIMAL(5,1) NULL, mic VARCHAR(30) NULL,
       sir ENUM('S','I','R') NULL, sumber_interpretasi VARCHAR(20) NOT NULL DEFAULT 'manual',
       UNIQUE KEY uk_kultur_ab (culture_id, antibiotic_id),
       FOREIGN KEY (culture_id) REFERENCES micro_culture(id) ON DELETE CASCADE)`
  ).catch((e) => console.warn('[schema] micro_ast:', e.message));
  await pool.query(
    `INSERT IGNORE INTO micro_organism (nama, gram) VALUES
     ('Escherichia coli','negatif'),('Klebsiella pneumoniae','negatif'),('Staphylococcus aureus','positif'),
     ('Pseudomonas aeruginosa','negatif'),('Streptococcus pneumoniae','positif'),('Salmonella sp','negatif'),
     ('Acinetobacter baumannii','negatif'),('Enterococcus faecalis','positif'),('Candida albicans','-'),('Proteus mirabilis','negatif')`
  ).catch(() => {});
  await pool.query(
    `INSERT IGNORE INTO micro_antibiotic (kode, nama) VALUES
     ('AMP','Ampicillin'),('AMC','Amoxicillin-Clavulanate'),('CTX','Cefotaxime'),('CRO','Ceftriaxone'),('CAZ','Ceftazidime'),
     ('FEP','Cefepime'),('MEM','Meropenem'),('GEN','Gentamicin'),('AMK','Amikacin'),('CIP','Ciprofloxacin'),('LVX','Levofloxacin'),
     ('SXT','Cotrimoxazole'),('TZP','Piperacillin-Tazobactam'),('VAN','Vancomycin'),('ERY','Erythromycin'),('CLI','Clindamycin'),('NIT','Nitrofurantoin'),('OXA','Oxacillin')`
  ).catch(() => {});

  await pool.query(
    "INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('tat.target_normal','180'),('tat.target_cito','60'),('tat.target_stat','30')"
  ).catch(() => {});
  await pool.query(
    "INSERT IGNORE INTO permissions (code, name, menu_key) VALUES ('bankdarah.view','Bank Darah','bank-darah'),('mikro.view','Mikrobiologi','mikrobiologi')"
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

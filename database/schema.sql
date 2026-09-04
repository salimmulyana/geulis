-- GeuLIS - Laboratory Information System
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS geulis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE geulis;

-- Roles & permissions
CREATE TABLE roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE permissions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  menu_key VARCHAR(50) NOT NULL
);

CREATE TABLE role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  role_id INT NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- Patients
CREATE TABLE patients (
  id INT PRIMARY KEY AUTO_INCREMENT,
  medical_record_no VARCHAR(50) NOT NULL,
  order_no VARCHAR(50) COMMENT 'Nomor order lab / SIMRS',
  name VARCHAR(200) NOT NULL,
  birth_date DATE,
  gender ENUM('L', 'P') DEFAULT 'L',
  phone VARCHAR(30),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_mrn (medical_record_no)
);

-- Lab test catalog
CREATE TABLE lab_tests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  unit VARCHAR(30),
  reference_min DECIMAL(12,4),
  reference_max DECIMAL(12,4),
  -- Alat asal pemeriksaan ini, bila memang berasal dari satu alat tertentu.
  -- Kolom ini dijoin oleh routes/tests.js; tanpa dia, halaman katalog
  -- membuat backend berhenti pada pemasangan yang baru.
  -- Tanpa FOREIGN KEY: tabel instruments baru dibuat setelah tabel ini, dan
  -- menambahkan kunci asing di sini membuat pemuatan schema.sql gagal pada
  -- pemasangan yang baru.
  instrument_id INT,
  is_active TINYINT(1) DEFAULT 1
);

-- Lab requests (permintaan)
CREATE TABLE lab_requests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  request_no VARCHAR(30) NOT NULL UNIQUE,
  patient_id INT NOT NULL,
  simrs_order_id VARCHAR(50),
  priority ENUM('normal', 'cito', 'stat') DEFAULT 'normal',
  status ENUM('pending', 'collected', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
  requested_by INT,
  notes TEXT,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  collected_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (requested_by) REFERENCES users(id)
);

CREATE TABLE lab_request_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  request_id INT NOT NULL,
  test_id INT NOT NULL,
  status ENUM('pending', 'processing', 'done', 'cancelled') DEFAULT 'pending',
  FOREIGN KEY (request_id) REFERENCES lab_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (test_id) REFERENCES lab_tests(id)
);

-- Lab results
CREATE TABLE lab_results (
  id INT PRIMARY KEY AUTO_INCREMENT,
  request_item_id INT,
  patient_id INT NOT NULL,
  test_id INT NOT NULL,
  result_value VARCHAR(100),
  result_numeric DECIMAL(14,4),
  unit VARCHAR(30),
  flag ENUM('normal', 'low', 'high', 'critical', 'abnormal') DEFAULT 'normal',
  status ENUM('preliminary', 'final', 'corrected') DEFAULT 'final',
  instrument_id INT,
  raw_message TEXT,
  verified_by INT,
  result_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP NULL,
  FOREIGN KEY (request_item_id) REFERENCES lab_request_items(id) ON DELETE SET NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (test_id) REFERENCES lab_tests(id),
  FOREIGN KEY (verified_by) REFERENCES users(id)
);

-- Laboratory instruments
CREATE TABLE instruments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  manufacturer VARCHAR(100),
  model VARCHAR(100),
  protocol ENUM('astm', 'hl7', 'json', 'xml', 'tcp_json') DEFAULT 'astm',
  host VARCHAR(100) DEFAULT '0.0.0.0',
  port INT DEFAULT 5000,
  is_active TINYINT(1) DEFAULT 1,
  last_connected TIMESTAMP NULL,
  config_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE instrument_test_map (
  id INT PRIMARY KEY AUTO_INCREMENT,
  instrument_id INT NOT NULL,
  instrument_test_code VARCHAR(50) NOT NULL,
  test_id INT NOT NULL,
  UNIQUE KEY uk_inst_code (instrument_id, instrument_test_code),
  FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
  FOREIGN KEY (test_id) REFERENCES lab_tests(id)
);

-- SIMRS API mapping
CREATE TABLE simrs_mappings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  mapping_type ENUM('patient', 'order', 'result', 'test') NOT NULL,
  lis_field VARCHAR(100) NOT NULL,
  simrs_field VARCHAR(100) NOT NULL,
  transform_rule VARCHAR(255),
  is_active TINYINT(1) DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE simrs_config (
  id INT PRIMARY KEY AUTO_INCREMENT,
  base_url VARCHAR(255) NOT NULL,
  api_key VARCHAR(255),
  auth_type ENUM('none', 'bearer', 'basic', 'api_key') DEFAULT 'bearer',
  username VARCHAR(100),
  password_enc VARCHAR(255),
  is_active TINYINT(1) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Instrument message log
CREATE TABLE instrument_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  instrument_id INT,
  direction ENUM('in', 'out') DEFAULT 'in',
  raw_data MEDIUMTEXT,
  parsed_status ENUM('ok', 'error', 'partial') DEFAULT 'ok',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE SET NULL
);

-- Seed roles
INSERT INTO roles (code, name) VALUES
  ('admin', 'Administrator'),
  ('user', 'Petugas Lab');

-- Seed permissions
INSERT INTO permissions (code, name, menu_key) VALUES
  ('dashboard.view', 'Lihat Dashboard', 'dashboard'),
  ('requests.view', 'Lihat Permintaan Lab', 'requests'),
  ('requests.manage', 'Kelola Permintaan Lab', 'requests'),
  ('patients.view', 'Lihat Pasien', 'patients'),
  ('patients.manage', 'Kelola Pasien', 'patients'),
  ('results.view', 'Lihat Hasil Lab', 'results'),
  ('results.manage', 'Kelola Hasil Lab', 'results'),
  ('users.view', 'Lihat User', 'users'),
  ('users.manage', 'Kelola User & Hak Akses', 'users'),
  ('mapping.view', 'Lihat Mapping SIMRS', 'mapping'),
  ('mapping.manage', 'Kelola Mapping SIMRS', 'mapping'),
  ('instruments.view', 'Lihat Alat Lab', 'instruments'),
  ('instruments.manage', 'Kelola Alat Lab', 'instruments');

-- Admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions;

-- User: dashboard, requests, patients, results (view + manage)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE code IN (
  'dashboard.view', 'requests.view', 'requests.manage',
  'patients.view', 'patients.manage', 'results.view', 'results.manage'
);

-- Sandi diisi ACAK saat pemasangan pertama oleh backend/src/ensureSeed.js.
-- Penanda "placeholder" di bawah adalah pemicunya -- jangan diganti hash
-- tetap, karena sandi bawaan yang sama di setiap pemasangan menjadi
-- pengetahuan umum begitu kode ini terbuka.
INSERT INTO users (username, password_hash, full_name, email, role_id) VALUES
  ('admin', 'placeholder-diisi-saat-pemasangan', 'Administrator', 'admin@lis.local', 1),
  ('lab', 'placeholder-diisi-saat-pemasangan', 'Petugas Lab', 'lab@lis.local', 2);

INSERT INTO lab_tests (code, name, unit, reference_min, reference_max) VALUES
  ('HB', 'Hemoglobin', 'g/dL', 12.0, 17.5),
  ('LEU', 'Leukosit', '/uL', 4000, 11000),
  ('GLU', 'Glukosa Puasa', 'mg/dL', 70, 100),
  ('CREA', 'Kreatinin', 'mg/dL', 0.6, 1.2),
  ('ALT', 'SGPT/ALT', 'U/L', 7, 56);

INSERT INTO instruments (code, name, manufacturer, model, protocol, port, config_json) VALUES
  ('HEM-01', 'Hematology Analyzer', 'Sysmex', 'XN-1000', 'astm', 5001, '{"delimiter":"|"}'),
  ('CHEM-01', 'Chemistry Analyzer', 'Roche', 'c501', 'astm', 5002, '{}');

INSERT INTO instrument_test_map (instrument_id, instrument_test_code, test_id) VALUES
  (1, 'HGB', 1), (1, 'WBC', 2),
  (2, 'GLU', 3), (2, 'CREAT', 4), (2, 'ALT', 5);

INSERT INTO simrs_mappings (mapping_type, lis_field, simrs_field, transform_rule) VALUES
  ('patient', 'medical_record_no', 'no_rm', NULL),
  ('patient', 'order_no', 'no_order', NULL),
  ('patient', 'name', 'nama_pasien', NULL),
  ('patient', 'birth_date', 'tgl_lahir', 'date:Y-m-d'),
  ('order', 'request_no', 'no_order', NULL),
  ('order', 'simrs_order_id', 'id_order', NULL),
  ('result', 'result_value', 'nilai_hasil', NULL),
  ('result', 'test_id', 'kode_pemeriksaan', 'lookup:test_code'),
  ('test', 'code', 'kode_lab', NULL);

INSERT INTO simrs_config (base_url, auth_type, is_active) VALUES
  ('http://localhost:8080/simrs/api', 'bearer', 0);

-- Sample patient for instrument testing
INSERT INTO patients (medical_record_no, order_no, name, gender, birth_date) VALUES
  ('RM001', 'ORD001', 'Pasien Demo', 'L', '1990-01-15');

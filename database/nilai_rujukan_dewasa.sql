-- Nilai rujukan dan nilai kritis hematologi dewasa.
--
-- ASAL NILAI: rentang dewasa yang lazim dipakai, BUKAN tabel resmi salah satu
-- rumah sakit. Dipakai sebagai isian sementara di salah satu lokasi pemasangan yang katalog
-- tesnya masih kosong sama sekali, sehingga HCT 22% dan PLT 53 sempat tampil
-- sebagai "normal". Nilai kritis memakai batas panik yang umum dipakai.
--
-- WAJIB DIVALIDASI kepala laboratorium sebelum dianggap resmi, dan diganti
-- begitu tabel resmi rumah sakit tersedia.
--
-- Aman dijalankan berulang: hanya mengisi baris yang masih NULL, jadi nilai
-- resmi yang sudah ada (misalnya lokasi pemasangan lain, diambil dari Khanza) tidak tertimpa.
-- Pencocokan lewat kolom `code`; kode yang tidak ada di katalog diabaikan.

-- kode          | L min | L max | P min | P max | kritis bawah | kritis atas
DROP TEMPORARY TABLE IF EXISTS rujukan_dewasa;
CREATE TEMPORARY TABLE rujukan_dewasa (
  code VARCHAR(50) PRIMARY KEY,
  rl DECIMAL(12,4) NULL, xl DECIMAL(12,4) NULL,
  rp DECIMAL(12,4) NULL, xp DECIMAL(12,4) NULL,
  cmin DECIMAL(12,4) NULL, cmax DECIMAL(12,4) NULL
);

INSERT INTO rujukan_dewasa (code, rl, xl, rp, xp, cmin, cmax) VALUES
  -- hitung darah utama
  ('WBC',    4.0,   10.0,  4.0,   10.0,  2.0,   40.0),
  ('RBC',    4.5,   5.9,   4.0,   5.2,   NULL,  NULL),
  ('HGB',    13.0,  17.0,  12.0,  15.0,  7.0,   20.0),
  ('HCT',    40.0,  52.0,  36.0,  46.0,  20.0,  60.0),
  ('MCV',    80.0,  100.0, 80.0,  100.0, NULL,  NULL),
  ('MCH',    27.0,  33.0,  27.0,  33.0,  NULL,  NULL),
  ('MCHC',   32.0,  36.0,  32.0,  36.0,  NULL,  NULL),
  ('PLT',    150.0, 450.0, 150.0, 450.0, 40.0,  1000.0),
  -- hitung jenis, persen
  ('NEUT%',  50.0,  70.0,  50.0,  70.0,  NULL,  NULL),
  ('LYMPH%', 20.0,  40.0,  20.0,  40.0,  NULL,  NULL),
  ('MONO%',  2.0,   8.0,   2.0,   8.0,   NULL,  NULL),
  ('EO%',    1.0,   3.0,   1.0,   3.0,   NULL,  NULL),
  ('BASO%',  0.0,   1.0,   0.0,   1.0,   NULL,  NULL),
  ('IG%',    0.0,   0.6,   0.0,   0.6,   NULL,  NULL),
  -- hitung jenis, absolut
  ('NEUT#',  2.0,   7.0,   2.0,   7.0,   0.5,   NULL),
  ('LYMPH#', 0.8,   4.0,   0.8,   4.0,   NULL,  NULL),
  ('MONO#',  0.12,  1.2,   0.12,  1.2,   NULL,  NULL),
  ('EO#',    0.02,  0.5,   0.02,  0.5,   NULL,  NULL),
  ('BASO#',  0.0,   0.1,   0.0,   0.1,   NULL,  NULL),
  ('IG#',    0.0,   0.03,  0.0,   0.03,  NULL,  NULL),
  -- indeks eritrosit dan trombosit
  ('RDW-CV', 11.5,  14.5,  11.5,  14.5,  NULL,  NULL),
  ('RDW-SD', 35.0,  56.0,  35.0,  56.0,  NULL,  NULL),
  ('MPV',    7.0,   11.0,  7.0,   11.0,  NULL,  NULL),
  ('PDW',    9.0,   17.0,  9.0,   17.0,  NULL,  NULL),
  ('PCT',    0.17,  0.35,  0.17,  0.35,  NULL,  NULL),
  ('P-LCR',  13.0,  43.0,  13.0,  43.0,  NULL,  NULL);

UPDATE lab_tests t JOIN rujukan_dewasa r ON r.code = t.code
   SET t.reference_min_l = COALESCE(t.reference_min_l, r.rl),
       t.reference_max_l = COALESCE(t.reference_max_l, r.xl),
       t.reference_min_p = COALESCE(t.reference_min_p, r.rp),
       t.reference_max_p = COALESCE(t.reference_max_p, r.xp),
       t.critical_min    = COALESCE(t.critical_min,    r.cmin),
       t.critical_max    = COALESCE(t.critical_max,    r.cmax);

DROP TEMPORARY TABLE rujukan_dewasa;

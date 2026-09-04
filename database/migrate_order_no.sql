-- Jalankan jika DB sudah ada (upgrade dari versi lama)
USE geulis;

ALTER TABLE patients CHANGE COLUMN simrs_patient_id order_no VARCHAR(50) NULL;

ALTER TABLE instruments
  MODIFY protocol ENUM('astm', 'hl7', 'json', 'xml', 'tcp_json') DEFAULT 'astm';

UPDATE simrs_mappings SET lis_field = 'order_no' WHERE lis_field = 'simrs_patient_id';

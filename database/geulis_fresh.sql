-- ====================================================================
--  GeuLIS - berkas pemasangan RUMAH SAKIT BARU
-- ====================================================================
--  Dibuat dari database/dump_contoh.sql, tetapi SELURUH DATA KLINIS DIBUANG.
--
--  Yang ikut  : struktur seluruh tabel + roles, permissions,
--               role_permissions, settings, lab_tests, users
--  Yang DIBUANG: patients, lab_results, lab_requests,
--               lab_request_items, instrument_logs (data pasien),
--               api_keys, simrs_config (kredensial),
--               instruments, instrument_test_map, simrs_mappings
--               (konfigurasi khusus satu rumah sakit)
--
--  JANGAN memakai database/dump_contoh.sql untuk pemasangan baru: berkas itu
--  berisi rekam medis pasien salah satu lokasi pemasangan.
--
--  Setelah impor: jalankan `npm run seed --prefix backend`, lalu buat
--  API key, alat, dan pemetaan SIMRS lewat menu aplikasi.
-- ====================================================================

/*
 Navicat Premium Dump SQL

 Source Server         : localhost_3306
 Source Server Type    : MySQL
 Source Server Version : 100432 (10.4.32-MariaDB)
 Source Host           : 127.0.0.1:3306
 Source Schema         : geulis

 Target Server Type    : MySQL
 Target Server Version : 100432 (10.4.32-MariaDB)
 File Encoding         : 65001

 Date: 22/07/2026 10:22:32
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for api_keys
-- ----------------------------
DROP TABLE IF EXISTS `api_keys`;
CREATE TABLE `api_keys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `api_key` varchar(100) NOT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_key` (`api_key`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `api_keys_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of api_keys
-- ----------------------------
BEGIN;
-- [pemasangan baru] data tabel `api_keys` sengaja tidak disertakan

COMMIT;

-- ----------------------------
-- Table structure for instrument_logs
-- ----------------------------
DROP TABLE IF EXISTS `instrument_logs`;
CREATE TABLE `instrument_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `instrument_id` int(11) DEFAULT NULL,
  `direction` enum('in','out') DEFAULT 'in',
  `raw_data` mediumtext DEFAULT NULL,
  `parsed_status` enum('ok','error','partial') DEFAULT 'ok',
  `error_message` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `instrument_id` (`instrument_id`),
  CONSTRAINT `instrument_logs_ibfk_1` FOREIGN KEY (`instrument_id`) REFERENCES `instruments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of instrument_logs
-- ----------------------------
BEGIN;
-- [pemasangan baru] data tabel `instrument_logs` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_logs` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_logs` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_logs` sengaja tidak disertakan

COMMIT;

-- ----------------------------
-- Table structure for instrument_test_map
-- ----------------------------
DROP TABLE IF EXISTS `instrument_test_map`;
CREATE TABLE `instrument_test_map` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `instrument_id` int(11) NOT NULL,
  `instrument_test_code` varchar(50) NOT NULL,
  `test_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inst_code` (`instrument_id`,`instrument_test_code`),
  KEY `test_id` (`test_id`),
  CONSTRAINT `instrument_test_map_ibfk_1` FOREIGN KEY (`instrument_id`) REFERENCES `instruments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `instrument_test_map_ibfk_2` FOREIGN KEY (`test_id`) REFERENCES `lab_tests` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of instrument_test_map
-- ----------------------------
BEGIN;
-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

-- [pemasangan baru] data tabel `instrument_test_map` sengaja tidak disertakan

COMMIT;

-- ----------------------------
-- Table structure for instruments
-- ----------------------------
DROP TABLE IF EXISTS `instruments`;
CREATE TABLE `instruments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(150) NOT NULL,
  `manufacturer` varchar(100) DEFAULT NULL,
  `model` varchar(100) DEFAULT NULL,
  `protocol` enum('astm','hl7','tcp_json','serial') DEFAULT 'astm',
  `host` varchar(100) DEFAULT '0.0.0.0',
  `port` int(11) DEFAULT 5000,
  `is_active` tinyint(1) DEFAULT 1,
  `last_connected` timestamp NULL DEFAULT NULL,
  `config_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`config_json`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of instruments
-- ----------------------------
BEGIN;
-- [pemasangan baru] data tabel `instruments` sengaja tidak disertakan

COMMIT;

-- ----------------------------
-- Table structure for lab_request_items
-- ----------------------------
DROP TABLE IF EXISTS `lab_request_items`;
CREATE TABLE `lab_request_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_id` int(11) NOT NULL,
  `test_id` int(11) NOT NULL,
  `status` enum('pending','processing','done','cancelled') DEFAULT 'pending',
  PRIMARY KEY (`id`),
  KEY `request_id` (`request_id`),
  KEY `test_id` (`test_id`),
  CONSTRAINT `lab_request_items_ibfk_1` FOREIGN KEY (`request_id`) REFERENCES `lab_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lab_request_items_ibfk_2` FOREIGN KEY (`test_id`) REFERENCES `lab_tests` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of lab_request_items
-- ----------------------------
BEGIN;
-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_request_items` sengaja tidak disertakan

COMMIT;

-- ----------------------------
-- Table structure for lab_requests
-- ----------------------------
DROP TABLE IF EXISTS `lab_requests`;
CREATE TABLE `lab_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_no` varchar(30) NOT NULL,
  `patient_id` int(11) NOT NULL,
  `simrs_order_id` varchar(50) DEFAULT NULL,
  `priority` enum('normal','cito','stat') DEFAULT 'normal',
  `status` enum('pending','collected','processing','completed','cancelled') DEFAULT 'pending',
  `requested_by` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `requested_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `collected_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `request_no` (`request_no`),
  KEY `patient_id` (`patient_id`),
  KEY `requested_by` (`requested_by`),
  CONSTRAINT `lab_requests_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  CONSTRAINT `lab_requests_ibfk_2` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of lab_requests
-- ----------------------------
BEGIN;
-- [pemasangan baru] data tabel `lab_requests` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_requests` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_requests` sengaja tidak disertakan

COMMIT;

-- ----------------------------
-- Table structure for lab_results
-- ----------------------------
DROP TABLE IF EXISTS `lab_results`;
CREATE TABLE `lab_results` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_item_id` int(11) DEFAULT NULL,
  `patient_id` int(11) NOT NULL,
  `test_id` int(11) NOT NULL,
  `result_value` varchar(100) DEFAULT NULL,
  `result_numeric` decimal(14,4) DEFAULT NULL,
  `unit` varchar(30) DEFAULT NULL,
  `flag` enum('normal','low','high','critical','abnormal') DEFAULT 'normal',
  `status` enum('preliminary','final','corrected') DEFAULT 'final',
  `instrument_id` int(11) DEFAULT NULL,
  `raw_message` text DEFAULT NULL,
  `verified_by` int(11) DEFAULT NULL,
  `result_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `verified_at` timestamp NULL DEFAULT NULL,
  `is_printable` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `request_item_id` (`request_item_id`),
  KEY `patient_id` (`patient_id`),
  KEY `test_id` (`test_id`),
  KEY `verified_by` (`verified_by`),
  CONSTRAINT `lab_results_ibfk_1` FOREIGN KEY (`request_item_id`) REFERENCES `lab_request_items` (`id`) ON DELETE SET NULL,
  CONSTRAINT `lab_results_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  CONSTRAINT `lab_results_ibfk_3` FOREIGN KEY (`test_id`) REFERENCES `lab_tests` (`id`),
  CONSTRAINT `lab_results_ibfk_4` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1027 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of lab_results
-- ----------------------------
BEGIN;
-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

-- [pemasangan baru] data tabel `lab_results` sengaja tidak disertakan

COMMIT;

-- ----------------------------
-- Table structure for lab_tests
-- ----------------------------
DROP TABLE IF EXISTS `lab_tests`;
CREATE TABLE `lab_tests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(30) NOT NULL,
  `name` varchar(150) NOT NULL,
  `unit` varchar(30) DEFAULT NULL,
  `reference_min` decimal(12,4) DEFAULT NULL,
  `reference_max` decimal(12,4) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `show_in_report` tinyint(1) DEFAULT 1,
  `instrument_id` int(11) DEFAULT NULL,
  `sort_order` int(11) DEFAULT 999,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `instrument_id` (`instrument_id`),
  CONSTRAINT `lab_tests_ibfk_1` FOREIGN KEY (`instrument_id`) REFERENCES `instruments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=130 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of lab_tests
-- ----------------------------
BEGIN;
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (88, 'WBC', 'WBC', '10*3/uL', NULL, NULL, NULL, 1, NULL, 2);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (89, 'RBC', 'RBC', '10*6/uL', NULL, NULL, NULL, 1, NULL, 9);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (90, 'HGB', 'HGB', 'g/dL', NULL, NULL, NULL, 1, NULL, 1);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (91, 'HCT', 'HCT', '%', NULL, NULL, NULL, 1, NULL, 8);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (92, 'MCV', 'MCV', 'fL', NULL, NULL, NULL, 1, NULL, 11);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (93, 'MCH', 'MCH', 'pg', NULL, NULL, NULL, 1, NULL, 12);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (94, 'MCHC', 'MCHC', 'g/dL', NULL, NULL, NULL, 1, NULL, 13);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (95, 'PLT', 'PLT', '10*3/uL', NULL, NULL, NULL, 1, NULL, 10);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (96, 'NEUT%', 'NEUT%', '%', NULL, NULL, NULL, 1, NULL, 5);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (97, 'LYMPH%', 'LYMPH%', '%', NULL, NULL, NULL, 1, NULL, 6);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (98, 'MONO%', 'MONO%', '%', NULL, NULL, NULL, 1, NULL, 7);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (99, 'EO%', 'EO%', '%', NULL, NULL, NULL, 1, NULL, 4);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (100, 'BASO%', 'BASO%', '%', NULL, NULL, NULL, 1, NULL, 3);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (101, 'NEUT#', 'NEUT#', '10*3/uL', NULL, NULL, 1, 1, NULL, 26);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (102, 'LYMPH#', 'LYMPH#', '10*3/uL', NULL, NULL, 1, 1, NULL, 19);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (103, 'MONO#', 'MONO#', '10*3/uL', NULL, NULL, 1, 1, NULL, 20);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (104, 'EO#', 'EO#', '10*3/uL', NULL, NULL, 1, 1, NULL, 17);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (105, 'BASO#', 'BASO#', '10*3/uL', NULL, NULL, 1, 1, NULL, 16);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (106, 'IG%', 'IG%', '%', NULL, NULL, 1, 1, NULL, 15);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (107, 'IG#', 'IG#', '10*3/uL', NULL, NULL, 1, 1, NULL, 18);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (108, 'RDW-SD', 'RDW-SD', 'fL', NULL, NULL, 1, 1, NULL, 24);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (109, 'RDW-CV', 'RDW-CV', '%', NULL, NULL, 1, 1, NULL, 23);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (110, 'MICROR', 'MICROR', '%', NULL, NULL, 1, 1, NULL, 25);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (111, 'MACROR', 'MACROR', '%', NULL, NULL, 1, 1, NULL, 22);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (112, 'PDW', 'PDW', 'fL', NULL, NULL, 1, 1, NULL, 21);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (113, 'MPV', 'MPV', 'fL', NULL, NULL, 1, 1, NULL, 14);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (114, 'P-LCR', 'P-LCR', '%', NULL, NULL, 1, 1, NULL, 27);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (115, 'PCT', 'PCT', '%', NULL, NULL, 1, 1, NULL, 28);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (116, 'Blasts/Abn_Lympho?', 'Blasts/Abn_Lympho?', '', NULL, NULL, 1, 0, NULL, 34);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (117, 'Left_Shift?', 'Left_Shift?', '', NULL, NULL, 1, 0, NULL, 36);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (118, 'Atypical_Lympho?', 'Atypical_Lympho?', '', NULL, NULL, 1, 0, NULL, 33);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (119, 'NRBC?', 'NRBC?', '', NULL, NULL, 1, 0, NULL, 38);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (120, 'RBC_Agglutination?', 'RBC_Agglutination?', '', NULL, NULL, 1, 0, NULL, 39);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (121, 'Turbidity/HGB_Interference?', 'Turbidity/HGB_Interference?', '', NULL, NULL, 1, 0, NULL, 42);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (122, 'Iron_Deficiency?', 'Iron_Deficiency?', '', NULL, NULL, 1, 0, NULL, 35);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (123, 'HGB_Defect?', 'HGB_Defect?', '', NULL, NULL, 1, 0, NULL, 32);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (124, 'Fragments?', 'Fragments?', '', NULL, NULL, 1, 0, NULL, 31);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (125, 'PLT_Clumps?', 'PLT_Clumps?', '', NULL, NULL, 1, 0, NULL, 37);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (126, 'SCAT_WDF', 'SCAT_WDF', '', NULL, NULL, 1, 0, NULL, 40);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (127, 'SCAT_WDF-CBC', 'SCAT_WDF-CBC', '', NULL, NULL, 1, 0, NULL, 41);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (128, 'DIST_RBC', 'DIST_RBC', '', NULL, NULL, 1, 0, NULL, 30);
INSERT INTO `lab_tests` (`id`, `code`, `name`, `unit`, `reference_min`, `reference_max`, `is_active`, `show_in_report`, `instrument_id`, `sort_order`) VALUES (129, 'DIST_PLT', 'DIST_PLT', '', NULL, NULL, 1, 0, NULL, 29);
COMMIT;

-- ----------------------------
-- Table structure for patients
-- ----------------------------
DROP TABLE IF EXISTS `patients`;
CREATE TABLE `patients` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `medical_record_no` varchar(50) NOT NULL,
  `order_no` varchar(50) DEFAULT NULL COMMENT 'Nomor order lab / SIMRS',
  `name` varchar(200) NOT NULL,
  `birth_date` date DEFAULT NULL,
  `gender` enum('L','P') DEFAULT 'L',
  `phone` varchar(30) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mrn` (`medical_record_no`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of patients
-- ----------------------------
BEGIN;
-- [pemasangan baru] data tabel `patients` sengaja tidak disertakan

-- [pemasangan baru] data tabel `patients` sengaja tidak disertakan

-- [pemasangan baru] data tabel `patients` sengaja tidak disertakan

COMMIT;

-- ----------------------------
-- Table structure for permissions
-- ----------------------------
DROP TABLE IF EXISTS `permissions`;
CREATE TABLE `permissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(80) NOT NULL,
  `name` varchar(150) NOT NULL,
  `menu_key` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of permissions
-- ----------------------------
BEGIN;
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (1, 'dashboard.view', 'Lihat Dashboard', 'dashboard');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (2, 'requests.view', 'Lihat Permintaan Lab', 'requests');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (3, 'requests.manage', 'Kelola Permintaan Lab', 'requests');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (4, 'patients.view', 'Lihat Pasien', 'patients');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (5, 'patients.manage', 'Kelola Pasien', 'patients');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (6, 'results.view', 'Lihat Hasil Lab', 'results');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (7, 'results.manage', 'Kelola Hasil Lab', 'results');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (8, 'users.view', 'Lihat User', 'users');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (9, 'users.manage', 'Kelola User & Hak Akses', 'users');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (10, 'mapping.view', 'Lihat Mapping SIMRS', 'mapping');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (11, 'mapping.manage', 'Kelola Mapping SIMRS', 'mapping');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (12, 'instruments.view', 'Lihat Alat Lab', 'instruments');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (13, 'instruments.manage', 'Kelola Alat Lab', 'instruments');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (14, 'tests.view', 'Lihat Master Tes', 'tests');
INSERT INTO `permissions` (`id`, `code`, `name`, `menu_key`) VALUES (15, 'tests.manage', 'Kelola Master Tes', 'tests');
COMMIT;

-- ----------------------------
-- Table structure for role_permissions
-- ----------------------------
DROP TABLE IF EXISTS `role_permissions`;
CREATE TABLE `role_permissions` (
  `role_id` int(11) NOT NULL,
  `permission_id` int(11) NOT NULL,
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `permission_id` (`permission_id`),
  CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `role_permissions_ibfk_2` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of role_permissions
-- ----------------------------
BEGIN;
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 1);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 2);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 3);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 4);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 5);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 6);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 7);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 8);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 9);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 10);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 11);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 12);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 13);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 14);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (1, 15);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (2, 1);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (2, 2);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (2, 3);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (2, 4);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (2, 5);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (2, 6);
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES (2, 7);
COMMIT;

-- ----------------------------
-- Table structure for roles
-- ----------------------------
DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of roles
-- ----------------------------
BEGIN;
INSERT INTO `roles` (`id`, `code`, `name`, `created_at`) VALUES (1, 'admin', 'Administrator', '2026-05-23 20:46:34');
INSERT INTO `roles` (`id`, `code`, `name`, `created_at`) VALUES (2, 'user', 'Petugas Lab', '2026-05-23 20:46:34');
COMMIT;

-- ----------------------------
-- Table structure for settings
-- ----------------------------
DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) NOT NULL,
  `setting_value` mediumtext DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `setting_key` (`setting_key`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of settings
-- ----------------------------
BEGIN;
INSERT INTO `settings` (`id`, `setting_key`, `setting_value`) VALUES (1, 'clinic_name', 'LABORATORIUM KLINIK KHANZA');
INSERT INTO `settings` (`id`, `setting_key`, `setting_value`) VALUES (2, 'clinic_address', 'Jl. Kesehatan No. 123, Kota Medis');
INSERT INTO `settings` (`id`, `setting_key`, `setting_value`) VALUES (3, 'clinic_phone', '08123456789');
INSERT INTO `settings` (`id`, `setting_key`, `setting_value`) VALUES (4, 'clinic_email', 'info@geulis.local');
COMMIT;

-- ----------------------------
-- Table structure for simrs_config
-- ----------------------------
DROP TABLE IF EXISTS `simrs_config`;
CREATE TABLE `simrs_config` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `base_url` varchar(255) NOT NULL,
  `api_key` varchar(255) DEFAULT NULL,
  `auth_type` enum('none','bearer','basic','api_key') DEFAULT 'bearer',
  `username` varchar(100) DEFAULT NULL,
  `password_enc` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of simrs_config
-- ----------------------------
BEGIN;
-- [pemasangan baru] data tabel `simrs_config` sengaja tidak disertakan

COMMIT;

-- ----------------------------
-- Table structure for simrs_mappings
-- ----------------------------
DROP TABLE IF EXISTS `simrs_mappings`;
CREATE TABLE `simrs_mappings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `mapping_type` enum('patient','order','result','test') NOT NULL,
  `lis_field` varchar(100) NOT NULL,
  `simrs_field` varchar(100) NOT NULL,
  `transform_rule` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=50 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of simrs_mappings
-- ----------------------------
BEGIN;
-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings` sengaja tidak disertakan

COMMIT;

-- ----------------------------
-- Table structure for simrs_mappings_copy1
-- ----------------------------
DROP TABLE IF EXISTS `simrs_mappings_copy1`;
CREATE TABLE `simrs_mappings_copy1` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `mapping_type` enum('patient','order','result','test') NOT NULL,
  `lis_field` varchar(100) NOT NULL,
  `simrs_field` varchar(100) NOT NULL,
  `transform_rule` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of simrs_mappings_copy1
-- ----------------------------
BEGIN;
-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

-- [pemasangan baru] data tabel `simrs_mappings_copy1` sengaja tidak disertakan

COMMIT;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(80) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `role_id` int(11) NOT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `last_login` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `role_id` (`role_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- ----------------------------
-- Records of users
-- ----------------------------
BEGIN;
INSERT INTO `users` (`id`, `username`, `password_hash`, `full_name`, `email`, `role_id`, `is_active`, `last_login`, `created_at`, `updated_at`) VALUES (1, 'admin', 'placeholder-diisi-saat-pemasangan', 'Administrator', 'admin@lis.local', 1, 1, '2026-07-22 09:17:54', '2026-05-23 20:46:34', '2026-07-22 09:17:54');
INSERT INTO `users` (`id`, `username`, `password_hash`, `full_name`, `email`, `role_id`, `is_active`, `last_login`, `created_at`, `updated_at`) VALUES (4, 'lab', 'placeholder-diisi-saat-pemasangan', 'lab', 'aji19980419@gmail.com', 2, 1, '2026-07-21 09:19:06', '2026-07-21 09:18:52', '2026-07-21 09:19:06');
COMMIT;

SET FOREIGN_KEY_CHECKS = 1;

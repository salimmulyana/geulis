import pool from '../config/db.js';
import { umurHari } from './rujukanUmur.js';

/**
 * Konteks pasien yang dibutuhkan untuk menilai satu hasil.
 *
 * Dikumpulkan di satu tempat supaya tidak ada jalur yang diam-diam kehilangan
 * umur. Sebelumnya setiap pemanggil hanya mengambil jenis kelamin sendiri-sendiri,
 * dan menambahkan umur di satu tempat berarti empat tempat lain tetap menilai
 * pasien anak dengan rujukan dewasa — tanpa gejala apa pun.
 *
 * @param {number} patientId
 * @param {Date}   pada  waktu pemeriksaan; umur dihitung pada saat itu, bukan
 *                       saat laporan dicetak
 * @returns {{gender: 'L'|'P'|null, umurHari: number|null, kondisi: string|null}}
 */
export async function konteksPasien(patientId, pada = new Date()) {
  if (!patientId) return { gender: null, umurHari: null, kondisi: null };

  const [[p]] = await pool
    .query('SELECT gender, birth_date FROM patients WHERE id = ?', [patientId])
    .catch(() => [[]]);

  if (!p) return { gender: null, umurHari: null, kondisi: null };

  return {
    gender: p.gender ?? null,
    umurHari: umurHari(p.birth_date, pada),
    // Kondisi khusus (mis. hamil) belum disimpan pada pasien. Dibiarkan null
    // dengan sengaja: rentang berkondisi akan dilewati, bukan ditebak. Begitu
    // kolomnya ada, cukup diisi di sini dan seluruh jalur ikut membaiknya.
    kondisi: null,
  };
}

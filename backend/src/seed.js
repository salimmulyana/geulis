import { ensureSeed } from './ensureSeed.js';
import pool from './config/db.js';

/**
 * Menjalankan penetapan sandi awal secara manual.
 *
 * Sengaja hanya memanggil ensureSeed, tidak menyalin logikanya. Versi
 * sebelumnya menuliskan sandi bawaan di dua tempat, dan dua tempat berarti
 * suatu saat hanya salah satu yang diperbaiki.
 */
const jalankan = async () => {
  await ensureSeed();
  await pool.end();
};

jalankan().catch((e) => {
  console.error('Seed gagal:', e.message);
  process.exit(1);
});

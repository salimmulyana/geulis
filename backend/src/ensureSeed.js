import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { writeFileSync, chmodSync } from 'node:fs';
import pool from './config/db.js';

/**
 * Menetapkan sandi awal bila skema masih memakai placeholder.
 *
 * Sandinya DIACAK, bukan tetap. Versi sebelumnya memakai `admin123` dan
 * `lab123` yang terpatri di kode — bisa diterima selama kodenya tertutup,
 * tetapi menjadi lubang yang serius begitu kodenya terbuka: sandi bawaan
 * setiap pemasangan GeuLIS di mana pun menjadi pengetahuan umum, dan
 * pemasangan yang lupa menggantinya bisa dimasuki siapa saja yang pernah
 * membaca repositori ini.
 *
 * Sandi acak juga menutup kebocoran lewat git: tidak ada kredensial yang perlu
 * disimpan di dalam kode sama sekali.
 */
export async function ensureSeed() {
  const [users] = await pool.query('SELECT id, username, password_hash FROM users');
  const needsSeed = users.some((u) => u.password_hash.includes('placeholder'));
  if (!needsSeed) return;

  // 18 byte base64url ≈ 24 karakter. Cukup panjang untuk tidak bisa ditebak,
  // masih bisa dibacakan lewat telepon saat pemasangan.
  const buatSandi = () => randomBytes(18).toString('base64url');
  const sandi = { admin: buatSandi(), lab: buatSandi() };

  for (const [username, kata] of Object.entries(sandi)) {
    const hash = await bcrypt.hash(kata, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE username = ?', [hash, username]);
  }

  // Ditulis ke berkas, bukan hanya ke layar. Saat pemasangan otomatis, keluaran
  // konsol sering hilang ke dalam log systemd yang tidak dibaca siapa pun —
  // dan sandi yang tidak pernah terbaca sama artinya dengan sistem yang tidak
  // bisa dimasuki.
  const berkas = 'SANDI_AWAL.txt';
  const isi =
    'Sandi awal GeuLIS — dibuat acak saat pemasangan pertama\n' +
    '=======================================================\n\n' +
    `admin : ${sandi.admin}\n` +
    `lab   : ${sandi.lab}\n\n` +
    'GANTI kedua sandi ini setelah login pertama, lalu HAPUS berkas ini.\n' +
    'Jangan pernah menyertakan berkas ini ke dalam git.\n';
  try {
    writeFileSync(berkas, isi, { mode: 0o600 });
    chmodSync(berkas, 0o600);
  } catch {
    // Bila tidak bisa menulis (mis. direktori hanya-baca), sandinya tetap
    // tercetak di bawah. Gagal menulis berkas tidak boleh menggagalkan
    // pemasangan.
  }

  console.log('[seed] Sandi awal dibuat acak dan disimpan di SANDI_AWAL.txt');
  console.log(`[seed]   admin : ${sandi.admin}`);
  console.log(`[seed]   lab   : ${sandi.lab}`);
  console.log('[seed] Ganti kedua sandi ini setelah login pertama, lalu hapus berkasnya.');
}

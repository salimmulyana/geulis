import crypto from 'crypto';

/**
 * Tanda tangan elektronik BELUM TERSERTIFIKASI.
 *
 * Apa yang dijamin dan apa yang TIDAK — perbedaan ini menentukan, dan harus
 * tertulis di laporan, bukan hanya di kode:
 *
 *   DIJAMIN     keutuhan isi. Bila satu angka pada laporan diubah setelah
 *               disahkan, tanda tangannya tidak lagi cocok, dan itu bisa
 *               dibuktikan siapa pun yang memegang kunci publiknya.
 *
 *   TIDAK       identitas hukum penanda tangan. Kunci ini dibuat sendiri oleh
 *               server, bukan oleh penyelenggara sertifikasi. Ia tidak
 *               membuktikan bahwa yang menandatangani benar-benar dokter yang
 *               namanya tertulis — hanya bahwa isinya tidak berubah sejak
 *               ditandatangani oleh pemegang kunci ini.
 *
 * Untuk kekuatan hukum penuh diperlukan sertifikat BSrE. Kerangka ini dibuat
 * agar penggantiannya nanti tidak mengubah alur kerja: yang berubah hanya asal
 * kuncinya.
 */

/**
 * Susun isi laporan menjadi teks baku yang akan ditandatangani.
 *
 * Urutannya DIPAKU dan tidak boleh bergantung urutan baris dari basis data.
 * Kalau urutannya bisa berubah, tanda tangan atas isi yang sama akan berbeda,
 * dan verifikasi gagal untuk laporan yang sebenarnya utuh — kegagalan palsu
 * yang membuat orang berhenti mempercayai verifikasinya.
 */
export function susunIsi({ permintaan, hasil }) {
  const baris = [
    `no:${permintaan.request_no}`,
    `rm:${permintaan.medical_record_no}`,
    `pasien:${permintaan.patient_name}`,
    `lahir:${permintaan.birth_date ? new Date(permintaan.birth_date).toISOString().slice(0, 10) : ''}`,
  ];

  const urut = [...hasil].sort((a, b) => String(a.test_code).localeCompare(String(b.test_code)));
  for (const h of urut) {
    // Rujukan ikut ditandatangani. Nilai tanpa rujukan tidak bisa ditafsirkan,
    // jadi mengubah rujukan mengubah arti laporan sama seperti mengubah angkanya.
    baris.push(
      `${h.test_code}=${h.result_value}|${h.unit ?? ''}|${h.rujukan_label ?? ''}|${h.flag ?? ''}`
    );
  }
  if (permintaan.interpretasi) baris.push(`interpretasi:${permintaan.interpretasi}`);
  return baris.join('\n');
}

export function sidik(isi) {
  return crypto.createHash('sha256').update(isi, 'utf8').digest('hex');
}

/**
 * Kunci penanda tangan server.
 *
 * Diambil dari TTD_SECRET di .env. Kalau tidak ada, penandatanganan DITOLAK —
 * bukan dilewati diam-diam dengan kunci bawaan. Kunci bawaan yang sama di semua
 * pemasangan berarti tanda tangan dari satu rumah sakit bisa dibuat oleh siapa
 * pun yang punya salinan kodenya, dan itu lebih buruk daripada tidak ada tanda
 * tangan: ia memberi kesan terjamin tanpa menjamin apa pun.
 */
function kunci() {
  const k = process.env.TTD_SECRET;
  if (!k || k.length < 32) {
    throw new Error(
      'TTD_SECRET belum diisi di backend/.env (minimal 32 karakter). Tanpa itu tanda tangan tidak dibuat — kunci bawaan yang sama di semua pemasangan memberi kesan terjamin tanpa menjamin apa pun.'
    );
  }
  return k;
}

export function tandaTangani(isi) {
  const h = sidik(isi);
  const tanda = crypto.createHmac('sha256', kunci()).update(h, 'utf8').digest('base64url');
  return { hash: h, tanda };
}

/**
 * Verifikasi. Dibandingkan dengan waktu tetap supaya perbedaan lama pembandingan
 * tidak membocorkan seberapa dekat tebakan seseorang.
 */
export function verifikasi(isi, hashTersimpan, tandaTersimpan) {
  const h = sidik(isi);
  const cocokIsi =
    typeof hashTersimpan === 'string' &&
    hashTersimpan.length === h.length &&
    crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hashTersimpan));
  if (!cocokIsi) return { sah: false, sebab: 'Isi laporan berbeda dari saat ditandatangani.' };

  let tandaUlang;
  try {
    tandaUlang = crypto.createHmac('sha256', kunci()).update(h, 'utf8').digest('base64url');
  } catch (e) {
    return { sah: false, sebab: e.message };
  }
  const a = Buffer.from(tandaUlang);
  const b = Buffer.from(String(tandaTersimpan || ''));
  const cocokTanda = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!cocokTanda) return { sah: false, sebab: 'Tanda tangan tidak cocok dengan kunci server ini.' };

  return { sah: true };
}

/** Kalimat yang WAJIB tercetak pada laporan bertanda tangan jenis ini. */
export const PERNYATAAN =
  'Ditandatangani secara elektronik. Tanda tangan ini menjamin keutuhan isi laporan, ' +
  'bukan identitas hukum penanda tangan, dan belum tersertifikasi BSrE.';

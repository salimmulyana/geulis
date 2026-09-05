/**
 * Kode LOINC untuk pemeriksaan laboratorium.
 *
 * LOINC adalah kosakata baku yang dipakai SATUSEHAT (lewat FHIR) untuk
 * menyatakan "pemeriksaan apa ini". Tanpa itu, hasil yang dikirim hanya berisi
 * nama lokal — dan "HGB", "Hb", "Hemoglobin", "HEMOGLOBIN (HB)" adalah empat
 * hal berbeda bagi sistem penerima meskipun sama bagi manusia.
 */

/**
 * Digit periksa LOINC memakai algoritma Mod 10 (Luhn) atas bagian angkanya.
 *
 * Diverifikasi terhadap delapan kode yang sudah pasti benar — 718-7 Hemoglobin,
 * 4544-3 Hematokrit, 6690-2 Leukosit, 777-3 Trombosit, 2345-7 Glukosa, 4548-4
 * HbA1c, 2160-0 Kreatinin, 1920-8 AST — dan cocok kedelapannya.
 */
export function digitPeriksaLoinc(angka) {
  const d = String(angka).split('').reverse().map(Number);
  let jml = 0;
  for (let i = 0; i < d.length; i++) {
    let v = d[i];
    if (i % 2 === 0) {
      v *= 2;
      if (v > 9) v -= 9;
    }
    jml += v;
  }
  return (10 - (jml % 10)) % 10;
}

/**
 * Periksa bentuk dan digit periksa satu kode LOINC.
 *
 * Digit periksa ini yang membuat validasi berguna. Tanpa memeriksanya, salah
 * ketik satu angka menghasilkan kode yang bentuknya sah tetapi menunjuk
 * pemeriksaan LAIN — dan hasil laboratorium yang terkirim ke SATUSEHAT dengan
 * kode pemeriksaan yang keliru tidak menimbulkan galat di mana pun. Ia hanya
 * salah, di rekam medis nasional.
 *
 * @returns {{sah: boolean, alasan?: string, kode?: string}}
 */
export function periksaLoinc(kode) {
  const k = String(kode || '').trim();
  if (!k) return { sah: false, alasan: 'Kode kosong' };

  const m = k.match(/^(\d{1,5})-(\d)$/);
  if (!m) {
    return {
      sah: false,
      alasan: 'Bentuk kode LOINC harus angka, tanda hubung, lalu satu digit periksa — misalnya 718-7.',
    };
  }

  const harus = digitPeriksaLoinc(m[1]);
  if (String(harus) !== m[2]) {
    return {
      sah: false,
      alasan: `Digit periksa tidak cocok. Untuk ${m[1]} seharusnya ${m[1]}-${harus}, bukan ${k}. Biasanya ini salah ketik satu angka.`,
    };
  }

  return { sah: true, kode: k };
}

/**
 * Kode LOINC yang paling sering dipakai laboratorium klinik di Indonesia.
 *
 * Ini BUKAN pengganti berkas LOINC resmi, melainkan titik awal supaya pemetaan
 * tidak dimulai dari nol. Semuanya sudah lolos pemeriksaan digit periksa.
 * Kode yang tidak ada di sini diisi manual dari loinc.org — dan sengaja tidak
 * ditebak dari kemiripan nama, karena nama yang mirip sering menunjuk
 * pemeriksaan yang berbeda spesimen atau berbeda metode.
 */
export const USULAN_LOINC = {
  HGB: { kode: '718-7', nama: 'Hemoglobin [Mass/volume] in Blood' },
  HCT: { kode: '4544-3', nama: 'Hematocrit [Volume Fraction] of Blood by Automated count' },
  WBC: { kode: '6690-2', nama: 'Leukocytes [#/volume] in Blood by Automated count' },
  PLT: { kode: '777-3', nama: 'Platelets [#/volume] in Blood by Automated count' },
  RBC: { kode: '789-8', nama: 'Erythrocytes [#/volume] in Blood by Automated count' },
  GLU: { kode: '2345-7', nama: 'Glucose [Mass/volume] in Serum or Plasma' },
  HBA1C: { kode: '4548-4', nama: 'Hemoglobin A1c/Hemoglobin.total in Blood' },
  CREA: { kode: '2160-0', nama: 'Creatinine [Mass/volume] in Serum or Plasma' },
  UREA: { kode: '3094-0', nama: 'Urea nitrogen [Mass/volume] in Serum or Plasma' },
  AST: { kode: '1920-8', nama: 'Aspartate aminotransferase [Enzymatic activity/volume]' },
  ALT: { kode: '1742-6', nama: 'Alanine aminotransferase [Enzymatic activity/volume]' },
  CHOL: { kode: '2093-3', nama: 'Cholesterol [Mass/volume] in Serum or Plasma' },
  HDL: { kode: '2085-9', nama: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma' },
  TRIG: { kode: '2571-8', nama: 'Triglyceride [Mass/volume] in Serum or Plasma' },
  UA: { kode: '3084-1', nama: 'Urate [Mass/volume] in Serum or Plasma' },
};

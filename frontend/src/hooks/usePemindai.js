import { useEffect, useRef } from 'react';

/**
 * Menangkap hasil pindaian barcode di mana pun di dalam aplikasi.
 *
 * Pemindai barcode bekerja sebagai papan ketik: ia "mengetik" isi barcode
 * sangat cepat lalu menekan Enter. Itulah yang dipakai untuk membedakannya dari
 * manusia — jeda antar tombol. Manusia jarang bisa di bawah 35 ms; pemindai
 * hampir selalu di bawah 20 ms.
 *
 * Kenapa dipasang global dan bukan sebagai kotak isian:
 *
 * Petugas memindai sambil memegang tabung. Kalau ia harus mengklik kotak isian
 * lebih dulu, "sekali pindai" berubah menjadi "klik, lalu pindai" — dan pada
 * saat itu mengetik nomor order dengan tangan sama cepatnya. Janji fiturnya
 * hilang justru pada detail yang tampak sepele.
 */
export function usePemindai(onPindai, { aktif = true, jedaMaksMs = 35, panjangMin = 4 } = {}) {
  const buf = useRef('');
  const terakhir = useRef(0);

  useEffect(() => {
    if (!aktif) return;

    function tombol(e) {
      // Saat petugas sedang mengetik di kotak isian, biarkan. Kecuali kotak itu
      // memang menandai dirinya siap menerima pindaian.
      const t = e.target;
      const sedangMengetik =
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) &&
        t.dataset?.pemindai !== 'ya';
      if (sedangMengetik) return;

      const kini = Date.now();
      const jeda = kini - terakhir.current;
      terakhir.current = kini;

      if (e.key === 'Enter') {
        const kode = buf.current;
        buf.current = '';
        // Panjang minimum menyaring Enter yang ditekan manusia di halaman kosong.
        if (kode.length >= panjangMin) {
          e.preventDefault();
          onPindai(kode);
        }
        return;
      }

      // Ketikan yang terlalu lambat dianggap manusia: buffer dimulai ulang.
      if (jeda > jedaMaksMs) buf.current = '';

      // Hanya karakter tunggal yang dikumpulkan; Shift, Tab, F5 dan sebagainya
      // diabaikan supaya tidak mengotori isi barcode.
      if (e.key.length === 1) buf.current += e.key;
    }

    document.addEventListener('keydown', tombol);
    return () => document.removeEventListener('keydown', tombol);
  }, [onPindai, aktif, jedaMaksMs, panjangMin]);
}

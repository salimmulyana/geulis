import { Router } from 'express';

/**
 * Membuat handler async yang melempar galat diteruskan ke penangan galat
 * Express, bukan menjatuhkan proses.
 *
 * Express 4 tidak menangkap penolakan Promise dari handler `async`. Handler
 * yang melempar menghasilkan unhandled rejection, dan sejak Node 15 keadaan itu
 * MEMATIKAN proses. Akibatnya di laboratorium: satu permintaan berbentuk salah
 * dari siapa pun yang sudah login menjatuhkan backend untuk semua orang —
 * alat berhenti bisa mengirim hasil, dan petugas kehilangan seluruh sistem
 * sampai ada yang menyalakannya kembali.
 *
 * Ini ditemukan justru dengan cara itu: satu isian yang salah bentuk saat
 * menyiapkan data contoh mematikan backend.
 *
 * Ditambal di lapisan Router supaya berlaku untuk SELURUH rute sekaligus.
 * Membungkus delapan puluhan handler satu per satu akan bekerja hari ini, lalu
 * gagal pada rute berikutnya yang ditulis orang yang tidak tahu harus
 * membungkusnya.
 */
export function pasangTangkapAsync() {
  const metode = ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'];

  // Prototipe router yang sebenarnya dipakai instance hasil Router().
  const proto = Object.getPrototypeOf(Router());

  for (const m of metode) {
    const asli = proto[m];
    if (typeof asli !== 'function' || asli.__terbungkus) continue;

    const bungkus = function (...arg) {
      const baru = arg.map((a) => {
        if (typeof a !== 'function') return a;
        // Penangan galat Express punya empat parameter (err, req, res, next).
        // Membungkusnya seperti handler biasa akan menghilangkan tanda itu dan
        // Express tidak lagi mengenalinya sebagai penangan galat.
        if (a.length === 4) return a;

        const terbungkus = function (req, res, next) {
          try {
            const hasil = a.call(this, req, res, next);
            if (hasil && typeof hasil.then === 'function') {
              return hasil.catch(next);
            }
            return hasil;
          } catch (e) {
            return next(e);
          }
        };
        // Nama dipertahankan supaya jejak tumpukan tetap bisa dibaca.
        Object.defineProperty(terbungkus, 'name', { value: a.name || 'handler' });
        return terbungkus;
      });
      return asli.apply(this, baru);
    };
    bungkus.__terbungkus = true;
    proto[m] = bungkus;
  }
}

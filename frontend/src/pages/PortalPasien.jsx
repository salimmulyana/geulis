import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Halaman hasil untuk pasien. Terbuka tanpa login.
 *
 * Dua hal yang membedakannya dari layar petugas, dan keduanya disengaja:
 *
 * 1. Tidak memakai lapis api.js. Berkas itu menyimpan dan mengirim token
 *    petugas; halaman ini tidak boleh menyentuhnya sama sekali. Pasien yang
 *    membuka portal di komputer lab tidak boleh mewarisi sesi siapa pun.
 *
 * 2. Tidak ada tombol coba lagi otomatis. Setiap percobaan yang gagal dihitung,
 *    dan lima kali salah mengunci tautannya tiga puluh menit — jadi halaman ini
 *    memperlambat, bukan mempercepat, percobaan berulang.
 */
export default function PortalPasien() {
  const [params] = useSearchParams();
  const [token, setToken] = useState('');
  const [lahir, setLahir] = useState('');
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  // Token boleh datang dari tautan, tanggal lahir TIDAK PERNAH.
  // Kalau keduanya ada di alamat, satu tangkapan layar cukup membuka hasil —
  // dan faktor kedua kehilangan seluruh gunanya.
  useEffect(() => {
    const t = params.get('t');
    if (t) setToken(t);
  }, [params]);

  const buka = async (e) => {
    e.preventDefault();
    setGalat(null);
    setSibuk(true);
    try {
      const r = await fetch('/api/portal/buka', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, tanggal_lahir: lahir }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Tidak dapat membuka hasil.');
      setData(j);
    } catch (err) {
      setGalat(err.message);
    } finally {
      setSibuk(false);
    }
  };

  if (data) {
    return (
      <div className="portal">
        <div className="kartu">
          <h1>Hasil Laboratorium</h1>

          <dl className="identitas">
            <div><dt>Nama</dt><dd>{data.pasien.nama}</dd></div>
            <div><dt>No. RM</dt><dd>{data.pasien.no_rm}</dd></div>
            <div><dt>No. Pemeriksaan</dt><dd>{data.pemeriksaan.nomor}</dd></div>
            <div><dt>Tanggal</dt><dd>{new Date(data.pemeriksaan.tanggal).toLocaleString('id-ID')}</dd></div>
          </dl>

          <table>
            <thead>
              <tr><th>Pemeriksaan</th><th>Hasil</th><th>Satuan</th><th>Rujukan</th></tr>
            </thead>
            <tbody>
              {data.hasil.map((h, i) => (
                <tr key={i} className={h.penanda !== 'normal' ? 'perhatian' : ''}>
                  <td>{h.pemeriksaan}</td>
                  <td className="nilai">
                    {h.hasil}
                    {h.penanda === 'high' && <span className="tanda"> ↑</span>}
                    {h.penanda === 'low' && <span className="tanda"> ↓</span>}
                  </td>
                  <td>{h.satuan}</td>
                  <td>{h.rujukan || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.interpretasi && (
            <div className="interpretasi">
              <h2>Interpretasi</h2>
              <p>{data.interpretasi}</p>
            </div>
          )}

          {/* Kalimat ini bukan basa-basi hukum. Hasil di luar rujukan sering
              membuat orang menyimpulkan sendiri, dan angka lab tanpa konteks
              klinis lebih sering menyesatkan daripada menolong. */}
          <div className="peringatan">
            <strong>Hasil ini bukan diagnosis.</strong> Angka di luar nilai rujukan tidak selalu
            berarti sakit, dan angka normal tidak selalu berarti sehat. Bawa hasil ini ke dokter
            yang meminta pemeriksaan untuk ditafsirkan bersama keluhan dan pemeriksaan lainnya.
          </div>

          {data.pemeriksaan.disahkan_oleh && (
            <p className="pengesah">
              Disahkan oleh {data.pemeriksaan.disahkan_oleh}
              {data.pemeriksaan.disahkan_pada &&
                ` pada ${new Date(data.pemeriksaan.disahkan_pada).toLocaleString('id-ID')}`}
            </p>
          )}

          {data.keutuhan && !data.keutuhan.utuh && (
            <div className="rusak">
              Peringatan: {data.keutuhan.catatan} Hubungi laboratorium sebelum memakai hasil ini.
            </div>
          )}

          <p className="kaki">{data.pernyataan}</p>
          <button onClick={() => window.print()}>Cetak / Simpan PDF</button>
        </div>
        <style>{GAYA}</style>
      </div>
    );
  }

  return (
    <div className="portal">
      <form className="kartu sempit" onSubmit={buka}>
        <h1>Lihat Hasil Laboratorium</h1>
        <p className="petunjuk">
          Masukkan tanggal lahir pasien untuk membuka hasil. Ini memastikan hasil hanya terbuka
          bagi yang berhak, meskipun tautannya diteruskan ke orang lain.
        </p>

        <label>Kode tautan</label>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="tempel kode dari tautan"
          required
        />

        <label>Tanggal lahir pasien</label>
        <input type="date" value={lahir} onChange={(e) => setLahir(e.target.value)} required />

        {galat && <div className="galat">{galat}</div>}

        <button type="submit" disabled={sibuk}>
          {sibuk ? 'Membuka…' : 'Buka Hasil'}
        </button>

        <p className="kaki">
          Setelah beberapa kali percobaan yang salah, tautan dikunci sementara demi keamanan.
          Bila kesulitan, hubungi laboratorium.
        </p>
      </form>
      <style>{GAYA}</style>
    </div>
  );
}

const GAYA = `
  .portal { min-height: 100vh; background: #eef1f4; padding: 2rem 1rem; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .kartu { max-width: 46rem; margin: 0 auto; background: #fff; border-radius: 10px; padding: 2rem 2.2rem; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .kartu.sempit { max-width: 26rem; }
  .kartu h1 { margin: 0 0 1rem; font-size: 1.4rem; }
  .petunjuk { color: #55606b; font-size: .92rem; }
  label { display: block; margin-top: 1rem; font-size: .85rem; color: #55606b; }
  input { width: 100%; box-sizing: border-box; padding: .6rem .7rem; border: 1px solid #cdd4db; border-radius: 6px; font-size: 1rem; }
  button { margin-top: 1.3rem; width: 100%; padding: .7rem; border: 0; border-radius: 6px; background: #0e6b5b; color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .6; cursor: default; }
  .galat { margin-top: 1rem; padding: .7rem .9rem; border-radius: 6px; background: #fbecea; color: #9b3520; font-size: .92rem; }
  .identitas { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: .7rem 1.4rem; margin: 0 0 1.4rem; }
  .identitas div { display: flex; flex-direction: column; }
  .identitas dt { font-size: .74rem; text-transform: uppercase; letter-spacing: .05em; color: #78838d; }
  .identitas dd { margin: .15rem 0 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: .95rem; }
  th, td { text-align: left; padding: .55rem .6rem; border-bottom: 1px solid #e6eaee; }
  th { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: #78838d; }
  .nilai { font-variant-numeric: tabular-nums; font-weight: 600; }
  tr.perhatian .nilai { color: #9b3520; }
  .tanda { font-weight: 700; }
  .interpretasi { margin-top: 1.5rem; }
  .interpretasi h2 { font-size: 1rem; margin: 0 0 .3rem; }
  .peringatan { margin-top: 1.5rem; padding: .9rem 1.1rem; border-left: 3px solid #8a5a10; background: #fbf3e4; color: #5c4a26; font-size: .92rem; border-radius: 4px; }
  .rusak { margin-top: 1rem; padding: .9rem 1.1rem; border-left: 3px solid #9b3520; background: #fbecea; color: #7a2a19; font-size: .92rem; border-radius: 4px; }
  .pengesah { margin-top: 1.2rem; font-size: .88rem; color: #55606b; }
  .kaki { margin-top: 1.2rem; font-size: .8rem; color: #78838d; line-height: 1.5; }
  @media print {
    .portal { background: #fff; padding: 0; }
    .kartu { box-shadow: none; max-width: 100%; padding: 0; }
    button { display: none; }
  }
`;

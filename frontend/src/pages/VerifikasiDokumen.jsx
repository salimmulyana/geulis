import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

/**
 * Halaman yang terbuka saat QR pada laporan dipindai. Publik, tanpa login.
 *
 * Sengaja TIDAK menampilkan hasil pemeriksaan. QR tercetak di kertas yang
 * beredar, jadi memindainya tidak boleh membocorkan apa pun yang belum ada di
 * kertas itu. Halaman ini menjawab satu pertanyaan saja: apakah dokumen ini
 * asli dan belum diubah.
 */
export default function VerifikasiDokumen() {
  const { kode } = useParams();
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState(null);

  useEffect(() => {
    // Halamannya di /verifikasi/<kode>; datanya di /api/verifikasi/<kode>.
    fetch(`/api/verifikasi/${encodeURIComponent(kode)}`)
      .then(async (r) => {
        const j = await r.json();
        // Kode tidak dikenal tetap ditampilkan sebagai jawaban, bukan sebagai
        // kegagalan teknis: bagi yang memindai, "tidak dikenal" adalah hasil
        // verifikasi yang bermakna.
        setData(j);
      })
      .catch(() => setGalat('Tidak dapat menghubungi server verifikasi.'));
  }, [kode]);

  if (galat) return <Bingkai><p>{galat}</p></Bingkai>;
  if (!data) return <Bingkai><p>Memeriksa…</p></Bingkai>;

  return (
    <Bingkai>
      <div className={`lencana ${data.sah ? 'sah' : 'tidak'}`}>
        {data.sah ? '✓ Dokumen Asli' : '✕ Tidak Terverifikasi'}
      </div>
      <p className="pesan">{data.pesan}</p>

      {data.nomor_pemeriksaan && (
        <>
          <dl>
            <div><dt>No. Pemeriksaan</dt><dd>{data.nomor_pemeriksaan}</dd></div>
            <div><dt>Pasien</dt><dd>{data.pasien}</dd></div>
            <div><dt>No. RM</dt><dd>{data.no_rm}</dd></div>
            <div><dt>Ditandatangani oleh</dt><dd>{data.ditandatangani_oleh || '—'}</dd></div>
            <div><dt>Pada</dt><dd>{data.ditandatangani_pada ? new Date(data.ditandatangani_pada).toLocaleString('id-ID') : '—'}</dd></div>
          </dl>

          <div className="sidik">
            <span className="label">Sidik dokumen</span>
            <code>{data.sidik_singkat}</code>
          </div>
          <p className="banding">{data.catatan_pembanding}</p>
        </>
      )}

      <p className="kaki">{data.pernyataan}</p>
    </Bingkai>
  );
}

function Bingkai({ children }) {
  return (
    <div className="verif">
      <div className="kartu">{children}</div>
      <style>{`
        .verif { min-height: 100vh; background: #eef1f4; display: grid; place-items: start center; padding: 2.5rem 1rem; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
        .kartu { max-width: 30rem; width: 100%; background: #fff; border-radius: 10px; padding: 2rem; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
        .lencana { display: inline-block; padding: .45rem .9rem; border-radius: 999px; font-weight: 700; font-size: .95rem; }
        .lencana.sah { background: #e2efeb; color: #0e6b5b; }
        .lencana.tidak { background: #fbecea; color: #9b3520; }
        .pesan { margin: 1rem 0 1.4rem; line-height: 1.55; }
        dl { display: grid; gap: .7rem; margin: 0 0 1.4rem; }
        dl div { display: flex; flex-direction: column; }
        dt { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: #78838d; }
        dd { margin: .15rem 0 0; font-weight: 600; }
        .sidik { display: flex; align-items: baseline; gap: .7rem; padding: .8rem 1rem; background: #f4f6f8; border-radius: 6px; }
        .sidik .label { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: #78838d; }
        .sidik code { font-family: ui-monospace, Menlo, monospace; font-size: 1.15rem; letter-spacing: .12em; font-weight: 600; }
        .banding { margin-top: .7rem; font-size: .85rem; color: #55606b; line-height: 1.5; }
        .kaki { margin-top: 1.4rem; font-size: .78rem; color: #78838d; line-height: 1.5; }
      `}</style>
    </div>
  );
}

import { useState } from 'react';
import { api } from '../api';

export default function Duplo() {
  const [kode, setKode] = useState('');
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState(null);
  const [nilai, setNilai] = useState({});
  const [hasilD, setHasilD] = useState({});

  const cari = async (k) => {
    setGalat(null); setData(null); setHasilD({});
    try { setData(await api.duplo.cari(k)); } catch (e) { setGalat(e.message); }
  };
  const simpan = async (id) => {
    try { const r = await api.duplo.simpan(id, nilai[id] || ''); setHasilD((h) => ({ ...h, [id]: r })); }
    catch (e) { setHasilD((h) => ({ ...h, [id]: { pesan: e.message, dalam_batas: false } })); }
  };
  const hasil = data?.hasil || [];

  return (
    <div>
      <div className="page-head"><h2>Pemeriksaan Duplo</h2></div>
      <p style={{ color: '#667' }}>Konfirmasi hasil meragukan dengan pembacaan kedua. Selisih di luar batas menandakan kesalahan analitik.</p>
      <div style={{ display: 'flex', gap: '.5rem', margin: '1rem 0' }}>
        <input autoFocus placeholder="Pindai / nomor permintaan" value={kode} onChange={(e) => setKode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && kode.trim() && cari(kode.trim())} style={{ minWidth: '22rem' }} />
        <button onClick={() => kode.trim() && cari(kode.trim())}>Cari</button>
      </div>
      {galat && <p style={{ color: '#b93a25' }}>{galat}</p>}
      {data && (<>
        <p><b>{data.pasien}</b> — RM {data.no_rm}</p>
        <table className="tabel" style={{ maxWidth: '55rem' }}>
          <thead><tr><th>Pemeriksaan</th><th>Nilai ke-1</th><th>Nilai ke-2</th><th></th><th>Selisih</th></tr></thead>
          <tbody>
            {hasil.map((h) => { const r = hasilD[h.id]; return (
              <tr key={h.id}>
                <td>{h.pemeriksaan}</td><td>{h.nilai} {h.unit}</td>
                <td><input style={{ width: '6rem' }} value={nilai[h.id] ?? (h.duplo_nilai || '')} onChange={(e) => setNilai((n) => ({ ...n, [h.id]: e.target.value }))} /></td>
                <td><button onClick={() => simpan(h.id)}>Bandingkan</button></td>
                <td>{r ? <span style={{ color: r.dalam_batas ? '#1a7f4b' : '#b93a25', fontSize: '.82rem' }}>{typeof r.selisih_persen === 'number' ? `${r.selisih_persen}% — ` : ''}{r.pesan}</span>
                  : h.duplo_selisih_persen != null ? <span style={{ color: h.duplo_dalam_batas ? '#1a7f4b' : '#b93a25', fontSize: '.82rem' }}>{h.duplo_selisih_persen}% {h.duplo_dalam_batas ? '(dalam batas)' : '(di luar)'}</span> : null}</td>
              </tr>); })}
            {hasil.length === 0 && <tr><td colSpan={5} style={{ color: '#889' }}>Tidak ada hasil numerik.</td></tr>}
          </tbody>
        </table>
      </>)}
    </div>
  );
}

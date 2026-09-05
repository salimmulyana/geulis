import { useState } from 'react';
import { api } from '../api';
const hariIni = () => new Date().toISOString().slice(0, 10);
const JENIS = [['per_parameter','Per Pemeriksaan'],['per_ruang','Per Ruang Pengirim'],['per_hari','Per Hari']];

export default function LaporanRekap() {
  const [jenis, setJenis] = useState('per_parameter');
  const [dari, setDari] = useState(hariIni());
  const [sampai, setSampai] = useState(hariIni());
  const [baris, setBaris] = useState([]);
  const [sudah, setSudah] = useState(false);
  const [galat, setGalat] = useState(null);

  const tampil = async () => {
    setGalat(null);
    try { const r = await api.laporanRekap(jenis, dari, sampai); setBaris(r.baris || []); setSudah(true); }
    catch (e) { setGalat(e.message); }
  };
  const kolom = baris.length ? Object.keys(baris[0]) : [];
  const unduh = () => {
    if (!baris.length) return;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const isi = [kolom.join(','), ...baris.map((b) => kolom.map((k) => esc(b[k])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([isi], { type: 'text/csv' }));
    a.download = `laporan_${jenis}_${dari}_${sampai}.csv`; a.click();
  };

  return (
    <div>
      <div className="page-head"><h2>Laporan Rekap</h2></div>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-end', flexWrap: 'wrap', margin: '1rem 0' }}>
        <div><label style={{ display: 'block', fontSize: '.8rem' }}>Jenis</label>
          <select value={jenis} onChange={(e) => setJenis(e.target.value)}>{JENIS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        <div><label style={{ display: 'block', fontSize: '.8rem' }}>Dari</label><input type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></div>
        <div><label style={{ display: 'block', fontSize: '.8rem' }}>Sampai</label><input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></div>
        <button onClick={tampil}>Tampilkan</button>
        {baris.length > 0 && <button onClick={unduh} style={{ background: '#889' }}>Unduh CSV</button>}
      </div>
      {galat && <p style={{ color: '#b93a25' }}>{galat}</p>}
      {sudah && (baris.length === 0 ? <p style={{ color: '#889' }}>Tidak ada data.</p> : (
        <table className="tabel"><thead><tr>{kolom.map((k) => <th key={k}>{k}</th>)}</tr></thead>
          <tbody>{baris.map((b, i) => <tr key={i}>{kolom.map((k) => <td key={k}>{String(b[k])}</td>)}</tr>)}</tbody></table>
      ))}
    </div>
  );
}

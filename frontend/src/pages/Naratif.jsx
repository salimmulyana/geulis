import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Naratif() {
  const [templates, setTemplates] = useState([]);
  const [jenis, setJenis] = useState('');
  const [kode, setKode] = useState('');
  const [reqId, setReqId] = useState(null);
  const [info, setInfo] = useState(null);
  const [isi, setIsi] = useState({});
  const [terverif, setTerverif] = useState(false);
  const [galat, setGalat] = useState(null);
  const [pesan, setPesan] = useState(null);

  useEffect(() => { api.naratif.template().then((t) => { setTemplates(t); if (t.length) setJenis(t[0].kode); }).catch(() => {}); }, []);
  const tpl = templates.find((t) => t.kode === jenis);

  const muatIsi = (n, j) => { const row = (n.hasil || []).find((h) => h.jenis === j); setIsi(row?.isi || {}); setTerverif(!!row?.verified_at); };
  useEffect(() => { if (info) muatIsi(info, jenis); }, [jenis]); // eslint-disable-line

  const cari = async () => {
    setGalat(null); setPesan(null); setInfo(null); setReqId(null);
    try {
      const p = await api.verifSpesimen.cari(kode.trim());
      const id = p.id; const n = await api.naratif.ambil(id);
      setReqId(id); setInfo(n); muatIsi(n, jenis);
    } catch (e) { setGalat(e.message); }
  };
  const simpan = async () => { try { await api.naratif.simpan(reqId, jenis, isi); setPesan('Tersimpan.'); setTerverif(false); } catch (e) { setGalat(e.message); } };
  const verif = async () => { try { await api.naratif.verifikasi(reqId, jenis); setPesan('Terverifikasi.'); setTerverif(true); } catch (e) { setGalat(e.message); } };

  return (
    <div>
      <div className="page-head"><h2>Hasil Naratif</h2></div>
      <p style={{ color: '#667' }}>Gambaran darah tepi, patologi anatomi, sumsum tulang — deskripsi terstruktur per bagian.</p>
      <div style={{ display: 'flex', gap: '.5rem', margin: '1rem 0', flexWrap: 'wrap' }}>
        <select value={jenis} onChange={(e) => setJenis(e.target.value)}>{templates.map((t) => <option key={t.kode} value={t.kode}>{t.nama}</option>)}</select>
        <input placeholder="Pindai / nomor permintaan" value={kode} onChange={(e) => setKode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && kode.trim() && cari()} style={{ minWidth: '20rem' }} />
        <button onClick={cari} disabled={!kode.trim()}>Buka</button>
      </div>
      {galat && <p style={{ color: '#b93a25' }}>{galat}</p>}
      {pesan && <p style={{ color: '#1a7f4b' }}>{pesan}</p>}
      {info && tpl && (
        <div style={{ maxWidth: '48rem', border: '1px solid #e3e6ea', borderRadius: 8, padding: '1.2rem' }}>
          <p><b>{info.pasien}</b> — RM {info.no_rm} · {info.request_no} {terverif && <span style={{ color: '#1a7f4b' }}>✓ terverifikasi</span>}</p>
          {tpl.bagian.map((b) => (
            <div key={b} style={{ marginTop: '.6rem' }}>
              <label style={{ display: 'block', fontSize: '.85rem', color: '#556' }}>{b}</label>
              <textarea rows={['Mikroskopis','Kesan','Kesimpulan'].includes(b) ? 4 : 2} value={isi[b] || ''}
                onChange={(e) => setIsi((s) => ({ ...s, [b]: e.target.value }))} style={{ width: '100%' }} />
            </div>
          ))}
          <div style={{ marginTop: '1rem', display: 'flex', gap: '.5rem' }}>
            <button onClick={simpan}>Simpan</button><button onClick={verif} style={{ background: '#889' }}>Verifikasi</button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useRef } from 'react';
import { api } from '../api';

const KONDISI = ['Lisis', 'Kurang volume', 'Beku / ada bekuan', 'Salah wadah / antikoagulan',
  'Tanpa label / label tidak cocok', 'Hemolisis berat', 'Lipemik', 'Ikterik', 'Bocor / tumpah'];

export default function VerifSpesimen() {
  const [kode, setKode] = useState('');
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState(null);
  const [pesan, setPesan] = useState(null);
  const [layak, setLayak] = useState(true);
  const [kondisi, setKondisi] = useState('');
  const [catatan, setCatatan] = useState('');
  const inp = useRef(null);

  const cari = async (k) => {
    setGalat(null); setPesan(null); setData(null);
    try { const d = await api.verifSpesimen.cari(k); setData(d); setLayak(true); setKondisi(''); setCatatan(''); }
    catch (e) { setGalat(e.message); }
  };
  const simpan = async () => {
    try {
      const r = await api.verifSpesimen.simpan(data.id, { layak, kondisi, catatan });
      setPesan(r.ditolak ? 'Spesimen ditolak. Permintaan tidak dilanjutkan; sampel perlu diambil ulang.' : 'Spesimen dinyatakan layak.');
      setData(null); setKode(''); inp.current?.focus();
    } catch (e) { setGalat(e.message); }
  };

  return (
    <div>
      <div className="page-head"><h2>Verifikasi Spesimen</h2></div>
      <p style={{ color: '#667', maxWidth: '46rem' }}>Periksa kelayakan spesimen sebelum dikerjakan. Yang tidak layak ditolak beserta alasannya agar bisa diambil ulang.</p>
      <div style={{ display: 'flex', gap: '.5rem', margin: '1rem 0' }}>
        <input ref={inp} autoFocus placeholder="Pindai / nomor permintaan" value={kode}
          onChange={(e) => setKode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && kode.trim() && cari(kode.trim())}
          style={{ minWidth: '22rem' }} />
        <button onClick={() => kode.trim() && cari(kode.trim())}>Cari</button>
      </div>
      {galat && <p style={{ color: '#b93a25' }}>{galat}</p>}
      {pesan && <p style={{ color: '#1a7f4b' }}>{pesan}</p>}
      {data && (
        <div style={{ maxWidth: '40rem', border: '1px solid #e3e6ea', borderRadius: 8, padding: '1.2rem' }}>
          <table><tbody>
            <tr><th style={{ textAlign: 'left', paddingRight: '1rem' }}>Pasien</th><td>{data.pasien} (RM {data.no_rm})</td></tr>
            <tr><th style={{ textAlign: 'left' }}>No. Permintaan</th><td>{data.request_no}</td></tr>
            <tr><th style={{ textAlign: 'left' }}>Jenis spesimen</th><td>{data.specimen_type || '—'}</td></tr>
            <tr><th style={{ textAlign: 'left', verticalAlign: 'top' }}>Pemeriksaan</th><td>{(data.pemeriksaan || []).map((p) => p.nama).join(', ') || '—'}</td></tr>
          </tbody></table>
          {data.sudah_diperiksa ? <p style={{ color: '#8a5a10', fontSize: '.9rem' }}>Sudah pernah diperiksa: <b>{data.layak ? 'layak' : 'tidak layak'}</b>{data.kondisi ? ` (${data.kondisi})` : ''}. Menyimpan lagi menimpanya.</p> : null}
          <div style={{ marginTop: '.75rem' }}>
            <label style={{ display: 'block' }}><input type="radio" checked={layak} onChange={() => setLayak(true)} /> Layak</label>
            <label style={{ display: 'block' }}><input type="radio" checked={!layak} onChange={() => setLayak(false)} /> Tidak layak</label>
          </div>
          {!layak && (
            <div style={{ marginTop: '.5rem' }}>
              <label>Kondisi (wajib)</label>
              <select value={kondisi} onChange={(e) => setKondisi(e.target.value)} style={{ display: 'block' }}>
                <option value="">— pilih kondisi —</option>{KONDISI.map((k) => <option key={k}>{k}</option>)}
              </select>
            </div>
          )}
          <div style={{ marginTop: '.5rem' }}><label>Catatan</label><textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} style={{ display: 'block', width: '100%' }} /></div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '.5rem' }}>
            <button onClick={simpan} style={!layak ? { background: '#b93a25' } : undefined}>{layak ? 'Nyatakan Layak' : 'Tolak Spesimen'}</button>
            <button onClick={() => { setData(null); setKode(''); }} style={{ background: '#889' }}>Batal</button>
          </div>
        </div>
      )}
    </div>
  );
}

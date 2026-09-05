import { useState, useEffect } from 'react';
import { api } from '../api';
const GOL = ['A','B','AB','O']; const KOMPONEN = ['WB','PRC','FFP','TC','Cryo','WE'];

export default function BankDarah() {
  const [tab, setTab] = useState('stok');
  return (
    <div>
      <div className="page-head"><h2>Bank Darah (BDRS)</h2></div>
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
        {[['stok','Stok Darah'],['permintaan','Permintaan & Crossmatch'],['reaksi','Reaksi Transfusi']].map(([k,n]) =>
          <button key={k} onClick={() => setTab(k)} style={tab !== k ? { background: '#889' } : undefined}>{n}</button>)}
      </div>
      {tab === 'stok' && <Stok />}
      {tab === 'permintaan' && <Permintaan />}
      {tab === 'reaksi' && <Reaksi />}
    </div>
  );
}

function Stok() {
  const [status, setStatus] = useState('tersedia');
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ golDarah: 'O', rhesus: '+', komponen: 'PRC' });
  const [buka, setBuka] = useState(false);
  const [galat, setGalat] = useState(null);
  const muat = () => api.bankDarah.stok(status).then(setRows).catch(() => {});
  useEffect(() => { muat(); }, [status]); // eslint-disable-line
  const simpan = async () => {
    setGalat(null);
    try { await api.bankDarah.tambahStok(f); setBuka(false); setF({ golDarah: 'O', rhesus: '+', komponen: 'PRC' }); muat(); }
    catch (e) { setGalat(e.message); }
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>{['tersedia','dipesan','dikeluarkan','kedaluwarsa','semua'].map((s) => <option key={s}>{s}</option>)}</select>
        <button onClick={() => setBuka(true)}>+ Kantong</button>
      </div>
      <table className="tabel"><thead><tr><th>No. Kantong</th><th>Gol</th><th>Rh</th><th>Komponen</th><th>Kedaluwarsa</th><th>Status</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} style={r.kedaluwarsa ? { color: '#b93a25' } : undefined}>
          <td>{r.no_kantong}</td><td>{r.gol_darah}</td><td>{r.rhesus}</td><td>{r.komponen}</td><td>{String(r.tgl_kedaluwarsa).slice(0,10)}</td><td>{r.status}{r.kedaluwarsa ? ' ⚠' : ''}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={6} style={{ color: '#889' }}>Tidak ada.</td></tr>}</tbody></table>
      {buka && <Modal judul="Kantong Masuk" onTutup={() => setBuka(false)} onSimpan={simpan} galat={galat}>
        <L t="No. Kantong"><input value={f.noKantong || ''} onChange={(e) => setF({ ...f, noKantong: e.target.value })} /></L>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <L t="Gol"><select value={f.golDarah} onChange={(e) => setF({ ...f, golDarah: e.target.value })}>{GOL.map((g) => <option key={g}>{g}</option>)}</select></L>
          <L t="Rh"><select value={f.rhesus} onChange={(e) => setF({ ...f, rhesus: e.target.value })}><option>+</option><option>-</option></select></L>
          <L t="Komponen"><select value={f.komponen} onChange={(e) => setF({ ...f, komponen: e.target.value })}>{KOMPONEN.map((k) => <option key={k}>{k}</option>)}</select></L>
        </div>
        <L t="Kedaluwarsa"><input type="date" value={f.tglKedaluwarsa || ''} onChange={(e) => setF({ ...f, tglKedaluwarsa: e.target.value })} /></L>
        <L t="Sumber"><input value={f.sumber || ''} onChange={(e) => setF({ ...f, sumber: e.target.value })} placeholder="PMI / dropping" /></L>
      </Modal>}
    </div>
  );
}

function Permintaan() {
  const [rows, setRows] = useState([]); const [pilih, setPilih] = useState(null);
  const muat = () => api.bankDarah.permintaan().then(setRows).catch(() => {});
  useEffect(() => { muat(); }, []); // eslint-disable-line
  return (
    <div style={{ display: 'grid', gridTemplateColumns: pilih ? '1fr 1fr' : '1fr', gap: '1rem' }}>
      <table className="tabel"><thead><tr><th>No</th><th>Pasien</th><th>Gol</th><th>Komponen</th><th>Status</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} onClick={() => setPilih(r)} style={{ cursor: 'pointer', background: pilih?.id === r.id ? '#eef' : undefined }}>
          <td>{r.no_permintaan}</td><td>{r.nama_pasien}</td><td>{r.gol_darah}{r.rhesus}</td><td>{r.komponen}</td><td>{r.status}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={5} style={{ color: '#889' }}>Belum ada.</td></tr>}</tbody></table>
      {pilih && <Crossmatch req={pilih} onSelesai={muat} />}
    </div>
  );
}

function Crossmatch({ req, onSelesai }) {
  const [stok, setStok] = useState([]); const [riwayat, setRiwayat] = useState([]);
  const [stockId, setStockId] = useState(''); const [hasil, setHasil] = useState('compatible'); const [mayor, setMayor] = useState('');
  const [pesan, setPesan] = useState(null);
  const muatR = () => api.bankDarah.crossmatchList(req.id).then(setRiwayat).catch(() => {});
  useEffect(() => { api.bankDarah.stok('tersedia').then(setStok).catch(() => {}); muatR(); }, [req.id]); // eslint-disable-line
  const simpan = async () => {
    try { const r = await api.bankDarah.crossmatch({ requestID: req.id, stockID: Number(stockId), hasil, mayor }); setPesan(r); muatR(); onSelesai(); }
    catch (e) { setPesan({ peringatan: e.message }); }
  };
  return (
    <div style={{ border: '1px solid #e3e6ea', borderRadius: 8, padding: '1rem' }}>
      <h3>Crossmatch — {req.nama_pasien}</h3>
      <p style={{ fontSize: '.85rem', color: '#667' }}>Golongan pasien: <b>{req.gol_darah || '?'}{req.rhesus}</b> · {req.komponen}</p>
      <L t="Kantong"><select value={stockId} onChange={(e) => setStockId(e.target.value)}><option value="">— pilih kantong —</option>
        {stok.map((s) => <option key={s.id} value={s.id}>{s.no_kantong} · {s.gol_darah}{s.rhesus} · {s.komponen}</option>)}</select></L>
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <L t="Mayor"><input value={mayor} onChange={(e) => setMayor(e.target.value)} placeholder="negatif = cocok" /></L>
        <L t="Hasil"><select value={hasil} onChange={(e) => setHasil(e.target.value)}><option>compatible</option><option>incompatible</option><option>pending</option></select></L>
      </div>
      <button style={{ marginTop: '.5rem' }} onClick={simpan} disabled={!stockId}>Simpan Crossmatch</button>
      {pesan?.peringatan ? <div style={{ marginTop: '.75rem', padding: '.75rem', background: '#fbecea', borderLeft: '3px solid #b93a25', borderRadius: 4 }}>
        <b style={{ color: '#b93a25' }}>⚠ Peringatan:</b> {pesan.peringatan}<div style={{ fontSize: '.8rem' }}>Sistem memperingatkan, keputusan tetap di tangan Anda dan dokter.</div></div>
        : pesan ? <p style={{ color: '#1a7f4b' }}>Crossmatch tersimpan.</p> : null}
      {riwayat.length > 0 && <table className="tabel" style={{ marginTop: '1rem' }}><thead><tr><th>Kantong</th><th>Gol</th><th>Hasil</th><th>Peringatan</th></tr></thead>
        <tbody>{riwayat.map((x) => <tr key={x.id}><td>{x.no_kantong}</td><td>{x.gol_darah}{x.rhesus}</td>
          <td style={{ color: x.hasil === 'incompatible' ? '#b93a25' : undefined }}>{x.hasil}</td><td style={{ color: '#b93a25', fontSize: '.8rem' }}>{x.peringatan}</td></tr>)}</tbody></table>}
    </div>
  );
}

function Reaksi() {
  const [rows, setRows] = useState([]); const [buka, setBuka] = useState(false); const [f, setF] = useState({});
  const muat = () => api.bankDarah.reaksi().then(setRows).catch(() => {});
  useEffect(() => { muat(); }, []); // eslint-disable-line
  const simpan = async () => { try { await api.bankDarah.buatReaksi(f); setBuka(false); setF({}); muat(); } catch { /* */ } };
  return (
    <div>
      <button onClick={() => setBuka(true)} style={{ marginBottom: '.5rem' }}>+ Catat Reaksi</button>
      <table className="tabel"><thead><tr><th>Tanggal</th><th>Pasien</th><th>Kantong</th><th>Jenis</th><th>Tindakan</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{String(r.tgl).slice(0,16).replace('T',' ')}</td><td>{r.nama_pasien}</td><td>{r.no_kantong}</td><td>{r.jenis_reaksi}</td><td>{r.tindakan}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={5} style={{ color: '#889' }}>Belum ada.</td></tr>}</tbody></table>
      {buka && <Modal judul="Catat Reaksi Transfusi" onTutup={() => setBuka(false)} onSimpan={simpan}>
        <L t="Nama Pasien"><input value={f.namaPasien || ''} onChange={(e) => setF({ ...f, namaPasien: e.target.value })} /></L>
        <div style={{ display: 'flex', gap: '.5rem' }}><L t="No. RM"><input value={f.noRM || ''} onChange={(e) => setF({ ...f, noRM: e.target.value })} /></L>
          <L t="No. Kantong"><input value={f.noKantong || ''} onChange={(e) => setF({ ...f, noKantong: e.target.value })} /></L></div>
        <L t="Jenis Reaksi"><input value={f.jenisReaksi || ''} onChange={(e) => setF({ ...f, jenisReaksi: e.target.value })} placeholder="demam / alergi / hemolitik" /></L>
        <L t="Tindakan"><textarea rows={2} value={f.tindakan || ''} onChange={(e) => setF({ ...f, tindakan: e.target.value })} /></L>
      </Modal>}
    </div>
  );
}

function L({ t, children }) { return <div style={{ marginTop: '.4rem' }}><label style={{ display: 'block', fontSize: '.8rem', color: '#556' }}>{t}</label>{children}</div>; }
function Modal({ judul, children, onTutup, onSimpan, galat }) {
  return <div onClick={onTutup} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', padding: '1.4rem', borderRadius: 8, minWidth: '26rem', maxHeight: '90vh', overflowY: 'auto' }}>
      <h3>{judul}</h3>{galat && <p style={{ color: '#b93a25' }}>{galat}</p>}{children}
      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '.5rem' }}>
        <button onClick={onTutup} style={{ background: '#889' }}>Batal</button><button onClick={onSimpan}>Simpan</button></div>
    </div></div>;
}

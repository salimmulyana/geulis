import { useState, useEffect } from 'react';
import { api } from '../api';
const SPESIMEN = ['Darah','Urin','Sputum','Pus','Feses','Swab','Cairan tubuh','Jaringan'];

export default function Mikrobiologi() {
  const [rows, setRows] = useState([]); const [pilih, setPilih] = useState(null);
  const [buka, setBuka] = useState(false); const [f, setF] = useState({ spesimen: 'Darah' });
  const muat = () => api.mikro.kulturList().then(setRows).catch(() => {});
  useEffect(() => { muat(); }, []); // eslint-disable-line
  const buat = async () => { try { await api.mikro.kulturBuat(f); setBuka(false); setF({ spesimen: 'Darah' }); muat(); } catch { /* */ } };
  return (
    <div>
      <div className="page-head"><h2>Mikrobiologi Kultur</h2><button onClick={() => setBuka(true)}>+ Kultur Baru</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: pilih ? '1fr 1.4fr' : '1fr', gap: '1rem' }}>
        <table className="tabel"><thead><tr><th>Pasien</th><th>Spesimen</th><th>Pertumbuhan</th><th>Organisme</th><th>Status</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} onClick={() => setPilih(r.id)} style={{ cursor: 'pointer', background: pilih === r.id ? '#eef' : undefined }}>
            <td>{r.nama_pasien}</td><td>{r.spesimen}</td><td>{r.pertumbuhan}</td><td>{r.organisme || '—'}</td><td>{r.status}</td></tr>)}
            {rows.length === 0 && <tr><td colSpan={5} style={{ color: '#889' }}>Belum ada kultur.</td></tr>}</tbody></table>
        {pilih && <Detail id={pilih} onUbah={muat} />}
      </div>
      {buka && <div onClick={() => setBuka(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', padding: '1.4rem', borderRadius: 8, minWidth: '24rem' }}>
          <h3>Kultur Baru</h3>
          <div><label style={{ fontSize: '.8rem' }}>Nama Pasien</label><input value={f.namaPasien || ''} onChange={(e) => setF({ ...f, namaPasien: e.target.value })} style={{ display: 'block', width: '100%' }} /></div>
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.4rem' }}>
            <div><label style={{ fontSize: '.8rem' }}>No. RM</label><input value={f.noRM || ''} onChange={(e) => setF({ ...f, noRM: e.target.value })} /></div>
            <div><label style={{ fontSize: '.8rem' }}>Spesimen</label><select value={f.spesimen} onChange={(e) => setF({ ...f, spesimen: e.target.value })}>{SPESIMEN.map((s) => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '.5rem' }}>
            <button onClick={() => setBuka(false)} style={{ background: '#889' }}>Batal</button><button onClick={buat} disabled={!f.namaPasien}>Simpan</button></div>
        </div></div>}
    </div>
  );
}

function Detail({ id, onUbah }) {
  const [data, setData] = useState(null); const [org, setOrg] = useState([]); const [ab, setAb] = useState([]);
  const [pert, setPert] = useState('menunggu'); const [orgId, setOrgId] = useState('');
  const [abId, setAbId] = useState(''); const [zona, setZona] = useState(''); const [sir, setSir] = useState('');
  const muat = () => api.mikro.kulturAmbil(id).then((d) => { setData(d); setPert(d.kultur?.pertumbuhan || 'menunggu'); setOrgId(d.kultur?.organism_id || ''); }).catch(() => {});
  useEffect(() => { muat(); api.mikro.organisme().then(setOrg); api.mikro.antibiotik().then(setAb); }, [id]); // eslint-disable-line
  if (!data) return null;
  const k = data.kultur || {}; const ast = data.antibiogram || []; const adaTumbuh = pert === 'ada';
  const simpanTumbuh = async () => { await api.mikro.pertumbuhan(id, { pertumbuhan: pert, organismID: orgId ? Number(orgId) : null }); muat(); onUbah(); };
  const tambahAst = async () => { if (!abId) return; await api.mikro.simpanAst(id, { antibioticID: Number(abId), metode: 'disk', zonaMm: zona ? Number(zona) : null, sir }); setAbId(''); setZona(''); setSir(''); muat(); };
  return (
    <div style={{ border: '1px solid #e3e6ea', borderRadius: 8, padding: '1rem' }}>
      <h3>{k.nama_pasien} · {k.spesimen}</h3>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-end', marginTop: '.5rem' }}>
        <div><label style={{ display: 'block', fontSize: '.8rem' }}>Pertumbuhan</label>
          <select value={pert} onChange={(e) => setPert(e.target.value)}><option value="menunggu">menunggu</option><option value="tidak ada">tidak ada (steril)</option><option value="ada">ada</option></select></div>
        {adaTumbuh && <div><label style={{ display: 'block', fontSize: '.8rem' }}>Organisme</label>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}><option value="">— pilih —</option>{org.map((o) => <option key={o.id} value={o.id}>{o.nama}</option>)}</select></div>}
        <button onClick={simpanTumbuh}>Simpan</button>
      </div>
      {adaTumbuh && <div style={{ marginTop: '1rem' }}>
        <h4>Antibiogram</h4>
        <p style={{ fontSize: '.78rem', color: '#889' }}>Interpretasi S/I/R diisi petugas. Auto dari breakpoint CLSI/EUCAST menyusul setelah tabel resmi dimuat.</p>
        <table className="tabel"><thead><tr><th>Antibiotik</th><th>Zona (mm)</th><th>S/I/R</th><th></th></tr></thead>
          <tbody>{ast.map((a) => <tr key={a.id}><td>{a.nama}</td><td>{a.zona_mm}</td>
            <td><b style={{ color: a.sir === 'R' ? '#b93a25' : a.sir === 'S' ? '#1a7f4b' : undefined }}>{a.sir}</b></td>
            <td><button onClick={() => api.mikro.hapusAst(a.id).then(muat)} style={{ background: '#889', fontSize: '.75rem' }}>hapus</button></td></tr>)}</tbody></table>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-end', marginTop: '.5rem' }}>
          <div><label style={{ display: 'block', fontSize: '.8rem' }}>Antibiotik</label><select value={abId} onChange={(e) => setAbId(e.target.value)}><option value="">— pilih —</option>{ab.map((a) => <option key={a.id} value={a.id}>{a.nama}</option>)}</select></div>
          <div><label style={{ display: 'block', fontSize: '.8rem' }}>Zona</label><input style={{ width: '5rem' }} value={zona} onChange={(e) => setZona(e.target.value)} /></div>
          <div><label style={{ display: 'block', fontSize: '.8rem' }}>S/I/R</label><select value={sir} onChange={(e) => setSir(e.target.value)}><option value="">—</option><option>S</option><option>I</option><option>R</option></select></div>
          <button onClick={tambahAst} disabled={!abId}>Tambah</button>
        </div>
      </div>}
      <div style={{ marginTop: '1rem' }}><button onClick={() => api.mikro.verifikasi(id).then(() => { muat(); onUbah(); })}>Verifikasi & Selesai</button></div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import ReportModal from '../components/ReportModal';
import EditResultsModal from '../components/EditResultsModal';
import InputResultsModal from '../components/InputResultsModal';
import BarcodeLabel from '../components/BarcodeLabel';
import Swal from 'sweetalert2';

export default function Requests() {
  const { can, user } = useAuth();
  const [list, setList] = useState([]);
  const [patients, setPatients] = useState([]);
  const [tests, setTests] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  const [testSearch, setTestSearch] = useState('');
  const [editId, setEditId] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [inputResultsData, setInputResultsData] = useState(null);
  const [labelData, setLabelData] = useState(null);
  const [form, setForm] = useState({ patient_id: '', test_ids: [], priority: 'normal', notes: '', simrs_order_id: '' });

  const load = () => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diff = Math.ceil(Math.abs(e - s) / (1000 * 60 * 60 * 24));
    if (diff > 31) {
      Swal.fire('Peringatan', 'Periode tanggal maksimal 1 bulan (31 hari)', 'warning');
      return;
    }
    api.requests.list(q, filter || undefined, startDate, endDate).then(setList);
  };
  
  useEffect(() => {
    load();
    api.patients.list('').then(setPatients);
    api.tests.list().then(setTests);
    
    const interval = setInterval(() => {
      load();
    }, 15000);
    return () => clearInterval(interval);
  }, [q, filter, startDate, endDate]);

  const toggleTest = (id) => {
    const ids = form.test_ids.includes(id) ? form.test_ids.filter((x) => x !== id) : [...form.test_ids, id];
    setForm({ ...form, test_ids: ids });
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.requests.update(editId, { ...form, test_ids: form.test_ids });
      } else {
        await api.requests.create({ ...form, patient_id: Number(form.patient_id), test_ids: form.test_ids });
      }
      setShowForm(false);
      setEditId(null);
      setForm({ patient_id: '', test_ids: [], priority: 'normal', notes: '', simrs_order_id: '' });
      load();
      Swal.fire('Berhasil!', 'Permintaan lab berhasil disimpan.', 'success');
    } catch (err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  const edit = async (r) => {
    const data = await api.requests.get(r.id);
    setForm({
      patient_id: data.patient_id,
      test_ids: data.items.map(i => i.test_id),
      priority: data.priority,
      notes: data.notes || '',
      simrs_order_id: data.simrs_order_id || ''
    });
    setEditId(r.id);
    setShowForm(true);
  };

  const setStatus = async (id, status) => {
    await api.requests.setStatus(id, status);
    load();
  };

  const deleteRequest = async (r) => {
    const res = await Swal.fire({ 
      title: `Hapus permintaan ${r.request_no}?`, 
      text: 'Semua hasil lab yang terhubung dengan permintaan ini juga akan ikut terhapus.',
      icon: 'warning', 
      showCancelButton: true, 
      confirmButtonText: 'Ya, Hapus', 
      cancelButtonText: 'Batal' 
    });
    if (!res.isConfirmed) return;
    try {
      await api.requests.remove(r.id);
      load();
      Swal.fire('Berhasil!', 'Permintaan dihapus.', 'success');
    } catch(err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  const filteredTests = tests.filter(t => 
    t.show_in_report && (
      t.name.toLowerCase().includes(testSearch.toLowerCase()) || 
      t.code.toLowerCase().includes(testSearch.toLowerCase())
    )
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Permintaan Laboratorium</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="secondary" onClick={load}>🔄 Refresh Data</button>
          {can('requests.manage') && <button onClick={() => setShowForm(true)}>+ Permintaan Baru</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input 
          type="text" 
          placeholder="Cari No. Req, nama, atau No. RM pasien..." 
          value={q} 
          onChange={(e) => setQ(e.target.value)} 
          style={{ width: 360 }} 
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Semua status</option>
          <option value="pending">Menunggu (Pending)</option>
          <option value="collected">Collected</option>
          <option value="processing">Sedang Dikerjakan</option>
          <option value="completed">Selesai</option>
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)} 
            style={{ maxWidth: 150 }}
          />
          <span> - </span>
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)} 
            style={{ maxWidth: 150 }}
          />
        </div>
      </div>

      {showForm && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>{editId ? 'Edit Permintaan' : 'Permintaan Baru'}</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Pasien</label>
              <select required value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })} disabled={!!editId}>
                <option value="">Pilih pasien</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.medical_record_no} — {p.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Prioritas</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="normal">Normal</option>
                <option value="cito">Cito</option>
                <option value="stat">STAT</option>
              </select>
            </div>
          </div>
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ margin: 0 }}>Pemeriksaan</label>
              <input 
                type="text" 
                placeholder="Cari tes..." 
                value={testSearch} 
                onChange={(e) => setTestSearch(e.target.value)} 
                style={{ width: '250px', padding: '0.35rem 0.5rem' }} 
              />
            </div>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <table style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center', padding: '0.5rem' }}>✓</th>
                    <th style={{ padding: '0.5rem' }}>Kode / Nama Pemeriksaan</th>
                    <th style={{ padding: '0.5rem' }}>Satuan</th>
                    <th style={{ padding: '0.5rem' }}>Nilai Rujukan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTests.map((t) => (
                    <tr 
                      key={t.id} 
                      onClick={() => toggleTest(t.id)}
                      style={{ cursor: 'pointer', background: form.test_ids.includes(t.id) ? 'rgba(79, 70, 229, 0.1)' : 'transparent' }}
                    >
                      <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                        <input type="checkbox" checked={form.test_ids.includes(t.id)} readOnly style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <strong>{t.code}</strong> — {t.name}
                      </td>
                      <td style={{ padding: '0.5rem' }}>{t.unit || '—'}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {t.reference_min != null || t.reference_max != null 
                          ? `${t.reference_min != null ? Number(t.reference_min) : ''} - ${t.reference_max != null ? Number(t.reference_max) : ''}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {filteredTests.length === 0 && (
                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '1rem' }}>Pemeriksaan tidak ditemukan.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="form-group"><label>Catatan</label><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" disabled={!form.test_ids.length}>Simpan</button>
            <button type="button" className="secondary" onClick={() => { setShowForm(false); setEditId(null); setForm({ patient_id: '', test_ids: [], priority: 'normal', notes: '', simrs_order_id: '' }); }}>Batal</button>
          </div>
        </form>
      )}

      <div className="card">
        <table>
          <thead><tr><th>No. Permintaan</th><th>Pasien</th><th>RM</th><th>Prioritas</th><th>Status</th><th>Waktu</th><th>Aksi</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{r.request_no}</div>
                  {r.simrs_order_id && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '2px' }} title="Nomor Order SIMRS">
                      {r.simrs_order_id}
                    </div>
                  )}
                </td>
                <td>{r.patient_name}</td>
                <td>{r.medical_record_no}</td>
                <td><span className={`badge ${r.priority === 'cito' ? 'cito' : ''}`}>{r.priority}</span></td>
                <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                <td>{new Date(r.requested_at).toLocaleString('id-ID')}</td>
                <td>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {can('requests.manage') && r.status === 'pending' && (
                      <button type="button" className="secondary btn-sm" onClick={() => edit(r)}>Edit</button>
                    )}
                    {can('requests.manage') && r.status === 'pending' && (
                      <button type="button" className="primary btn-sm" onClick={() => setStatus(r.id, 'collected')}>Ambil Sampel</button>
                    )}
                    {can('requests.manage') && r.status === 'collected' && (
                      <button type="button" className="primary btn-sm" onClick={() => setStatus(r.id, 'processing')}>Proses Sampel</button>
                    )}
                    {can('requests.manage') && r.status === 'processing' && (
                      <button type="button" className="primary btn-sm" onClick={() => setStatus(r.id, 'completed')}>Selesai</button>
                    )}
                    {(r.status === 'completed' || r.status === 'processing') && (
                      <>
                        <button type="button" className="secondary btn-sm" style={{ background: '#059669', color: '#fff', borderColor: '#059669' }} onClick={() => setInputResultsData(r)}>📝 Isi / Edit Hasil</button>
                        <button type="button" className="secondary btn-sm" style={{ background: '#4f46e5', color: '#fff', borderColor: '#4f46e5' }} onClick={() => setReportData(r)}>Lihat Hasil</button>
                      </>
                    )}
                    
                    <button type="button" className="secondary btn-sm" title="Cetak label barcode tabung" onClick={() => setLabelData(r)}>🏷️ Label</button>
                    <button type="button" className="danger btn-sm" onClick={() => deleteRequest(r)}>Hapus</button>

                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reportData && (
        <ReportModal 
          patient={{ id: reportData.patient_id, name: reportData.patient_name, medical_record_no: reportData.medical_record_no }} 
          requestId={reportData.id} 
          onClose={() => setReportData(null)} 
        />
      )}
      
      {inputResultsData && (
        <InputResultsModal
          requestData={inputResultsData}
          onClose={() => setInputResultsData(null)}
          onSave={() => {
            setInputResultsData(null);
            load();
          }}
        />
      )}

      {labelData && (
        <BarcodeLabel
          order={{
            request_no: labelData.request_no,
            patient_name: labelData.patient_name,
            medical_record_no: labelData.medical_record_no,
            priority: labelData.priority,
            barcodeValue: labelData.simrs_order_id || labelData.medical_record_no || labelData.request_no,
          }}
          onClose={() => setLabelData(null)}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import ReportModal from '../components/ReportModal';
import TrendModal from '../components/TrendModal';
import Swal from 'sweetalert2';

function exportGroupsCsv(rows) {
  const header = ['No. Permintaan', 'No. RM', 'Nama Pasien', 'JK', 'Tanggal', 'Waktu Hasil'];
  const lines = rows.map((r) => [
    r.request_no || 'Manual', r.medical_record_no, r.patient_name, r.gender || '',
    r.exam_date ? new Date(r.exam_date).toLocaleDateString('id-ID') : '',
    r.latest_result_at ? new Date(r.latest_result_at).toLocaleString('id-ID') : '',
  ]);
  const csv = [header, ...lines].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hasil-lab-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function printWorklist(rows) {
  const now = new Date().toLocaleString('id-ID');
  const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.request_no || 'Manual'}</td><td>${r.medical_record_no}</td><td>${r.patient_name}</td><td>${r.gender || ''}</td><td>${r.exam_date ? new Date(r.exam_date).toLocaleDateString('id-ID') : ''}</td></tr>`).join('');
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Worklist Lab</title><style>body{font-family:sans-serif;padding:1.5rem}h2{margin:0}table{width:100%;border-collapse:collapse;margin-top:1rem}th,td{border:1px solid #333;padding:6px 8px;text-align:left;font-size:13px}th{background:#eee}</style></head><body><h2>WORKLIST LABORATORIUM</h2><small>Dicetak: ${now} — ${rows.length} pasien</small><table><thead><tr><th>No</th><th>No. Permintaan</th><th>No. RM</th><th>Nama Pasien</th><th>JK</th><th>Tanggal</th></tr></thead><tbody>${body}</tbody></table><script>window.print()</script></body></html>`);
  w.document.close();
}

export default function Results() {
  const { can, user } = useAuth();
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeRequests, setActiveRequests] = useState([]);
  const [tests, setTests] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ patient_id: '', test_id: '', result_value: '', unit: '' });
  const [reportPatient, setReportPatient] = useState(null);
  const [trendPatient, setTrendPatient] = useState(null);

  const load = () => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diff = Math.ceil(Math.abs(e - s) / (1000 * 60 * 60 * 24));
    if (diff > 31) {
      Swal.fire('Peringatan', 'Periode tanggal maksimal 1 bulan (31 hari)', 'warning');
      return;
    }
    api.results.groups(q, startDate, endDate).then(setList).catch(console.error);
  };

  useEffect(() => {
    load();
    Promise.all([
      api.requests.list('collected'),
      api.requests.list('processing')
    ]).then(([col, pro]) => {
      setActiveRequests([...col, ...pro]);
    });
    api.tests.list().then(setTests);
    
    const interval = setInterval(() => {
      load();
      Promise.all([
        api.requests.list('collected'),
        api.requests.list('processing')
      ]).then(([col, pro]) => {
        setActiveRequests([...col, ...pro]);
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [q, startDate, endDate]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.results.create({
        patient_id: Number(form.patient_id),
        test_id: Number(form.test_id),
        result_value: form.result_value,
        unit: form.unit || undefined,
      });
      setShowForm(false);
      load();
      Swal.fire('Berhasil', 'Hasil manual disimpan', 'success');
    } catch (err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  const verifyGroup = async (r) => {
    const res = await Swal.fire({
      title: `Verifikasi hasil ${r.patient_name}?`,
      text: 'Hasil yang diverifikasi menjadi final dan dapat ditarik SIMRS.',
      icon: 'question', showCancelButton: true, confirmButtonText: 'Ya, Verifikasi', cancelButtonText: 'Batal', confirmButtonColor: '#059669',
    });
    if (!res.isConfirmed) return;
    try {
      const dateStr = new Date(r.exam_date).toISOString().split('T')[0];
      const out = await api.results.verifyGroup(r.patient_id, dateStr);
      load();
      Swal.fire('Berhasil', `${out.verified} hasil diverifikasi.`, 'success');
    } catch (err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  const deleteResultGroup = async (r) => {
    const res = await Swal.fire({ title: `Hapus semua hasil ${r.patient_name} di tanggal ini?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya', cancelButtonText: 'Batal' });
    if (!res.isConfirmed) return;
    try {
      // r.exam_date is already in YYYY-MM-DD format from API (if we extract it, wait, let's just pass r.exam_date)
      // Actually `exam_date` is returned as a date string from mysql, wait it might be full ISO string from mysql
      // So let's extract just the YYYY-MM-DD part:
      const dateStr = new Date(r.exam_date).toISOString().split('T')[0];
      await api.results.removeGroup(r.patient_id, dateStr);
      load();
      Swal.fire('Berhasil!', 'Data hasil dihapus.', 'success');
    } catch(err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Hasil Laboratorium</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="secondary" onClick={load}>🔄 Refresh</button>
          <button type="button" className="secondary" onClick={() => list.length ? exportGroupsCsv(list) : Swal.fire('Info', 'Tidak ada data untuk diexport', 'info')}>⬇️ Export CSV</button>
          <button type="button" className="secondary" onClick={() => list.length ? printWorklist(list) : Swal.fire('Info', 'Tidak ada data', 'info')}>🖨️ Worklist</button>
          {can('results.manage') && <button onClick={() => setShowForm(true)}>+ Input Manual</button>}
        </div>
      </div>

      <p style={{ color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Hasil pemeriksaan dikelompokkan per pasien. Gunakan pencarian untuk menemukan riwayat spesifik.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
        <input 
          type="text" 
          placeholder="Cari nama atau No. RM pasien..." 
          value={q} 
          onChange={(e) => setQ(e.target.value)} 
          style={{ width: 360 }} 
        />
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
          <h2 style={{ marginBottom: '1rem' }}>Input Hasil Manual</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Pasien (Nomor Permintaan)</label>
              <select required value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}>
                <option value="">Pilih</option>
                {activeRequests.map((r) => <option key={r.id} value={r.patient_id}>{r.medical_record_no} — {r.patient_name} ({r.request_no})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Pemeriksaan</label>
              <select required value={form.test_id} onChange={(e) => setForm({ ...form, test_id: e.target.value })}>
                <option value="">Pilih</option>
                {tests.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Nilai Hasil</label><input required value={form.result_value} onChange={(e) => setForm({ ...form, result_value: e.target.value })} /></div>
            <div className="form-group"><label>Satuan</label><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit">Simpan</button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>Batal</button>
          </div>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Nomor Permintaan</th>
              <th>Waktu Pemeriksaan</th>
              <th>No. RM</th>
              <th>Nama Pasien</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={6} style={{textAlign: 'center', padding: '1rem'}}>Tidak ada data hasil.</td></tr>
            ) : (
              list.map((r, i) => {
                const pending = Number(r.pending_verify || 0);
                const unacked = Number(r.unacked_critical || 0);
                return (
                <tr key={`${r.patient_id}-${r.exam_date}-${i}`}>
                  <td>{r.request_no || 'Manual'}</td>
                  <td>
                    {r.latest_result_at ? (
                      (() => {
                        const d = new Date(r.latest_result_at);
                        const pad = (n) => n.toString().padStart(2, '0');
                        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                      })()
                    ) : (r.exam_date ? new Date(r.exam_date).toLocaleDateString('id-ID') : '—')}
                  </td>
                  <td>{r.medical_record_no}</td>
                  <td>{r.patient_name}</td>
                  <td>
                    {unacked > 0 && <span className="badge critical" title="Ada hasil kritis belum ditindaklanjuti">🚨 {unacked}</span>}{' '}
                    {pending > 0
                      ? <span className="badge" style={{ background: '#f59e0b', color: '#fff' }} title="Belum diverifikasi">⏳ {pending} belum verifikasi</span>
                      : <span className="badge" style={{ background: '#059669', color: '#fff' }}>✓ Terverifikasi</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {can('results.manage') && pending > 0 && (
                        <button className="btn-sm" type="button" style={{ background: '#059669', color: '#fff' }} onClick={() => verifyGroup(r)}>
                          ✓ Verifikasi
                        </button>
                      )}
                      <button className="primary btn-sm" type="button" onClick={() => setReportPatient({ id: r.patient_id, name: r.patient_name, medical_record_no: r.medical_record_no, gender: r.gender, birth_date: r.birth_date, order_no: r.order_no })}>
                        📄 Lihat
                      </button>
                      <button className="secondary btn-sm" type="button" onClick={() => setTrendPatient({ id: r.patient_id, name: r.patient_name })}>
                        📈 Tren
                      </button>
                      <button className="danger btn-sm" type="button" onClick={() => deleteResultGroup(r)}>
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              );})
            )}
          </tbody>
        </table>
      </div>
      
      {reportPatient && <ReportModal patient={reportPatient} onClose={() => setReportPatient(null)} />}
      {trendPatient && <TrendModal patient={trendPatient} onClose={() => setTrendPatient(null)} />}
    </div>
  );
}

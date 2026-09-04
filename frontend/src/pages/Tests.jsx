import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';

const empty = { code: '', name: '', unit: '', reference_min: '', reference_max: '', is_active: 1 };

export default function Tests() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    api.tests.list().then(setList).catch(console.error);
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editId) await api.tests.update(editId, form);
      else await api.tests.create(form);
      setShowForm(false);
      setForm(empty);
      setEditId(null);
      load();
      Swal.fire('Berhasil!', 'Parameter lab telah disimpan.', 'success');
    } catch(err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  const edit = (t) => {
    setForm({
      code: t.code || '',
      name: t.name || '',
      unit: t.unit || '',
      reference_min: t.reference_min != null ? t.reference_min : '',
      reference_max: t.reference_max != null ? t.reference_max : '',
      is_active: t.is_active
    });
    setEditId(t.id);
    setShowForm(true);
  };

  const remove = async (id) => {
    const res = await Swal.fire({ title: 'Hapus parameter ini?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya', cancelButtonText: 'Batal' });
    if (!res.isConfirmed) return;
    await api.tests.remove(id);
    load();
    Swal.fire('Terhapus!', 'Parameter telah dihapus.', 'success');
  };

  const toggleVisibility = async (t) => {
    try {
      await api.tests.setVisibility(t.id, !t.show_in_report);
      load();
    } catch (e) {
      Swal.fire('Gagal', e.message, 'error');
    }
  };

  if (user?.role?.code !== 'admin') return <p className="error-msg">Akses ditolak. Hanya Admin yang dapat mengakses Parameter Lab.</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Parameter Lab</h1>
        {!showForm && <button onClick={() => setShowForm(true)}>+ Tambah Parameter</button>}
      </div>

      {showForm && (
        <form className="card" onSubmit={save} style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>{editId ? 'Edit Parameter' : 'Tambah Parameter'}</h2>
          <div className="form-grid">
            <div className="form-group"><label>Kode Tes (LIS)</label><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="form-group"><label>Nama Tes</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Satuan (Unit)</label><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Contoh: 10*3/uL, g/dL" /></div>
            <div className="form-group"><label>Nilai Rujukan Min</label><input type="number" step="any" value={form.reference_min} onChange={(e) => setForm({ ...form, reference_min: e.target.value })} /></div>
            <div className="form-group"><label>Nilai Rujukan Max</label><input type="number" step="any" value={form.reference_max} onChange={(e) => setForm({ ...form, reference_max: e.target.value })} /></div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.is_active} onChange={(e) => setForm({ ...form, is_active: Number(e.target.value) })}>
                <option value={1}>Aktif</option>
                <option value={0}>Tidak Aktif</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit">Simpan</button>
            <button type="button" className="secondary" onClick={() => { setShowForm(false); setEditId(null); setForm(empty); }}>Batal</button>
          </div>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama Tes</th>
              <th>Satuan</th>
              <th>Nilai Rujukan</th>
              <th>Status</th>
              <th>Tampil di Cetakan</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id}>
                <td><code>{t.code}</code></td>
                <td>{t.name}</td>
                <td>{t.unit || '—'}</td>
                <td>
                  {t.reference_min != null || t.reference_max != null 
                    ? `${t.reference_min != null ? Number(t.reference_min) : ''} - ${t.reference_max != null ? Number(t.reference_max) : ''}`
                    : '—'}
                </td>
                <td>{t.is_active ? 'Aktif' : 'Nonaktif'}</td>
                <td>
                  <span className={`badge ${t.show_in_report ? 'completed' : 'pending'}`}>
                    {t.show_in_report ? 'Ya' : 'Disembunyikan'}
                  </span>
                </td>
                <td>
                  <button className="secondary btn-sm" type="button" onClick={() => toggleVisibility(t)} style={{ marginRight: '0.5rem', background: t.show_in_report ? '#ef4444' : '#10b981', color: '#fff', borderColor: 'transparent' }}>
                    {t.show_in_report ? 'Sembunyikan' : 'Tampilkan'}
                  </button>
                  <button className="secondary btn-sm" type="button" onClick={() => edit(t)} style={{ marginRight: '0.5rem' }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

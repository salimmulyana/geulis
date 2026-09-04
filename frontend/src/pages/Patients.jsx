import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';

const empty = { medical_record_no: '', name: '', birth_date: '', gender: 'L', phone: '', address: '' };

export default function Patients() {
  const { can, user } = useAuth();
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => api.patients.list(q).then(setList).catch(console.error);
  useEffect(() => { load(); }, [q]);

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editId) await api.patients.update(editId, form);
      else await api.patients.create(form);
      setShowForm(false);
      setForm(empty);
      setEditId(null);
      load();
      Swal.fire('Berhasil!', 'Data pasien telah disimpan.', 'success');
    } catch(err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  const deletePatient = async (p) => {
    const res = await Swal.fire({ title: `Hapus pasien "${p.name}"?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya', cancelButtonText: 'Batal' });
    if (!res.isConfirmed) return;
    try {
      await api.patients.remove(p.id);
      load();
      Swal.fire('Berhasil!', 'Data pasien dihapus.', 'success');
    } catch(err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  const edit = (p) => {
    setForm({
      medical_record_no: p.medical_record_no,
      name: p.name,
      birth_date: p.birth_date?.slice(0, 10) || '',
      gender: p.gender,
      phone: p.phone || '',
      address: p.address || '',
    });
    setEditId(p.id);
    setShowForm(true);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Data Pasien</h1>
        {can('patients.manage') && (
          <button onClick={() => { setShowForm(true); setEditId(null); setForm(empty); }}>+ Pasien Baru</button>
        )}
      </div>

      <input placeholder="Cari nama / no. RM..." value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360, marginBottom: '1rem' }} />

      {showForm && can('patients.manage') && (
        <form className="card" onSubmit={save} style={{ marginBottom: '1.25rem' }}>
          <h2 className="section-title">{editId ? 'Edit Pasien' : 'Pasien Baru'}</h2>
          <div className="form-grid">
            <div className="form-group"><label>No. Rekam Medis *</label><input required value={form.medical_record_no} onChange={(e) => setForm({ ...form, medical_record_no: e.target.value })} /></div>
            <div className="form-group"><label>Nama *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Tgl Lahir</label><input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
            <div className="form-group"><label>Jenis Kelamin</label><select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div>
            <div className="form-group"><label>Telepon</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="form-group" style={{ marginTop: '1rem' }}><label>Alamat</label><textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit">Simpan</button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>Batal</button>
          </div>
        </form>
      )}

      <div className="card">
        <table>
          <thead><tr><th>No. RM</th><th>Nama</th><th>Tgl Lahir</th><th>JK</th><th></th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{p.medical_record_no}</td>
                <td>{p.name}</td>
                <td>{p.birth_date || '—'}</td>
                <td>{p.gender}</td>
                <td className="actions-cell">
                  {can('patients.manage') && <button className="secondary btn-sm" type="button" onClick={() => edit(p)}>Edit</button>}
                  {user?.role?.code === 'admin' && <button className="danger btn-sm" type="button" onClick={() => deletePatient(p)}>Hapus</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

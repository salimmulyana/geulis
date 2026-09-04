import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';

const TYPES = ['patient', 'order', 'result', 'test'];

export default function Mapping() {
  const { can } = useAuth();
  const [mappings, setMappings] = useState([]);
  const [tests, setTests] = useState([]);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ mapping_type: 'test', lis_field: '', simrs_field: '', transform_rule: '', notes: '', is_active: true });

  const load = () => {
    api.mapping.get().then((d) => {
      setMappings(d.mappings.filter(m => m.mapping_type === 'test'));
    });
    api.tests.list().then(setTests);
  };

  useEffect(() => { load(); }, []);

  const submitMapping = async (e) => {
    e.preventDefault();
    if (editId) {
      await api.mapping.update(editId, form);
    } else {
      await api.mapping.create(form);
    }
    setForm({ mapping_type: 'test', lis_field: '', simrs_field: '', transform_rule: '', notes: '', is_active: true });
    setEditId(null);
    load();
  };


  if (!can('mapping.view')) return <p className="error-msg">Akses ditolak</p>;

  return (
    <div>
      <h1 className="page-title">Mapping Data SIMRS</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.25rem' }}>
        Mapping kode pemeriksaan laboratorium antara LIS dan SIMRS.
      </p>

      {can('mapping.manage') && (
        <form className="card" onSubmit={submitMapping} style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>{editId ? 'Edit Mapping' : 'Tambah Mapping'}</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Pemeriksaan LIS</label>
              <select required value={form.lis_field} onChange={(e) => setForm({ ...form, lis_field: e.target.value })}>
                <option value="">-- Pilih Pemeriksaan LIS --</option>
                {tests.filter(t => t.show_in_report).map(t => (
                  <option key={t.id} value={t.code}>{t.code} — {t.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group"><label>Kode SIMRS</label><input required value={form.simrs_field} onChange={(e) => setForm({ ...form, simrs_field: e.target.value })} placeholder="Contoh: 12345" /></div>
            {editId && (
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <label htmlFor="is_active" style={{ margin: 0 }}>Aktif</label>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit">{editId ? 'Simpan Perubahan' : 'Tambah'}</button>
            {editId && (
              <button type="button" className="secondary" onClick={() => {
                setEditId(null);
                setForm({ mapping_type: 'test', lis_field: '', simrs_field: '', transform_rule: '', notes: '', is_active: true });
              }}>Batal</button>
            )}
          </div>
        </form>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Pemeriksaan LIS</th><th>Kode SIMRS</th><th>Aktif</th><th>Aksi</th></tr></thead>
          <tbody>
            {mappings.map((m) => {
              const test = tests.find(t => t.code === m.lis_field);
              return (
                <tr key={m.id}>
                  <td><strong>{m.lis_field}</strong> {test ? `— ${test.name}` : ''}</td>
                  <td><code>{m.simrs_field}</code></td>
                  <td>{m.is_active ? 'Ya' : 'Tidak'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="secondary btn-sm" type="button" onClick={() => {
                        setEditId(m.id);
                        setForm({
                          mapping_type: m.mapping_type,
                          lis_field: m.lis_field,
                          simrs_field: m.simrs_field,
                          transform_rule: m.transform_rule || '',
                          notes: m.notes || '',
                          is_active: m.is_active === 1
                        });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}>Edit</button>
                      <button className="danger btn-sm" type="button" onClick={async () => {
                        const res = await Swal.fire({ title: 'Hapus mapping ini?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya', cancelButtonText: 'Batal' });
                        if (res.isConfirmed) {
                          await api.mapping.remove(m.id);
                          load();
                        }
                      }}>Hapus</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

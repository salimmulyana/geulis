import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';

const MENU_LABELS = {
  dashboard: 'Dashboard',
  requests: 'Permintaan Lab',
  patients: 'Data Pasien',
  results: 'Hasil Lab',
  users: 'User & Hak Akses',
  mapping: 'Mapping SIMRS',
  instruments: 'Alat Lab',
};

export default function Users() {
  const { can, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [rolesData, setRolesData] = useState(null);
  const [tab, setTab] = useState('users');
  const [form, setForm] = useState({ username: '', password: '', full_name: '', email: '', role_id: 2 });
  const [selectedRole, setSelectedRole] = useState(2);
  const [permIds, setPermIds] = useState([]);
  const [pwdModal, setPwdModal] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const load = () => {
    api.users.list().then(setUsers);
    api.users.roles().then((d) => {
      setRolesData(d);
      const rp = d.rolePermissions.filter((x) => x.role_id === selectedRole).map((x) => x.permission_id);
      setPermIds(rp);
    });
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!rolesData) return;
    const rp = rolesData.rolePermissions.filter((x) => x.role_id === selectedRole).map((x) => x.permission_id);
    setPermIds(rp);
  }, [selectedRole, rolesData]);

  const createUser = async (e) => {
    e.preventDefault();
    await api.users.create({ ...form, role_id: Number(form.role_id) });
    setForm({ username: '', password: '', full_name: '', email: '', role_id: 2 });
    load();
  };

  const savePerms = async () => {
    await api.users.setRolePerms(selectedRole, permIds);
    Swal.fire('Berhasil', 'Hak akses disimpan', 'success');
    load();
  };

  const togglePerm = (id) => {
    setPermIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const savePassword = async (e) => {
    e.preventDefault();
    await api.users.setPassword(pwdModal.id, newPassword);
    setPwdModal(null);
    setNewPassword('');
    Swal.fire('Berhasil', 'Password diperbarui', 'success');
  };

  const deleteUser = async (u) => {
    const res = await Swal.fire({ title: `Hapus user "${u.username}"?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya', cancelButtonText: 'Batal' });
    if (!res.isConfirmed) return;
    try {
      await api.users.remove(u.id);
      load();
    } catch (err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  const permsByMenu = rolesData?.permissions.reduce((acc, p) => {
    if (!acc[p.menu_key]) acc[p.menu_key] = [];
    acc[p.menu_key].push(p);
    return acc;
  }, {}) || {};

  if (!can('users.view')) return <p className="error-msg">Akses ditolak</p>;

  return (
    <div>
      <h1 className="page-title">User & Hak Akses</h1>
      <div className="tab-row">
        <button type="button" className={tab === 'users' ? '' : 'secondary'} onClick={() => setTab('users')}>Daftar User</button>
        <button type="button" className={tab === 'roles' ? '' : 'secondary'} onClick={() => setTab('roles')}>Hak Akses Role</button>
      </div>

      {tab === 'users' && (
        <>
          {can('users.manage') && (
            <form className="card" onSubmit={createUser} style={{ marginBottom: '1.25rem' }}>
              <h2 className="section-title">Tambah User</h2>
              <div className="form-grid">
                <div className="form-group"><label>Username</label><input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
                <div className="form-group"><label>Password</label><input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
                <div className="form-group"><label>Nama Lengkap</label><input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="form-group"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="form-group">
                  <label>Role</label>
                  <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
                    {rolesData?.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" style={{ marginTop: '1rem' }}>Tambah</button>
            </form>
          )}
          <div className="card">
            <table>
              <thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Aktif</th><th>Login Terakhir</th><th>Aksi</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.full_name}</td>
                    <td>{u.role_name}</td>
                    <td>{u.is_active ? 'Ya' : 'Tidak'}</td>
                    <td>{u.last_login ? new Date(u.last_login).toLocaleString('id-ID') : '—'}</td>
                    <td className="actions-cell">
                      {can('users.manage') && (
                        <>
                          <button type="button" className="secondary btn-sm" onClick={() => { setPwdModal(u); setNewPassword(''); }}>Password</button>
                          {u.id !== currentUser?.id && (
                            <button type="button" className="danger btn-sm" onClick={() => deleteUser(u)}>Hapus</button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'roles' && rolesData && can('users.manage') && (
        <div className="card">
          <div className="form-group role-select">
            <label>Role</label>
            <select value={selectedRole} onChange={(e) => setSelectedRole(Number(e.target.value))}>
              {rolesData.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="perm-table-wrap">
            <table className="perm-table">
              <thead>
                <tr><th>Menu</th><th>Hak Akses</th><th className="col-check">✓</th></tr>
              </thead>
              <tbody>
                {Object.entries(permsByMenu).map(([menuKey, perms]) =>
                  perms.map((p, idx) => (
                    <tr key={p.id}>
                      <td>{idx === 0 ? MENU_LABELS[menuKey] || menuKey : ''}</td>
                      <td className="perm-name">{p.name}</td>
                      <td className="col-check">
                        <input type="checkbox" checked={permIds.includes(p.id)} onChange={() => togglePerm(p.id)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <button type="button" style={{ marginTop: '1rem' }} onClick={savePerms}>Simpan Hak Akses</button>
        </div>
      )}

      {pwdModal && (
        <div className="modal-overlay" onClick={() => setPwdModal(null)}>
          <form className="modal card" onClick={(e) => e.stopPropagation()} onSubmit={savePassword}>
            <h2 className="section-title">Ubah Password — {pwdModal.username}</h2>
            <div className="form-group">
              <label>Password Baru</label>
              <input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
            </div>
            <div className="modal-actions">
              <button type="submit">Simpan</button>
              <button type="button" className="secondary" onClick={() => setPwdModal(null)}>Batal</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

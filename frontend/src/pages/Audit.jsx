import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const ACTION_COLORS = {
  CREATE: '#059669', UPDATE: '#4f46e5', DELETE: '#dc2626',
  VERIFY: '#0891b2', ACK: '#f59e0b', PUSH: '#7c3aed', LOGIN: '#64748b', RELOAD: '#64748b',
};

export default function Audit() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [err, setErr] = useState('');

  const load = () => api.audit.list({ q, entity }).then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [q, entity]);

  if (user?.role?.code !== 'admin') return <p className="error-msg">Akses ditolak. Hanya Administrator.</p>;

  return (
    <div>
      <h1 className="page-title">Log Audit</h1>
      <p className="page-desc" style={{ color: 'var(--muted)', marginBottom: '1rem' }}>
        Jejak seluruh perubahan data (siapa, kapan, apa). Diurutkan dari terbaru, maksimal 300 entri.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input placeholder="Cari user / detail / ID..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 300 }} />
        <select value={entity} onChange={(e) => setEntity(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Semua entitas</option>
          <option value="result">Hasil</option>
          <option value="request">Permintaan</option>
          <option value="patient">Pasien</option>
          <option value="user">User</option>
          <option value="test">Pemeriksaan</option>
          <option value="instrument">Alat</option>
          <option value="role_perms">Hak Akses</option>
        </select>
        <button type="button" className="secondary" onClick={load}>🔄 Refresh</button>
      </div>

      {err && <p className="error-msg">{err}</p>}

      <div className="card">
        <table>
          <thead>
            <tr><th>Waktu</th><th>User</th><th>Aksi</th><th>Entitas</th><th>ID</th><th>Detail</th><th>IP</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '1rem' }}>Belum ada log.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString('id-ID')}</td>
                <td>{r.username}</td>
                <td><span className="badge" style={{ background: ACTION_COLORS[r.action] || '#64748b', color: '#fff' }}>{r.action}</span></td>
                <td>{r.entity}</td>
                <td>{r.entity_id || '—'}</td>
                <td style={{ maxWidth: 280, fontSize: '0.8rem', color: 'var(--muted)', wordBreak: 'break-word' }}>{r.detail || ''}</td>
                <td style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{r.ip || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

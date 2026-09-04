import { useEffect, useState } from 'react';
import { api } from '../api';
import Swal from 'sweetalert2';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [critical, setCritical] = useState([]);

  const loadCritical = () => api.results.criticalUnacked().then(setCritical).catch(() => {});

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setErr(e.message));
    loadCritical();
    const t = setInterval(loadCritical, 20000);
    return () => clearInterval(t);
  }, []);

  // Pelaporan nilai kritis.
  //
  // Sebelumnya tombol ini hanya menandai "sudah dilihat". Yang dituntut
  // akreditasi — dan yang benar-benar berguna kalau kemudian dipertanyakan —
  // adalah catatan siapa yang dihubungi, lewat apa, dan apakah angkanya
  // dibacakan ulang oleh penerima.
  const ack = async (r) => {
    const res = await Swal.fire({
      title: 'Lapor Hasil Kritis',
      html:
        `<p style="margin:0 0 .75rem"><b>${r.patient_name}</b> — ${r.test_name}: ` +
        `<b style="color:#dc2626">${r.result_value} ${r.unit || ''}</b></p>` +
        `<input id="lapor-ke" class="swal2-input" placeholder="Dilaporkan kepada (nama dokter/perawat)">` +
        `<select id="lapor-via" class="swal2-input">` +
        `<option value="telepon">Telepon</option><option value="wa">WhatsApp</option>` +
        `<option value="lisan">Lisan/langsung</option></select>` +
        `<label style="display:flex;gap:.5rem;align-items:center;justify-content:center;margin:.5rem 0">` +
        `<input type="checkbox" id="lapor-readback"> Penerima membacakan ulang hasilnya</label>` +
        `<input id="lapor-catatan" class="swal2-input" placeholder="Catatan (opsional)">`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Simpan laporan',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#dc2626',
      focusConfirm: false,
      preConfirm: () => {
        const kepada = document.getElementById('lapor-ke').value.trim();
        if (!kepada) {
          Swal.showValidationMessage('Nama dokter/perawat yang dihubungi wajib diisi');
          return false;
        }
        return {
          reported_to: kepada,
          reported_via: document.getElementById('lapor-via').value,
          readback: document.getElementById('lapor-readback').checked,
          note: document.getElementById('lapor-catatan').value.trim() || null,
        };
      },
    });
    if (!res.isConfirmed) return;
    try {
      await api.results.ackCritical(r.id, res.value);
      loadCritical();
    } catch (e) {
      Swal.fire('Gagal', e.message, 'error');
    }
  };

  if (err) return <p className="error-msg">{err}</p>;
  if (!data) return <p>Memuat dashboard...</p>;

  const { stats, instruments, alatDiam = [], recentRequests, criticalResults } = data;

  const lamanya = (menit) => {
    if (menit == null) return 'belum pernah tersambung';
    if (menit < 120) return `${menit} menit`;
    if (menit < 2880) return `${Math.floor(menit / 60)} jam`;
    return `${Math.floor(menit / 1440)} hari`;
  };

  return (
    <div>
      <h1 className="page-title">Dashboard Pemantauan</h1>

      {alatDiam.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #d99000', background: 'rgba(217,144,0,0.08)', marginBottom: '1.25rem' }}>
          <h2 style={{ color: '#a8730b', marginTop: 0 }}>⚠ {alatDiam.length} alat tidak mengirim apa pun</h2>
          <p style={{ marginTop: 0 }}>
            Biasanya kabel LAN lepas, alat dimatikan, atau <b>Auto Communicate</b> mati
            di panel alat. Tanpa peringatan ini gejalanya hanya "hasil tidak muncul".
          </p>
          <ul>
            {alatDiam.map((a) => (
              <li key={a.id}>
                <b>{a.code}</b> — {a.name}: diam {lamanya(a.diam_menit)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.hasilBelumCocok > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #4b7bec', background: 'rgba(75,123,236,0.08)', marginBottom: '1.25rem' }}>
          📥 <b>{stats.hasilBelumCocok}</b> hasil menunggu dicocokkan ke pasien.{' '}
          <a href="/unmatched">Buka daftarnya</a>
        </div>
      )}

      {stats.qcKeluarBatas > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #dc2626', background: 'rgba(220,38,38,0.08)', marginBottom: '1.25rem' }}>
          🎯 <b>{stats.qcKeluarBatas}</b> titik kontrol mutu ditolak hari ini — hasil pasien
          dari alat itu sebaiknya ditahan dulu. <a href="/qc">Lihat kontrol mutu</a>
        </div>
      )}

      {critical.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #dc2626', background: 'rgba(220,38,38,0.08)', marginBottom: '1.25rem' }}>
          <h2 style={{ color: '#dc2626', marginTop: 0 }}>🚨 {critical.length} Hasil Kritis Perlu Tindak Lanjut</h2>
          <table>
            <thead><tr><th>Pasien</th><th>RM</th><th>Pemeriksaan</th><th>Nilai</th><th>Waktu</th><th></th></tr></thead>
            <tbody>
              {critical.map((r) => (
                <tr key={r.id}>
                  <td>{r.patient_name}</td>
                  <td>{r.medical_record_no}</td>
                  <td>{r.test_name}</td>
                  <td style={{ fontWeight: 700, color: '#dc2626' }}>{r.result_value} {r.unit || ''}</td>
                  <td>{new Date(r.result_at).toLocaleString('id-ID')}</td>
                  <td><button type="button" className="btn-sm" onClick={() => ack(r)}>✓ Tindak lanjut</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="stats-grid">
        <div className="stat card">
          <span className="stat-label">Permintaan Pending</span>
          <span className="stat-value">{stats.pendingRequests}</span>
        </div>
        <div className="stat card">
          <span className="stat-label">Permintaan Hari Ini</span>
          <span className="stat-value">{stats.todayRequests}</span>
        </div>
        <div className="stat card">
          <span className="stat-label">Hasil Hari Ini</span>
          <span className="stat-value">{stats.todayResults}</span>
        </div>
        <div className="stat card">
          <span className="stat-label">Total Pasien</span>
          <span className="stat-value">{stats.totalPatients}</span>
        </div>
      </div>

      <div className="dash-grid">
        <section className="card">
          <h2>Status Alat Lab</h2>
          <table>
            <thead>
              <tr><th>Kode</th><th>Nama</th><th>Port</th><th>Terakhir Terhubung</th></tr>
            </thead>
            <tbody>
              {instruments.map((i) => (
                <tr key={i.id}>
                  <td>{i.code}</td>
                  <td>{i.name}</td>
                  <td>{i.port}</td>
                  <td>{i.last_connected ? new Date(i.last_connected).toLocaleString('id-ID') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Hasil Kritis / Abnormal</h2>
          {criticalResults.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>Tidak ada hasil kritis terbaru.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Pasien</th><th>Pemeriksaan</th><th>Nilai</th><th>Flag</th></tr>
              </thead>
              <tbody>
                {criticalResults.map((r) => (
                  <tr key={r.id}>
                    <td>{r.patient_name}</td>
                    <td>{r.test_name}</td>
                    <td>{r.result_value}</td>
                    <td><span className={`badge ${r.flag}`}>{r.flag}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: '1.25rem' }}>
        <h2>Permintaan Terbaru</h2>
        <table>
          <thead>
            <tr><th>No. Permintaan</th><th>Pasien</th><th>RM</th><th>Prioritas</th><th>Status</th><th>Waktu</th></tr>
          </thead>
          <tbody>
            {recentRequests.map((r) => (
              <tr key={r.id}>
                <td>{r.request_no}</td>
                <td>{r.patient_name}</td>
                <td>{r.medical_record_no}</td>
                <td><span className={`badge ${r.priority === 'cito' ? 'cito' : ''}`}>{r.priority}</span></td>
                <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                <td>{new Date(r.requested_at).toLocaleString('id-ID')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <style>{`
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
        .stat-label { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 0.35rem; }
        .stat-value { font-size: 2rem; font-weight: 700; color: var(--primary); }
        .dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
        @media (max-width: 900px) { .dash-grid { grid-template-columns: 1fr; } }
        section h2 { font-size: 1rem; margin-bottom: 1rem; }
      `}</style>
    </div>
  );
}

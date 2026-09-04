import { useParams, Navigate } from 'react-router-dom';

// Dokumen dibatasi daftar putih ini supaya alamat /manual/... tidak bisa
// dipakai memuat berkas lain dari server.
const DOKUMEN = {
  'alur-kerja': { file: '/ALUR_KERJA.html', judul: 'Alur Kerja Petugas', icon: '🧭' },
  penggunaan: { file: '/KOMUNIKASI_ALAT.html', judul: 'Manual Penggunaan', icon: '📖' },
  'bc-3600': { file: '/BC-3600.html', judul: 'Manual Alat BC-3600', icon: '🩸' },
  'bc-11': { file: '/BC-11.html', judul: 'Manual Alat BC-11', icon: '🔬' },
  'afinion-2': { file: '/AFINION-2.html', judul: 'Manual Alat Afinion 2', icon: '🩺' },
};

export default function Manual() {
  const { doc } = useParams();
  const dokumen = DOKUMEN[doc];
  if (!dokumen) return <Navigate to="/" replace />;

  return (
    <div className="manual-page">
      <div className="manual-head">
        <h2>
          <span>{dokumen.icon}</span> {dokumen.judul}
        </h2>
        <a className="secondary btn-sm" href={dokumen.file} target="_blank" rel="noreferrer">
          ↗ Buka di tab baru
        </a>
      </div>
      <iframe
        key={dokumen.file}
        src={dokumen.file}
        title={dokumen.judul}
        className="manual-frame"
      />
      <style>{`
        .manual-page { display: flex; flex-direction: column; height: calc(100vh - 3rem); }
        .manual-head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 1rem; margin-bottom: 0.75rem;
        }
        .manual-head h2 { margin: 0; display: flex; align-items: center; gap: 0.5rem; }
        .manual-frame {
          flex: 1; width: 100%; border: 1px solid var(--border, #d5d9e0);
          border-radius: 8px; background: #fff;
        }
      `}</style>
    </div>
  );
}

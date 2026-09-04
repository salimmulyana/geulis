import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';

// Versi dan tautan kode sumber yang ditampilkan di sidebar.
//
// BILA ANDA MEM-FORK GEULIS: ganti SOURCE_URL ke repositori Anda sendiri.
// AGPL-3.0 Pasal 13 mewajibkan pengguna versi Anda bisa memperoleh kode versi
// Anda -- bukan kode proyek asal. Membiarkannya menunjuk ke sini berarti
// menawarkan kode yang bukan kode yang sedang mereka pakai.
const APP_VERSION = __APP_VERSION__;
const SOURCE_URL = 'https://github.com/doktertekno/geulis';

const MENU = [
  { key: 'dashboard', path: '/', label: 'Dashboard', icon: '📊' },
  { key: 'patients', path: '/patients', label: 'Data Pasien', icon: '👤' },
  { key: 'requests', path: '/requests', label: 'Permintaan Lab', icon: '🧪' },
  { key: 'results', path: '/results', label: 'Hasil Lab', icon: '📋' },
  { key: 'users', path: '/users', label: 'User & Hak Akses', icon: '🔐' },
  { key: 'instruments', path: '/instruments', label: 'Alat Laboratorium', icon: '⚙️' },
  { key: 'results', path: '/unmatched', label: 'Hasil Belum Cocok', icon: '📥' },
  { key: 'instruments', path: '/qc', label: 'Kontrol Mutu', icon: '🎯' },
  { key: 'instruments', path: '/pme', label: 'Mutu Eksternal', icon: '🏅' },
];

// Manual dibuka di dalam aplikasi (halaman /manual/...), bukan tab baru,
// supaya sidebar tetap terlihat dan petugas tidak kehilangan konteks.
const MANUAL = [
  { path: '/manual/alur-kerja', label: 'Alur Kerja Petugas', icon: '🧭' },
  { path: '/manual/penggunaan', label: 'Manual Penggunaan', icon: '📖' },
  { path: '/manual/bc-3600', label: 'Manual Alat BC-3600', icon: '🩸' },
  { path: '/manual/bc-11', label: 'Manual Alat BC-11', icon: '🔬' },
];

export default function Layout() {
  const { user, logout, hasMenu } = useAuth();
  const navigate = useNavigate();
  const items = MENU.filter((m) => hasMenu(m.key));
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (window.innerWidth < 768) return false;
    const saved = localStorage.getItem('sidebar_open');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = (val) => {
    setSidebarOpen(val);
    localStorage.setItem('sidebar_open', val);
  };

  const handleLogout = async () => {
    const res = await Swal.fire({
      title: 'Keluar Aplikasi?',
      text: "Anda harus login kembali untuk mengakses sistem.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#ef4444',
      confirmButtonText: 'Ya, Keluar',
      cancelButtonText: 'Batal'
    });
    
    if (res.isConfirmed) {
      logout();
      navigate('/login');
    }
  };

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <aside className="sidebar">
          <div className="brand" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span className="brand-icon">🧬</span>
              <div>
                <strong>GeuLIS</strong>
                <small>Laboratory IS</small>
              </div>
            </div>
            <button 
              className="btn-sm" 
              style={{ background: 'transparent', color: 'var(--muted)', padding: '0.25rem', border: 'none' }}
              onClick={() => toggleSidebar(false)}
              title="Sembunyikan Sidebar"
            >
              ◀
            </button>
          </div>
        <div className="user-chip">
          <strong>{user?.fullName}</strong>
          <small>{user?.role?.name}</small>
        </div>
        <nav>
          {items.map((m) => (
            <NavLink key={m.path} to={m.path} end={m.path === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span>{m.icon}</span> {m.label}
            </NavLink>
          ))}
          {user?.role?.code === 'admin' && (
            <NavLink to="/audit" className={({ isActive }) => (isActive ? 'active' : '')}>
              <span>📜</span> Log Audit
            </NavLink>
          )}
          {user?.role?.code === 'admin' && (
            <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
              <span>⚙️</span> Pengaturan Aplikasi
            </NavLink>
          )}
          {MANUAL.map((m) => (
            <NavLink key={m.path} to={m.path} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span>{m.icon}</span> {m.label}
            </NavLink>
          ))}
          <button
            type="button" 
            className="secondary" 
            onClick={handleLogout}
            style={{ marginTop: '0.5rem', justifyContent: 'flex-start' }}
          >
            🚪 Keluar
          </button>

          {/*
            Keterangan lisensi dan tautan kode sumber.

            Ini bukan hiasan, melainkan pemenuhan GNU AGPL-3.0 Pasal 13: siapa
            pun yang memodifikasi GeuLIS lalu menyajikannya lewat jaringan wajib
            menawarkan kode sumber versinya kepada pengguna. Cara paling lazim
            memenuhinya adalah mengganti tautan di bawah ini ke sumber mereka
            sendiri.

            Efek sampingnya disengaja: fork jadi terlihat. Siapa pun yang
            membuka GeuLIS di rumah sakit mana pun bisa menelusuri kode versi
            yang sedang berjalan di depannya.
          */}
          <div className="sidebar-lisensi">
            <div>GeuLIS v{APP_VERSION}</div>
            <div>
              <a href={SOURCE_URL} target="_blank" rel="noreferrer">Kode sumber</a>
              {' · '}
              <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">
                AGPL-3.0
              </a>
            </div>
            <div className="sidebar-lisensi-penafian">
              Bukan alat kesehatan. Hasil wajib diverifikasi tenaga berwenang.
            </div>
          </div>
        </nav>
      </aside>
      )}
      
      <main className="main-content">
        {!sidebarOpen && (
          <button 
            className="secondary btn-sm" 
            style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} 
            onClick={() => toggleSidebar(true)}
          >
            ☰ Tampilkan Menu
          </button>
        )}
        <Outlet />
      </main>
      <style>{`
        .app-shell { display: flex; min-height: 100vh; }
        .sidebar {
          width: 260px; background: var(--surface); border-right: 1px solid var(--border);
          display: flex; flex-direction: column; padding: 1.25rem; flex-shrink: 0;
        }
        .brand { display: flex; align-items: center; margin-bottom: 2rem; }
        .brand-icon { font-size: 2rem; }
        .brand strong { display: block; font-size: 1.1rem; }
        .brand small { color: var(--muted); font-size: 0.75rem; }
        nav { flex: 1; display: flex; flex-direction: column; gap: 0.25rem; }
        nav a {
          display: flex; align-items: center; gap: 0.6rem; padding: 0.65rem 0.85rem;
          border-radius: 8px; color: var(--muted); transition: 0.15s;
        }
        nav a:hover { background: var(--surface2); color: var(--text); }
        nav a.active { background: var(--primary); color: #fff; }
        
        .user-chip { margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem; }
        .user-chip small { color: var(--muted); display: block; }
        
        .main-content { flex: 1; padding: 1.5rem 2rem; overflow: auto; }
      `}</style>
    </div>
  );
}

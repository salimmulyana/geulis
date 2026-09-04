import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('profil');
  const [apiKeys, setApiKeys] = useState([]);
  const [form, setForm] = useState({
    clinic_name: '',
    clinic_address: '',
    clinic_phone: '',
    clinic_email: '',
    clinic_logo: ''
  });

  const load = async () => {
    try {
      const data = await api.settings.get();
      setForm((prev) => ({ ...prev, ...data }));
    } catch (e) {
      console.error(e);
    }
  };

  const loadKeys = async () => {
    try {
      const keys = await api.apiKeys.list();
      setApiKeys(keys);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
    loadKeys();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.settings.update(form);
      Swal.fire('Berhasil!', 'Pengaturan klinik telah disimpan.', 'success');
      load();
    } catch (err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      return Swal.fire('Gagal', 'Ukuran gambar maksimal 2MB', 'error');
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setForm({ ...form, clinic_logo: event.target.result });
    };
    reader.readAsDataURL(file);
  };

  const generateApiKey = async () => {
    const { value: name } = await Swal.fire({
      title: 'Nama API Key',
      input: 'text',
      inputLabel: 'Contoh: SIMRS Khanza, Aplikasi Antrean',
      inputPlaceholder: 'Masukkan nama aplikasi...',
      showCancelButton: true,
      inputValidator: (value) => {
        if (!value) return 'Nama aplikasi wajib diisi!'
      }
    });

    if (name) {
      try {
        const res = await api.apiKeys.create({ name });
        await Swal.fire({
          title: 'API Key Dibuat!',
          html: `
            <p>Simpan baik-baik API Key ini, karena hanya ditampilkan sekali:</p>
            <div style="display:flex; align-items:center; justify-content:center; gap:0.5rem; margin-top:1rem;">
              <code id="new-api-key" style="background:#eee; padding:0.5rem 1rem; border-radius:4px; word-break:break-all; font-size:1.1rem;">${res.api_key}</code>
              <button 
                onclick="navigator.clipboard.writeText('${res.api_key}'); Swal.showValidationMessage('API Key disalin!'); setTimeout(() => Swal.resetValidationMessage(), 2000);" 
                style="padding:0.5rem 1rem; background:var(--primary); color:white; border:none; border-radius:4px; cursor:pointer;"
              >
                📋 Salin
              </button>
            </div>
          `,
          icon: 'success'
        });
        loadKeys();
      } catch (err) {
        Swal.fire('Gagal', err.message, 'error');
      }
    }
  };

  const revokeApiKey = async (id, name) => {
    const res = await Swal.fire({
      title: 'Cabut Akses?',
      text: `API Key untuk "${name}" akan dihapus permanen.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus',
      confirmButtonColor: '#ef4444'
    });
    if (res.isConfirmed) {
      try {
        await api.apiKeys.remove(id);
        Swal.fire('Dihapus', 'API Key berhasil dihapus.', 'success');
        loadKeys();
      } catch (err) {
        Swal.fire('Gagal', err.message, 'error');
      }
    }
  };

  if (user?.role?.code !== 'admin') return <p className="error-msg">Akses ditolak. Hanya Admin yang dapat mengakses Pengaturan Klinik.</p>;

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Pengaturan Sistem</h1>
        <p className="page-desc">Konfigurasi profil instansi dan integrasi sistem eksternal.</p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
        <button 
          className="btn-sm" 
          style={{ background: activeTab === 'profil' ? 'var(--primary)' : 'transparent', color: activeTab === 'profil' ? '#fff' : 'var(--text)', border: 'none', borderRadius: '4px 4px 0 0' }}
          onClick={() => setActiveTab('profil')}
        >
          Profil Klinik
        </button>
        <button 
          className="btn-sm" 
          style={{ background: activeTab === 'api' ? 'var(--primary)' : 'transparent', color: activeTab === 'api' ? '#fff' : 'var(--text)', border: 'none', borderRadius: '4px 4px 0 0' }}
          onClick={() => setActiveTab('api')}
        >
          Integrasi API
        </button>
      </div>

      {activeTab === 'profil' && (
        <form className="card" onSubmit={save} style={{ maxWidth: 600 }}>
          <div className="form-group">
            <label>Nama Klinik / Rumah Sakit</label>
            <input required value={form.clinic_name} onChange={(e) => setForm({ ...form, clinic_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Alamat Lengkap</label>
            <textarea required rows={3} value={form.clinic_address} onChange={(e) => setForm({ ...form, clinic_address: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Nomor Telepon / HP</label>
            <input value={form.clinic_phone} onChange={(e) => setForm({ ...form, clinic_phone: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.clinic_email} onChange={(e) => setForm({ ...form, clinic_email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Logo Klinik / Rumah Sakit</label>
            {form.clinic_logo && (
              <div style={{ marginBottom: '1rem' }}>
                <img src={form.clinic_logo} alt="Logo" style={{ maxHeight: '100px', objectFit: 'contain' }} />
              </div>
            )}
            <input type="file" accept="image/*" onChange={handleLogoUpload} />
            <small style={{ color: 'var(--muted)', display: 'block', marginTop: '0.25rem' }}>Format: PNG, JPG, JPEG (Maks. 2MB)</small>
          </div>
          <div style={{ marginTop: '1.5rem' }}>
            <button type="submit">Simpan Pengaturan</button>
          </div>
        </form>
      )}

      {activeTab === 'api' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>API Keys</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <a 
                href="/API_BRIDGING.html" 
                target="_blank" 
                rel="noreferrer"
                className="secondary" 
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', padding: '0.5rem 1rem', borderRadius: '4px', fontSize: '0.9rem', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                📄 Lihat Dokumentasi API
              </a>
              <button onClick={generateApiKey}>+ Generate Key Baru</button>
            </div>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            API Key digunakan oleh aplikasi pihak ketiga (seperti SIMRS) untuk mengirim permintaan lab atau menarik hasil secara otomatis melalui bridging.
          </p>
          
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Nama Aplikasi</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>API Key (Tersembunyi)</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Tgl Dibuat</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Oleh</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>Belum ada API Key yang dibuat.</td></tr>
              ) : (
                apiKeys.map(k => (
                  <tr key={k.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 0.5rem' }}><strong>{k.name}</strong></td>
                    <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>khanza_••••••••••••••••</span>
                      <button 
                        className="btn-sm secondary" 
                        title="Salin API Key"
                        onClick={() => {
                          navigator.clipboard.writeText(k.api_key);
                          Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'API Key disalin!', showConfirmButton: false, timer: 1500 });
                        }}
                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                      >
                        📋
                      </button>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{new Date(k.created_at).toLocaleString('id-ID')}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{k.creator_name || '—'}</td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      <button className="secondary btn-sm" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={() => revokeApiKey(k.id, k.name)}>Cabut Akses</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

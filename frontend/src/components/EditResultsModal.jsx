import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';

export default function EditResultsModal({ patient, onClose }) {
  const { user } = useAuth();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!patient) return;
    setLoading(true);
    api.results.list(patient.id)
      .then(res => setResults(res.filter(r => r.show_in_report !== 0)))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [patient]);

  const toggleVisibility = async (r) => {
    try {
      await api.results.setVisibility(r.id, !r.is_printable);
      load();
    } catch (e) {
      Swal.fire('Gagal', e.message, 'error');
    }
  };

  if (!patient) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: '1000px', maxWidth: '95%' }}>
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>Sembunyikan / Tampilkan Hasil</h2>
          <button className="danger" onClick={onClose}>Tutup</button>
        </div>
        
        <p>Edit parameter mana yang boleh dan tidak boleh tampil di lembar laporan untuk <strong>{patient.name}</strong>.</p>
        
        {loading ? <p>Memuat...</p> : (
          <table style={{ width: '100%', marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>Pemeriksaan</th>
                <th>Hasil</th>
                <th>Tampil di Cetakan</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.id || i}>
                  <td>{r.test_name || r.test_code}</td>
                  <td>{r.result_value}</td>
                  <td>
                    <span className={`badge ${r.is_printable ? 'completed' : 'pending'}`}>
                      {r.is_printable ? 'Ya' : 'Disembunyikan'}
                    </span>
                  </td>
                  <td>
                    <button 
                      className="secondary btn-sm" 
                      onClick={() => toggleVisibility(r)}
                      style={{ background: r.is_printable ? '#ef4444' : '#10b981', color: '#fff', borderColor: 'transparent' }}
                    >
                      {r.is_printable ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                  </td>
                </tr>
              ))}
              {results.length === 0 && <tr><td colSpan="4">Belum ada hasil lab.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      
      <style>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: flex-start;
          z-index: 1000; overflow-y: auto; padding: 2rem 0;
        }
        .modal-content {
          background: white; border-radius: 8px; padding: 2rem;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2); color: #333;
        }
        .modal-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 1rem; border-bottom: 1px solid #ddd; padding-bottom: 1rem;
        }
      `}</style>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api';
import Swal from 'sweetalert2';

export default function InputResultsModal({ requestData, onClose, onSave }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({});

  useEffect(() => {
    if (!requestData) return;
    setLoading(true);
    // Fetch request details to get the tests
    api.requests.get(requestData.id)
      .then(res => {
        setItems(res.items || []);
        // Initialize form
        const initialForm = {};
        (res.items || []).forEach(item => {
          initialForm[item.test_id] = {
            value: item.result_value || '',
            printable: item.is_printable ?? 1
          };
        });
        setForm(initialForm);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [requestData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const resultsToSave = Object.keys(form).map(testId => ({
        patient_id: requestData.patient_id,
        request_item_id: items.find(i => i.test_id == testId)?.id,
        test_id: Number(testId),
        result_value: form[testId].value,
        is_printable: form[testId].printable
      })).filter(r => r.result_value !== '' || r.is_printable === 0); // Only save those with values or modified print status

      if (resultsToSave.length === 0) {
        return Swal.fire('Peringatan', 'Tidak ada hasil yang diisi', 'warning');
      }

      await api.results.createBatch(resultsToSave);
      Swal.fire('Berhasil', 'Hasil berhasil disimpan', 'success');
      onSave();
    } catch (err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  if (!requestData) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: '800px', maxWidth: '95%' }}>
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>Isi Hasil - {requestData.request_no}</h2>
          <button type="button" className="danger" onClick={onClose}>Tutup</button>
        </div>
        
        <p>Pasien: <strong>{requestData.patient_name}</strong> ({requestData.medical_record_no})</p>
        
        {loading ? <p>Memuat parameter...</p> : (
          <form onSubmit={handleSubmit}>
            <table style={{ width: '100%', marginTop: '1rem' }}>
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Pemeriksaan</th>
                  <th>Nilai Hasil</th>
                  <th style={{ textAlign: 'center' }}>Tampil Cetakan</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.test_id}>
                    <td><code>{item.test_code}</code></td>
                    <td>{item.test_name}</td>
                    <td>
                      <input 
                        type="text" 
                        value={form[item.test_id]?.value || ''} 
                        onChange={(e) => setForm({
                          ...form, 
                          [item.test_id]: { ...form[item.test_id], value: e.target.value }
                        })}
                        placeholder="Ketik hasil..."
                        style={{ width: '100%' }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={form[item.test_id]?.printable === 1}
                        onChange={(e) => setForm({
                          ...form, 
                          [item.test_id]: { ...form[item.test_id], printable: e.target.checked ? 1 : 0 }
                        })}
                        style={{ width: '1.2rem', height: '1.2rem' }}
                      />
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan="4">Tidak ada parameter.</td></tr>}
              </tbody>
            </table>
            
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="submit" className="primary">Simpan Hasil</button>
            </div>
          </form>
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

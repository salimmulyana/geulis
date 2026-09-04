import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * Interval acuan biologis untuk laporan hasil.
 *
 * Wajib tercetak: PMK 43/2013 Bab IX, komponen laporan nomor 9.
 *
 * Rujukan spesifik gender (reference_min_l/_p) didahulukan karena itulah yang
 * terisi setelah katalog tes diisi; kolom lama reference_min/max jadi cadangan.
 * Sebelumnya laporan hanya membaca kolom lama, sehingga di rumah sakit yang
 * rujukannya diisi per gender kolom NILAI RUJUKAN tercetak "-" untuk semua
 * parameter walaupun datanya ada.
 */
function rentangRujukan(r, gender) {
  let min = r.reference_min;
  let max = r.reference_max;
  if (gender === 'L' && (r.reference_min_l != null || r.reference_max_l != null)) {
    min = r.reference_min_l;
    max = r.reference_max_l;
  } else if (gender === 'P' && (r.reference_min_p != null || r.reference_max_p != null)) {
    min = r.reference_min_p;
    max = r.reference_max_p;
  } else if (min == null && max == null) {
    // Gender pasien tidak diketahui: pakai rujukan mana pun yang tersedia
    // supaya kolomnya tidak kosong sama sekali.
    min = r.reference_min_l ?? r.reference_min_p;
    max = r.reference_max_l ?? r.reference_max_p;
  }
  if (min == null && max == null) return '-';
  const angka = (v) => (v == null ? '' : String(Number(v)));
  return `${angka(min)} - ${angka(max)}`;
}

/** Waktu dalam format lokal; kosong bila datanya belum ada. */
function waktu(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('id-ID');
}

export default function ReportModal({ patient, requestId, onClose }) {
  const [results, setResults] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  // Data permintaan menempel pada tiap baris hasil (satu permintaan per
  // laporan), jadi cukup diambil dari baris pertama yang memilikinya.
  const info = results.find((r) => r.clinician_name || r.specimen_type || r.received_at) || {};
  const pemverifikasi = results.find((r) => r.verified_by_name)?.verified_by_name || '';
  const terbit = results.find((r) => r.verified_at)?.verified_at || null;
  const adaPerbaikan = results.some((r) => r.revision_count > 0);

  useEffect(() => {
    api.settings.get().then(setSettings).catch(console.error);
    
    if (patient) {
      setLoading(true);
      api.results.list(patient.id)
        .then((res) => {
           const visibleResults = res.filter(r => r.show_in_report !== 0 && r.is_printable !== 0);
           const sortedResults = [...visibleResults].sort((a, b) => {
             const orderA = a.sort_order ?? 999;
             const orderB = b.sort_order ?? 999;
             if (orderA !== orderB) return orderA - orderB;
             return (a.test_code || '').localeCompare(b.test_code || '');
           });
           setResults(sortedResults);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [patient, requestId]);

  const handlePrint = () => {
    window.print();
  };

  if (!patient) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content print-area">
        <div className="modal-header no-print">
          <h2 style={{margin: 0}}>Lembar Hasil Laboratorium</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="primary" onClick={handlePrint}>🖨️ Cetak</button>
            <button className="danger" onClick={onClose}>Tutup</button>
          </div>
        </div>

        <div className="report-header">
          <div className="hospital-brand">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', borderBottom: '2px solid #000', paddingBottom: '1rem' }}>
              {settings.clinic_logo && (
                <img src={settings.clinic_logo} alt="Logo" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
              )}
              <div style={{ flex: 1, textAlign: settings.clinic_logo ? 'left' : 'center' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', textTransform: 'uppercase' }}>{settings.clinic_name || 'LABORATORIUM KLINIK'}</h2>
                <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>{settings.clinic_address || '-'}</p>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Telp: {settings.clinic_phone || '-'} | Email: {settings.clinic_email || '-'}</p>
              </div>
            </div>
          </div>
          
          <table className="patient-info-table">
            <tbody>
              <tr>
                <td width="120"><strong>No. RM</strong></td>
                <td width="10">:</td>
                <td>{patient.medical_record_no}</td>
                <td width="120"><strong>Tgl Cetak</strong></td>
                <td width="10">:</td>
                <td>{new Date().toLocaleString('id-ID')}</td>
              </tr>
              <tr>
                <td><strong>Nama Pasien</strong></td>
                <td>:</td>
                <td>{patient.name}</td>
                <td><strong>No. Order</strong></td>
                <td>:</td>
                <td>{patient.order_no || '-'}</td>
              </tr>
              <tr>
                <td><strong>Tgl Lahir</strong></td>
                <td>:</td>
                <td>{patient.birth_date ? new Date(patient.birth_date).toLocaleDateString('id-ID') : '-'}</td>
                <td><strong>J. Kelamin</strong></td>
                <td>:</td>
                <td>{patient.gender === 'L' ? 'Laki-laki' : patient.gender === 'P' ? 'Perempuan' : '-'}</td>
              </tr>
              {/* Komponen wajib laporan hasil menurut PMK 43/2013 Bab IX:
                  nomor 4 (pemohon), 5 (waktu sampling & penerimaan),
                  7 (jenis spesimen), 11 (tanggapan mutu spesimen). */}
              <tr>
                <td><strong>Dokter Pemohon</strong></td>
                <td>:</td>
                <td>{info.clinician_name || '-'}</td>
                <td><strong>Ruangan/Poli</strong></td>
                <td>:</td>
                <td>{info.clinician_unit || '-'}</td>
              </tr>
              <tr>
                <td><strong>Jenis Spesimen</strong></td>
                <td>:</td>
                <td>{info.specimen_type || '-'}</td>
                <td><strong>Diambil</strong></td>
                <td>:</td>
                <td>{waktu(info.collected_at)}</td>
              </tr>
              <tr>
                <td><strong>Diterima Lab</strong></td>
                <td>:</td>
                <td>{waktu(info.received_at)}</td>
                <td><strong>Tgl Terbit</strong></td>
                <td>:</td>
                <td>{waktu(terbit) || new Date().toLocaleString('id-ID')}</td>
              </tr>
              {info.specimen_note && (
                <tr>
                  <td><strong>Catatan Spesimen</strong></td>
                  <td>:</td>
                  <td colSpan="4">{info.specimen_note}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="report-body">
          {loading ? (
            <p>Memuat hasil...</p>
          ) : results.length === 0 ? (
            <p>Belum ada hasil lab untuk pasien ini.</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th style={{width: '35%'}}>PEMERIKSAAN</th>
                  <th style={{width: '15%'}}>HASIL</th>
                  <th style={{width: '15%'}}>SATUAN</th>
                  <th style={{width: '20%'}}>NILAI RUJUKAN</th>
                  <th style={{width: '15%'}}>KETERANGAN</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.id || i}>
                    <td>{r.test_name || r.test_code}</td>
                    <td style={{ fontWeight: r.flag !== 'normal' ? 'bold' : 'normal' }}>
                      {r.result_value} {r.flag !== 'normal' ? '*' : ''}
                      {/* Komponen wajib nomor 13: hasil asli dan hasil yang
                          diperbaiki harus dapat dibedakan. */}
                      {r.revision_count > 0 && (
                        <sup title={`Diperbaiki ${r.revision_count}x`}> R{r.revision_count}</sup>
                      )}
                    </td>
                    <td>{r.unit || '-'}</td>
                    <td>{rentangRujukan(r, patient.gender)}</td>
                    <td>{r.flag !== 'normal' ? r.flag.toUpperCase() : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        
        {adaPerbaikan && (
          <p className="catatan-revisi">
            Tanda <b>R</b> menandai hasil yang pernah diperbaiki. Nilai aslinya tersimpan
            pada riwayat hasil dan dapat ditelusuri.
          </p>
        )}

        <div className="report-footer">
          {/* Komponen wajib nomor 12 dan 14: identitas dan otorisasi petugas
              yang berwenang mengeluarkan hasil. PMK 24/2022 Pasal 16 ayat (2)
              juga menuntut nama dan waktu pada setiap pencatatan. */}
          <div className="signature-box">
            <p>Diverifikasi oleh,</p>
            <br /><br /><br />
            <p><strong>{pemverifikasi || '.....................................'}</strong></p>
            <p className="jabatan">
              {pemverifikasi ? 'Penanggung Jawab Laboratorium' : 'Belum diverifikasi'}
              {terbit ? ` — ${waktu(terbit)}` : ''}
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .catatan-revisi { font-size: 0.8rem; color: #555; margin: 0.5rem 0 0; }
        .signature-box .jabatan { font-size: 0.78rem; color: #555; margin: 0.15rem 0 0; font-weight: normal; }
        .modal-overlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: flex-start;
          z-index: 1000; overflow-y: auto; padding: 2rem 0;
        }
        .modal-content {
          background: white; width: 1000px; max-width: 95%; border-radius: 8px;
          padding: 2rem; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          color: #333;
        }
        .modal-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 1rem;
        }
        .hospital-brand h2 { margin: 0 0 0.5rem 0; text-align: center; color: #000; font-size: 1.25rem; }
        .hospital-brand p { margin: 0 0 1rem 0; text-align: center; font-size: 0.9rem; }
        .hospital-brand hr { border: 1px solid #000; margin-bottom: 1rem; }
        
        .patient-info-table { width: 100%; margin-bottom: 2rem; font-size: 0.95rem; }
        .patient-info-table td { padding: 0.25rem 0; }
        
        .report-table { width: 100%; border-collapse: collapse; margin-bottom: 3rem; color: #000 !important; background: #fff !important; }
        .report-table th, .report-table td { background: transparent !important; color: #000 !important; }
        .report-table th { border-bottom: 2px solid #000 !important; border-top: 2px solid #000 !important; padding: 0.75rem 0.5rem; text-align: left; font-weight: bold; white-space: nowrap; }
        .report-table td { padding: 0.5rem; border-bottom: 1px dashed #ccc !important; }
        
        .report-footer { display: flex; justify-content: flex-end; }
        .signature-box { text-align: center; width: 200px; }
        .signature-box p { margin: 0; color: #000; }
        
        .print-btn { background: #4f46e5; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; font-weight: bold; }
        .close-btn { background: #ef4444; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: bold; }
        
        @media print {
          @page { margin: 0.5cm; size: A4 portrait; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible !important; color: #000 !important; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0; box-shadow: none; background: transparent; }
          .modal-overlay { padding: 0; background: transparent; position: absolute; top: 0; left: 0; }
          .modal-content { width: 100%; max-width: none; max-height: none; padding: 0; overflow: visible; box-shadow: none; }
          .no-print { display: none !important; }
          .report-table th, .report-table td { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}

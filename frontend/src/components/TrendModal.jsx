import { useEffect, useState } from 'react';
import { api } from '../api';

/** Grafik tren hasil numerik satu pasien (SVG inline, tanpa library). */
export default function TrendModal({ patient, onClose }) {
  const [tests, setTests] = useState([]);
  const [testId, setTestId] = useState('');
  const [points, setPoints] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // daftar tes numerik yang pernah ada hasilnya utk pasien ini
    api.results.list(patient.id).then((rows) => {
      const seen = new Map();
      rows.forEach((r) => {
        if (r.result_numeric != null && !seen.has(r.test_id)) {
          seen.set(r.test_id, { id: r.test_id, code: r.test_code, name: r.test_name });
        }
      });
      const list = [...seen.values()];
      setTests(list);
      if (list.length) setTestId(String(list[0].id));
    });
  }, [patient]);

  useEffect(() => {
    if (!testId) return;
    setLoading(true);
    api.results.trend(patient.id, testId)
      .then((rows) => {
        setPoints(rows);
        setMeta(rows[0] || null);
      })
      .finally(() => setLoading(false));
  }, [testId, patient]);

  const W = 620, H = 260, PAD = 44;
  const nums = points.map((p) => Number(p.result_numeric));
  const refMin = meta?.reference_min != null ? Number(meta.reference_min) : null;
  const refMax = meta?.reference_max != null ? Number(meta.reference_max) : null;
  const allVals = [...nums, ...(refMin != null ? [refMin] : []), ...(refMax != null ? [refMax] : [])];
  const min = allVals.length ? Math.min(...allVals) : 0;
  const max = allVals.length ? Math.max(...allVals) : 1;
  const range = max - min || 1;
  const x = (i) => PAD + (i * (W - PAD * 2)) / Math.max(points.length - 1, 1);
  const y = (v) => H - PAD - ((v - min) / range) * (H - PAD * 2);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(Number(p.result_numeric)).toFixed(1)}`).join(' ');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: 700, maxWidth: '95%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>📈 Tren Hasil — {patient.name}</h2>
          <button type="button" className="danger" onClick={onClose}>Tutup</button>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ marginRight: '0.5rem' }}>Pemeriksaan:</label>
          <select value={testId} onChange={(e) => setTestId(e.target.value)}>
            {tests.length === 0 && <option value="">(tidak ada data numerik)</option>}
            {tests.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
          </select>
        </div>

        {loading ? <p>Memuat...</p> : points.length < 1 ? (
          <p style={{ color: '#666' }}>Belum ada data numerik untuk tren pemeriksaan ini.</p>
        ) : (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', background: '#fff', border: '1px solid #ddd', borderRadius: 8 }}>
              {/* area rujukan */}
              {refMin != null && refMax != null && (
                <rect x={PAD} y={y(refMax)} width={W - PAD * 2} height={Math.max(y(refMin) - y(refMax), 0)} fill="rgba(5,150,105,0.10)" />
              )}
              {refMax != null && <line x1={PAD} x2={W - PAD} y1={y(refMax)} y2={y(refMax)} stroke="#059669" strokeDasharray="4" strokeWidth="1" />}
              {refMin != null && <line x1={PAD} x2={W - PAD} y1={y(refMin)} y2={y(refMin)} stroke="#059669" strokeDasharray="4" strokeWidth="1" />}
              {/* sumbu */}
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#999" />
              <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#999" />
              <text x={PAD - 6} y={y(max)} fontSize="10" textAnchor="end" fill="#333">{max}</text>
              <text x={PAD - 6} y={y(min)} fontSize="10" textAnchor="end" fill="#333">{min}</text>
              {/* garis tren */}
              <path d={linePath} fill="none" stroke="#4f46e5" strokeWidth="2" />
              {/* titik */}
              {points.map((p, i) => {
                const crit = p.flag === 'critical';
                const abn = p.flag && p.flag !== 'normal';
                return (
                  <g key={i}>
                    <circle cx={x(i)} cy={y(Number(p.result_numeric))} r={crit ? 5 : 4}
                      fill={crit ? '#dc2626' : abn ? '#f59e0b' : '#4f46e5'} />
                    <title>{new Date(p.result_at).toLocaleString('id-ID')}: {p.result_value} {p.unit || ''} ({p.flag})</title>
                  </g>
                );
              })}
            </svg>
            <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
              {meta?.test_name} — {points.length} titik. Area hijau = rentang rujukan
              {refMin != null || refMax != null ? ` (${refMin ?? ''} - ${refMax ?? ''} ${points[0]?.unit || ''})` : ' (tidak diset)'}.
              Merah = kritis, kuning = abnormal.
            </p>
          </>
        )}
      </div>

      <style>{`
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: flex-start; z-index: 1000; overflow-y: auto; padding: 2rem 0; }
        .modal-content { background: #fff; border-radius: 8px; padding: 2rem; box-shadow: 0 10px 25px rgba(0,0,0,0.2); color: #333; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid #ddd; padding-bottom: 1rem; }
      `}</style>
    </div>
  );
}

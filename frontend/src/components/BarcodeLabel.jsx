import { useEffect } from 'react';

/**
 * Label tabung dengan barcode Code39 (scannable), tanpa library eksternal.
 * Code39 mendukung 0-9, A-Z, spasi, dan - . $ / + %
 */
const CODE39 = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw', 'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn',
  'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn',
  'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww', 'O': 'wnnnwnnwn',
  'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn',
  'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn',
  'Z': 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
};

function buildBars(text) {
  const NARROW = 2, WIDE = 5, GAP = 2, H = 60;
  const data = `*${text.toUpperCase().replace(/[^0-9A-Z\-. ]/g, '')}*`;
  const bars = [];
  let x = 0;
  for (const ch of data) {
    const pat = CODE39[ch];
    if (!pat) continue;
    for (let i = 0; i < 9; i++) {
      const w = pat[i] === 'w' ? WIDE : NARROW;
      if (i % 2 === 0) bars.push({ x, w, h: H }); // bar (even index)
      x += w;
    }
    x += GAP; // inter-character narrow space
  }
  return { bars, width: x, height: H };
}

export default function BarcodeLabel({ order, onClose }) {
  // order: { request_no, patient_name, medical_record_no, birth_date, gender, priority, barcodeValue }
  const value = order.barcodeValue || order.request_no || order.medical_record_no || '';
  const { bars, width, height } = buildBars(value);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content label-print" onClick={(e) => e.stopPropagation()} style={{ width: 380, maxWidth: '95%' }}>
        <div className="modal-header no-print">
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>🏷️ Label Tabung</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="primary" onClick={() => window.print()}>🖨️ Cetak</button>
            <button className="danger" onClick={onClose}>Tutup</button>
          </div>
        </div>

        <div className="label-body">
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{order.patient_name}</div>
          <div style={{ fontSize: '0.85rem' }}>
            RM: {order.medical_record_no}
            {order.gender ? ` • ${order.gender}` : ''}
            {order.birth_date ? ` • ${new Date(order.birth_date).toLocaleDateString('id-ID')}` : ''}
          </div>
          {order.priority && order.priority !== 'normal' && (
            <div style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.85rem' }}>{String(order.priority).toUpperCase()}</div>
          )}
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 70, marginTop: 6 }} preserveAspectRatio="none">
            <rect x="0" y="0" width={width} height={height} fill="#fff" />
            {bars.map((b, i) => <rect key={i} x={b.x} y="0" width={b.w} height={b.h} fill="#000" />)}
          </svg>
          <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '0.9rem', letterSpacing: 1 }}>{value}</div>
        </div>
      </div>

      <style>{`
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: flex-start; z-index: 1000; overflow-y: auto; padding: 2rem 0; }
        .modal-content { background: #fff; border-radius: 8px; padding: 1.5rem; box-shadow: 0 10px 25px rgba(0,0,0,0.2); color: #111; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid #ddd; padding-bottom: 0.75rem; }
        .label-body { border: 1px dashed #999; border-radius: 6px; padding: 0.75rem; }
        @media print {
          @page { size: 50mm 30mm; margin: 2mm; }
          body * { visibility: hidden; }
          .label-print, .label-print * { visibility: visible !important; }
          .label-print { position: absolute; inset: 0; box-shadow: none; padding: 0; }
          .no-print { display: none !important; }
          .label-body { border: none; padding: 0; }
        }
      `}</style>
    </div>
  );
}

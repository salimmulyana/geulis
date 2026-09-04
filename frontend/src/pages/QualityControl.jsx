import { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { api } from '../api';

/**
 * Kontrol mutu harian.
 *
 * Data QC sudah lama dikirim alat lewat jalur yang sama dengan hasil pasien,
 * tapi dulu dibuang. Halaman ini menampilkannya sebagai grafik Levey-Jennings:
 * garis tengah = mean lot, garis putus-putus = ±2 SD, garis luar = ±3 SD.
 * Titik yang melanggar aturan Westgard diberi tanda.
 */

const WARNA = { in: '#22a06b', warning: '#d99000', out: '#d64545', unknown: '#8a94a6' };

function GrafikLJ({ titik }) {
  const lebar = 720;
  const tinggi = 260;
  const padKiri = 44;
  const padBawah = 28;

  const { skalaY, garis } = useMemo(() => {
    const z = titik.map((t) => (t.z_score == null ? 0 : Number(t.z_score)));
    const maks = Math.max(4, ...z.map((v) => Math.abs(v) + 0.5));
    const y = (nilaiZ) => tinggi / 2 - (nilaiZ / maks) * (tinggi / 2 - 12);
    return { skalaY: y, garis: [3, 2, 1, 0, -1, -2, -3].filter((g) => Math.abs(g) <= maks) };
  }, [titik]);

  if (!titik.length) return <p className="kosong">Belum ada data QC untuk pilihan ini.</p>;

  const x = (i) => padKiri + (i * (lebar - padKiri - 12)) / Math.max(titik.length - 1, 1);

  return (
    <div className="grafik-bungkus">
      <svg viewBox={`0 0 ${lebar} ${tinggi + padBawah}`} className="grafik">
        {garis.map((g) => (
          <g key={g}>
            <line
              x1={padKiri} x2={lebar - 12} y1={skalaY(g)} y2={skalaY(g)}
              stroke={g === 0 ? '#5b6b7f' : Math.abs(g) === 3 ? '#d64545' : '#a9b3c1'}
              strokeWidth={g === 0 ? 1.5 : 1}
              strokeDasharray={g === 0 ? '' : Math.abs(g) === 3 ? '2 3' : '4 4'}
            />
            <text x={4} y={skalaY(g) + 4} className="label-sumbu">
              {g === 0 ? 'mean' : `${g > 0 ? '+' : ''}${g}SD`}
            </text>
          </g>
        ))}
        <polyline
          fill="none" stroke="#4b7bec" strokeWidth="1.5"
          points={titik.map((t, i) => `${x(i)},${skalaY(Number(t.z_score) || 0)}`).join(' ')}
        />
        {titik.map((t, i) => (
          <circle
            key={t.id} cx={x(i)} cy={skalaY(Number(t.z_score) || 0)}
            r={t.verdict === 'out' ? 5 : 3.5}
            fill={WARNA[t.verdict] || WARNA.unknown}
          >
            <title>
              {`${new Date(t.measured_at).toLocaleString('id-ID')}\nnilai ${t.value}` +
                (t.z_score != null ? `\nz = ${Number(t.z_score).toFixed(2)}` : '') +
                (t.rule_broken ? `\nmelanggar ${t.rule_broken}` : '')}
            </title>
          </circle>
        ))}
      </svg>
      <div className="legenda">
        <span><i style={{ background: WARNA.in }} /> dalam batas</span>
        <span><i style={{ background: WARNA.warning }} /> peringatan (1-2s)</span>
        <span><i style={{ background: WARNA.out }} /> ditolak</span>
        <span><i style={{ background: WARNA.unknown }} /> belum ada mean/SD lot</span>
      </div>
    </div>
  );
}

export default function QualityControl() {
  const [ringkasan, setRingkasan] = useState(null);
  const [lots, setLots] = useState([]);
  const [pilihan, setPilihan] = useState(null);
  const [titik, setTitik] = useState([]);

  const muat = async () => {
    try {
      const [r, l] = await Promise.all([api.qc.summary(), api.qc.lots()]);
      setRingkasan(r);
      setLots(l);
      if (!pilihan && l.length) setPilihan(l[0]);
    } catch (e) {
      Swal.fire('Gagal memuat', e.message, 'error');
    }
  };

  useEffect(() => { muat(); }, []);

  useEffect(() => {
    if (!pilihan) return;
    api.qc
      .chart(pilihan.instrument_id, pilihan.test_id, pilihan.level, 60)
      .then(setTitik)
      .catch((e) => Swal.fire('Gagal memuat grafik', e.message, 'error'));
  }, [pilihan]);

  const hariIni = ringkasan?.hari_ini || {};

  return (
    <div>
      <h2>🎯 Kontrol Mutu</h2>
      <p className="keterangan">
        QC harian adalah satu-satunya cara mengetahui alat melenceng sebelum hasil
        pasien ikut salah. Data ini dikirim sendiri oleh alat.
      </p>

      <div className="kartu-baris">
        <div className="kartu"><b>{hariIni.total || 0}</b><span>titik QC hari ini</span></div>
        <div className="kartu bahaya"><b>{hariIni.keluar || 0}</b><span>ditolak</span></div>
        <div className="kartu waspada"><b>{hariIni.peringatan || 0}</b><span>peringatan</span></div>
        <div className="kartu"><b>{hariIni.belum_dinilai || 0}</b><span>belum ada mean/SD lot</span></div>
      </div>

      {!lots.length && (
        <div className="pesan">
          Belum ada lot kontrol terdaftar. Data QC dari alat tetap tersimpan, tapi belum
          bisa dinilai sampai mean dan SD dari sisipan botol kontrol dimasukkan.
        </div>
      )}

      {lots.length > 0 && (
        <>
          <div className="pilih">
            <label>Lot:</label>
            <select
              value={pilihan?.id || ''}
              onChange={(e) => setPilihan(lots.find((l) => String(l.id) === e.target.value))}
            >
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.instrument_code} — {l.test_code} — {l.level}
                  {l.lot_no ? ` (lot ${l.lot_no})` : ''}
                </option>
              ))}
            </select>
            {pilihan && (
              <span className="target">
                mean {pilihan.target_mean ?? '-'} · SD {pilihan.target_sd ?? '-'}
              </span>
            )}
          </div>
          <GrafikLJ titik={titik} />
        </>
      )}

      <h3>Pelanggaran terakhir</h3>
      {!ringkasan?.pelanggaran_terakhir?.length ? (
        <p className="kosong">Tidak ada pelanggaran tercatat.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Waktu</th><th>Alat</th><th>Parameter</th><th>Level</th><th>Nilai</th><th>z</th><th>Aturan</th></tr>
          </thead>
          <tbody>
            {ringkasan.pelanggaran_terakhir.map((p) => (
              <tr key={p.id} className={p.verdict === 'out' ? 'baris-bahaya' : 'baris-waspada'}>
                <td>{new Date(p.measured_at).toLocaleString('id-ID')}</td>
                <td>{p.instrument_code || '-'}</td>
                <td>{p.test_code}</td>
                <td>{p.level || '-'}</td>
                <td>{p.value}</td>
                <td>{p.z_score == null ? '-' : Number(p.z_score).toFixed(2)}</td>
                <td><b>{p.rule_broken || '-'}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <style>{`
        .keterangan { color: var(--muted, #667); margin-top: 0; }
        .kartu-baris { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1rem 0; }
        .kartu { flex: 1 1 140px; padding: 0.75rem 1rem; border: 1px solid var(--border, #d5d9e0); border-radius: 8px; }
        .kartu b { display: block; font-size: 1.6rem; line-height: 1.2; }
        .kartu span { color: var(--muted, #667); font-size: 0.85rem; }
        .kartu.bahaya b { color: #d64545; }
        .kartu.waspada b { color: #d99000; }
        .pesan { padding: 0.75rem 1rem; border-left: 3px solid #d99000; background: rgba(217,144,0,0.08); border-radius: 4px; }
        .pilih { display: flex; align-items: center; gap: 0.6rem; margin: 1rem 0 0.5rem; flex-wrap: wrap; }
        .target { color: var(--muted, #667); font-size: 0.85rem; }
        .grafik-bungkus { overflow-x: auto; }
        .grafik { width: 100%; min-width: 560px; }
        .label-sumbu { font-size: 10px; fill: #8a94a6; }
        .legenda { display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.8rem; color: var(--muted, #667); }
        .legenda i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; }
        .kosong { padding: 1.5rem; text-align: center; color: var(--muted, #667); }
        .baris-bahaya td { background: rgba(214,69,69,0.08); }
        .baris-waspada td { background: rgba(217,144,0,0.08); }
      `}</style>
    </div>
  );
}

import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { api } from '../api';

/**
 * Pemantapan Mutu Eksternal.
 *
 * Kewajiban PMK 411/2010 Pasal 6 huruf a. Berbeda dari QC harian yang datanya
 * datang sendiri dari alat, PME dijalankan penyelenggara luar: lab menerima
 * bahan uji, memeriksanya, mengirim hasil, lalu menerima penilaian. Halaman ini
 * menyimpan keikutsertaan dan hasilnya supaya buktinya tidak tercecer di berkas
 * kertas saat asesmen akreditasi.
 */

const WARNA = { baik: '#22a06b', ragu: '#d99000', buruk: '#d64545', belum: '#8a94a6' };

export default function PME() {
  const [programs, setPrograms] = useState([]);
  const [terpilih, setTerpilih] = useState(null);
  const [hasil, setHasil] = useState([]);
  const [tes, setTes] = useState([]);

  const muat = async () => {
    try {
      const [p, t] = await Promise.all([api.pme.programs(), api.tests.list()]);
      setPrograms(p);
      setTes(t);
      if (!terpilih && p.length) setTerpilih(p[0]);
    } catch (e) {
      Swal.fire('Gagal memuat', e.message, 'error');
    }
  };
  useEffect(() => { muat(); }, []);

  useEffect(() => {
    if (!terpilih) return setHasil([]);
    api.pme.results(terpilih.id).then(setHasil).catch(() => {});
  }, [terpilih]);

  const tambahProgram = async () => {
    const { value: f } = await Swal.fire({
      title: 'Program PME Baru',
      html:
        '<input id="p-nama" class="swal2-input" placeholder="Nama program (mis. PNPME Hematologi)">' +
        '<input id="p-penyelenggara" class="swal2-input" placeholder="Penyelenggara">' +
        '<input id="p-siklus" class="swal2-input" placeholder="Siklus (mis. Siklus 1 2026)">' +
        '<label class="swal2-input-label">Periode mulai</label>' +
        '<input id="p-mulai" type="date" class="swal2-input">' +
        '<label class="swal2-input-label">Periode selesai</label>' +
        '<input id="p-selesai" type="date" class="swal2-input">',
      showCancelButton: true,
      confirmButtonText: 'Simpan',
      cancelButtonText: 'Batal',
      focusConfirm: false,
      preConfirm: () => {
        const nama = document.getElementById('p-nama').value.trim();
        if (!nama) { Swal.showValidationMessage('Nama program wajib diisi'); return false; }
        return {
          name: nama,
          organizer: document.getElementById('p-penyelenggara').value.trim() || null,
          cycle: document.getElementById('p-siklus').value.trim() || null,
          period_start: document.getElementById('p-mulai').value || null,
          period_end: document.getElementById('p-selesai').value || null,
        };
      },
    });
    if (!f) return;
    try {
      await api.pme.createProgram(f);
      muat();
    } catch (e) { Swal.fire('Gagal', e.message, 'error'); }
  };

  const tambahHasil = async () => {
    if (!terpilih) return;
    const pilihanTes = {};
    tes.forEach((t) => { pilihanTes[t.id] = `${t.code} — ${t.name}`; });
    const { value: f } = await Swal.fire({
      title: `Hasil PME — ${terpilih.name}`,
      html:
        '<select id="h-tes" class="swal2-input">' +
        '<option value="">-- pilih pemeriksaan --</option>' +
        Object.entries(pilihanTes).map(([id, label]) => `<option value="${id}">${label}</option>`).join('') +
        '</select>' +
        '<input id="h-sampel" class="swal2-input" placeholder="Kode bahan uji">' +
        '<input id="h-nilai" class="swal2-input" type="number" step="any" placeholder="Hasil laboratorium kita">' +
        '<input id="h-target" class="swal2-input" type="number" step="any" placeholder="Nilai konsensus/rujukan">' +
        '<input id="h-sd" class="swal2-input" type="number" step="any" placeholder="SD kelompok peserta">' +
        '<label class="swal2-input-label">Tanggal laporan</label>' +
        '<input id="h-tanggal" type="date" class="swal2-input">',
      showCancelButton: true,
      confirmButtonText: 'Simpan',
      cancelButtonText: 'Batal',
      focusConfirm: false,
      preConfirm: () => {
        const testId = document.getElementById('h-tes').value;
        if (!testId) { Swal.showValidationMessage('Pilih pemeriksaannya'); return false; }
        return {
          program_id: terpilih.id,
          test_id: Number(testId),
          test_code: (pilihanTes[testId] || '').split(' — ')[0],
          sample_code: document.getElementById('h-sampel').value.trim() || null,
          our_value: document.getElementById('h-nilai').value || null,
          target_value: document.getElementById('h-target').value || null,
          target_sd: document.getElementById('h-sd').value || null,
          reported_at: document.getElementById('h-tanggal').value || null,
        };
      },
    });
    if (!f) return;
    try {
      const out = await api.pme.createResult(f);
      const pesan = out.verdict === 'belum'
        ? 'Tersimpan. Belum bisa dinilai karena nilai konsensus atau SD belum diisi.'
        : `Tersimpan. SDI ${out.z_score} — dinilai ${out.verdict}.`;
      await Swal.fire('Tersimpan', pesan, out.verdict === 'buruk' ? 'warning' : 'success');
      api.pme.results(terpilih.id).then(setHasil);
      muat();
    } catch (e) { Swal.fire('Gagal', e.message, 'error'); }
  };

  return (
    <div>
      <div className="head">
        <h2>🏅 Pemantapan Mutu Eksternal</h2>
        <button className="btn-sm" onClick={tambahProgram}>+ Program</button>
      </div>
      <p className="keterangan">
        Kewajiban PMK 411/2010 Pasal 6 huruf a: laboratorium wajib mengikuti pemantapan
        mutu eksternal yang diakui pemerintah, di samping pemantapan mutu internal.
      </p>

      {!programs.length ? (
        <p className="kosong">Belum ada program PME terdaftar.</p>
      ) : (
        <>
          <div className="pilih">
            <label>Program:</label>
            <select
              value={terpilih?.id || ''}
              onChange={(e) => setTerpilih(programs.find((p) => String(p.id) === e.target.value))}
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.cycle ? ` — ${p.cycle}` : ''}{p.organizer ? ` (${p.organizer})` : ''}
                </option>
              ))}
            </select>
            <button className="btn-sm" onClick={tambahHasil}>+ Hasil</button>
            {terpilih?.jumlah_buruk > 0 && (
              <span className="peringatan">
                ⚠ {terpilih.jumlah_buruk} parameter dinilai buruk — perlu tindakan perbaikan
              </span>
            )}
          </div>

          {!hasil.length ? (
            <p className="kosong">Belum ada hasil untuk program ini.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Pemeriksaan</th><th>Bahan uji</th><th>Hasil kita</th>
                  <th>Konsensus</th><th>SD</th><th>SDI</th><th>Penilaian</th><th>Tgl laporan</th>
                </tr>
              </thead>
              <tbody>
                {hasil.map((h) => (
                  <tr key={h.id}>
                    <td>{h.test_name || h.test_code}</td>
                    <td>{h.sample_code || '-'}</td>
                    <td>{h.our_value ?? '-'}</td>
                    <td>{h.target_value ?? '-'}</td>
                    <td>{h.target_sd ?? '-'}</td>
                    <td>{h.z_score == null ? '-' : Number(h.z_score).toFixed(2)}</td>
                    <td><span className="vonis" style={{ background: WARNA[h.verdict] }}>{h.verdict}</span></td>
                    <td>{h.reported_at ? new Date(h.reported_at).toLocaleDateString('id-ID') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <style>{`
        .head { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
        .keterangan { color: var(--muted, #667); margin-top: 0; }
        .pilih { display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; margin:1rem 0; }
        .peringatan { color:#d64545; font-size:0.85rem; }
        .kosong { padding:1.5rem; text-align:center; color: var(--muted,#667); }
        .vonis { color:#fff; padding:0.1rem 0.5rem; border-radius:10px; font-size:0.78rem; }
      `}</style>
    </div>
  );
}

import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { api } from '../api';

/**
 * Hasil yang datang dari alat tapi nomor sampelnya tidak cocok dengan pasien
 * atau permintaan mana pun.
 *
 * Sebelumnya hasil semacam ini otomatis membuat pasien baru bernama
 * "Pasien <nomor sampel>", sehingga hasil pasien asli menempel pada pasien
 * karangan. Sekarang ditahan di sini sampai ada orang yang memastikan ini
 * milik siapa.
 */
export default function Unmatched() {
  const [daftar, setDaftar] = useState([]);
  const [status, setStatus] = useState('pending');
  const [memuat, setMemuat] = useState(true);

  const muat = async (s = status) => {
    setMemuat(true);
    try {
      setDaftar(await api.unmatched.list(s));
    } catch (e) {
      Swal.fire('Gagal memuat', e.message, 'error');
    } finally {
      setMemuat(false);
    }
  };

  useEffect(() => { muat(status); }, [status]);

  const cocokkan = async (baris) => {
    const { value: kata } = await Swal.fire({
      title: `Sampel ${baris.sample_id}`,
      input: 'text',
      inputLabel: 'Cari pasien (nama atau nomor rekam medis)',
      inputPlaceholder: 'mis. KONIAH atau 101946',
      showCancelButton: true,
      confirmButtonText: 'Cari',
      cancelButtonText: 'Batal',
    });
    if (!kata) return;

    let pasien = [];
    try {
      pasien = await api.patients.list(kata);
    } catch (e) {
      return Swal.fire('Gagal mencari', e.message, 'error');
    }
    if (!pasien.length) return Swal.fire('Tidak ditemukan', 'Tidak ada pasien yang cocok.', 'info');

    const pilihan = {};
    pasien.slice(0, 25).forEach((p) => {
      pilihan[p.id] = `${p.name} — RM ${p.medical_record_no || '-'}${p.birth_date ? ` (${String(p.birth_date).slice(0, 10)})` : ''}`;
    });

    const { value: patientId } = await Swal.fire({
      title: 'Pilih pasien yang benar',
      input: 'select',
      inputOptions: pilihan,
      inputPlaceholder: 'pilih satu',
      showCancelButton: true,
      confirmButtonText: 'Cocokkan',
      cancelButtonText: 'Batal',
      // Salah pilih di sini berarti hasil masuk ke rekam medis orang lain,
      // jadi pilihannya ditegaskan sekali lagi.
      inputValidator: (v) => (!v ? 'Pilih dulu pasiennya' : undefined),
    });
    if (!patientId) return;

    const nama = pilihan[patientId];
    const tegas = await Swal.fire({
      title: 'Sudah yakin?',
      html: `${baris.jumlah_parameter} hasil dari sampel <b>${baris.sample_id}</b> akan dicatat atas nama:<br><b>${nama}</b>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, catat',
      cancelButtonText: 'Batal',
    });
    if (!tegas.isConfirmed) return;

    try {
      const out = await api.unmatched.match(baris.id, Number(patientId));
      await Swal.fire('Tercatat', `${out.tersimpan} hasil masuk ke ${nama}.`, 'success');
      muat();
    } catch (e) {
      Swal.fire('Gagal', e.message, 'error');
    }
  };

  const buang = async (baris) => {
    const { value: alasan, isConfirmed } = await Swal.fire({
      title: `Buang sampel ${baris.sample_id}?`,
      input: 'text',
      inputLabel: 'Alasan (mis. uji coba alat, bahan kontrol)',
      showCancelButton: true,
      confirmButtonText: 'Buang',
      cancelButtonText: 'Batal',
    });
    if (!isConfirmed) return;
    try {
      await api.unmatched.discard(baris.id, alasan);
      muat();
    } catch (e) {
      Swal.fire('Gagal', e.message, 'error');
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2>📥 Hasil Belum Cocok</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Menunggu dicocokkan</option>
          <option value="matched">Sudah dicocokkan</option>
          <option value="discarded">Dibuang</option>
        </select>
      </div>

      <p className="keterangan">
        Hasil di sini datang dari alat dengan nomor sampel yang tidak dikenal. Cocokkan
        ke pasien yang benar, atau buang bila memang bukan sampel pasien.
      </p>

      {memuat ? (
        <p>Memuat...</p>
      ) : !daftar.length ? (
        <p className="kosong">Tidak ada. {status === 'pending' && 'Semua hasil sudah punya pasien.'}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Nomor sampel</th>
              <th>Alat</th>
              <th>Identitas dari alat</th>
              <th>Parameter</th>
              {status === 'pending' ? <th>Tindakan</th> : <th>Keterangan</th>}
            </tr>
          </thead>
          <tbody>
            {daftar.map((b) => (
              <tr key={b.id}>
                <td>{new Date(b.received_at).toLocaleString('id-ID')}</td>
                <td><b>{b.sample_id}</b></td>
                <td>{b.instrument_code || '-'}</td>
                <td>{b.patient_info?.name || <i>tidak dikirim alat</i>}</td>
                <td>{b.jumlah_parameter}</td>
                <td>
                  {status === 'pending' ? (
                    <>
                      <button className="btn-sm" onClick={() => cocokkan(b)}>Cocokkan</button>{' '}
                      <button className="btn-sm secondary" onClick={() => buang(b)}>Buang</button>
                    </>
                  ) : (
                    b.matched_patient_name || b.note || '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <style>{`
        .page-head { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
        .keterangan { color: var(--muted, #667); margin-top: 0; }
        .kosong { padding: 2rem; text-align: center; color: var(--muted, #667); }
      `}</style>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import Swal from 'sweetalert2';

/**
 * Pengelolaan nilai rujukan menurut umur, jenis kelamin, dan kondisi.
 *
 * Dua keputusan tampilan yang disengaja:
 *
 * 1. Umur diisi dengan SATUAN yang dipilih (hari/bulan/tahun) lalu diubah ke
 *    hari. Menuntut petugas menghitung "6570 hari" untuk 18 tahun adalah cara
 *    pasti mendapatkan salah ketik pada angka yang menentukan penandaan.
 *
 * 2. Ada kotak coba di bawah. Tanpa itu, satu-satunya cara memastikan rentang
 *    neonatus benar adalah menunggu ada bayi diperiksa — dan kalau ternyata
 *    salah, kesalahannya sudah masuk rekam medis.
 */

const KOSONG = {
  gender: '',
  umur_nilai_min: '',
  umur_satuan_min: 'tahun',
  umur_nilai_max: '',
  umur_satuan_max: 'tahun',
  kondisi: '',
  label: '',
  ref_min: '',
  ref_max: '',
  critical_min: '',
  critical_max: '',
  sumber: '',
};

const FAKTOR = { hari: 1, bulan: 30, tahun: 365 };

function keHari(nilai, satuan) {
  if (nilai === '' || nilai == null) return null;
  const n = Number(nilai);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (FAKTOR[satuan] || 1));
}

/** Tampilkan hari dalam satuan yang paling enak dibaca. */
function dariHari(h) {
  if (h == null) return { nilai: '', satuan: 'tahun' };
  if (h % 365 === 0 && h >= 365) return { nilai: h / 365, satuan: 'tahun' };
  if (h % 30 === 0 && h >= 30) return { nilai: h / 30, satuan: 'bulan' };
  return { nilai: h, satuan: 'hari' };
}

function teksUmur(r) {
  const a = r.umur_min_hari;
  const b = r.umur_max_hari;
  if (a == null && b == null) return 'semua umur';
  const f = (h) => {
    const { nilai, satuan } = dariHari(h);
    return `${nilai} ${satuan}`;
  };
  if (a != null && b != null) return `${f(a)} – ${f(b)}`;
  if (a != null) return `≥ ${f(a)}`;
  return `< ${f(b)}`;
}

export default function NilaiRujukan() {
  const [tests, setTests] = useState([]);
  const [testId, setTestId] = useState('');
  const [list, setList] = useState([]);
  const [form, setForm] = useState(KOSONG);
  const [editId, setEditId] = useState(null);
  const [buka, setBuka] = useState(false);

  const [coba, setCoba] = useState({ gender: 'L', umur_hari: '', kondisi: '', nilai: '' });
  const [hasilCoba, setHasilCoba] = useState(null);

  const test = useMemo(() => tests.find((t) => String(t.id) === String(testId)), [tests, testId]);

  useEffect(() => {
    api.tests.list().then(setTests).catch(console.error);
  }, []);

  const muat = () => {
    if (!testId) return setList([]);
    api.nilaiRujukan.list(testId).then(setList).catch(console.error);
  };
  useEffect(muat, [testId]);

  const simpan = async (e) => {
    e.preventDefault();
    const body = {
      test_id: testId,
      gender: form.gender || null,
      umur_min_hari: keHari(form.umur_nilai_min, form.umur_satuan_min),
      umur_max_hari: keHari(form.umur_nilai_max, form.umur_satuan_max),
      kondisi: form.kondisi || null,
      label: form.label,
      ref_min: form.ref_min,
      ref_max: form.ref_max,
      critical_min: form.critical_min,
      critical_max: form.critical_max,
      sumber: form.sumber,
    };
    try {
      if (editId) await api.nilaiRujukan.update(editId, body);
      else await api.nilaiRujukan.create(body);
      setBuka(false);
      setForm(KOSONG);
      setEditId(null);
      muat();
      Swal.fire('Tersimpan', 'Nilai rujukan telah disimpan.', 'success');
    } catch (err) {
      // Tabrakan rentang ditampilkan sebagai pertanyaan, bukan sekadar galat.
      // Petugas yang memang bermaksud menimpa perlu jalan keluar; yang tidak
      // sengaja perlu diberi tahu rentang mana yang bentrok.
      if (String(err.message).toLowerCase().includes('bertabrakan')) {
        const jwb = await Swal.fire({
          icon: 'warning',
          title: 'Rentang bertabrakan',
          text: err.message,
          showCancelButton: true,
          confirmButtonText: 'Simpan juga',
          cancelButtonText: 'Perbaiki dulu',
        });
        if (jwb.isConfirmed) {
          try {
            if (editId) await api.nilaiRujukan.update(editId, { ...body, paksa: true });
            else await api.nilaiRujukan.create({ ...body, paksa: true });
            setBuka(false);
            setForm(KOSONG);
            setEditId(null);
            muat();
          } catch (e2) {
            Swal.fire('Gagal', e2.message, 'error');
          }
        }
        return;
      }
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  const ubah = (r) => {
    const a = dariHari(r.umur_min_hari);
    const b = dariHari(r.umur_max_hari);
    setForm({
      gender: r.gender || '',
      umur_nilai_min: a.nilai,
      umur_satuan_min: a.satuan,
      umur_nilai_max: b.nilai,
      umur_satuan_max: b.satuan,
      kondisi: r.kondisi || '',
      label: r.label || '',
      ref_min: r.ref_min ?? '',
      ref_max: r.ref_max ?? '',
      critical_min: r.critical_min ?? '',
      critical_max: r.critical_max ?? '',
      sumber: r.sumber || '',
    });
    setEditId(r.id);
    setBuka(true);
  };

  const hapus = async (r) => {
    const j = await Swal.fire({
      icon: 'warning',
      title: 'Hapus rentang ini?',
      text: `"${r.label}" akan dihapus. Hasil yang sudah tersimpan tidak berubah — rujukan yang dipakai saat itu ikut tersimpan bersama hasilnya.`,
      showCancelButton: true,
      confirmButtonText: 'Hapus',
      cancelButtonText: 'Batal',
    });
    if (!j.isConfirmed) return;
    await api.nilaiRujukan.remove(r.id);
    muat();
  };

  const jalankanCoba = async () => {
    if (!testId) return;
    try {
      const h = await api.nilaiRujukan.coba({
        test_id: testId,
        gender: coba.gender,
        umur_hari: coba.umur_hari,
        kondisi: coba.kondisi,
        nilai: coba.nilai,
      });
      setHasilCoba(h);
    } catch (err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2>Nilai Rujukan</h2>
      </div>

      <p className="keterangan">
        Rujukan yang paling khusus menang. Kondisi mengalahkan jenis kelamin, jenis kelamin
        mengalahkan umur. Bila tidak ada satu pun yang cocok, dipakai rujukan dari katalog
        pemeriksaan. <strong>Batas atas umur tidak termasuk</strong> — 0–30 hari dan 30–365 hari
        bersambung tanpa celah.
      </p>

      <div className="baris-alat">
        <select value={testId} onChange={(e) => { setTestId(e.target.value); setHasilCoba(null); }}>
          <option value="">— pilih pemeriksaan —</option>
          {tests.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} — {t.name}
            </option>
          ))}
        </select>
        {testId && (
          <button onClick={() => { setForm(KOSONG); setEditId(null); setBuka(true); }}>
            + Rentang
          </button>
        )}
      </div>

      {testId && (
        <>
          <table className="tabel">
            <thead>
              <tr>
                <th>Label</th>
                <th>Umur</th>
                <th>JK</th>
                <th>Kondisi</th>
                <th>Rujukan</th>
                <th>Kritis</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan="7" className="kosong">
                    Belum ada rentang khusus. Yang dipakai rujukan dari katalog
                    {test ? ` (${test.reference_min ?? '–'} – ${test.reference_max ?? '–'})` : ''}.
                  </td>
                </tr>
              )}
              {list.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.label}</strong>{r.sumber ? <div className="sumber">{r.sumber}</div> : null}</td>
                  <td>{teksUmur(r)}</td>
                  <td>{r.gender || 'semua'}</td>
                  <td>{r.kondisi || '–'}</td>
                  <td>{r.ref_min ?? '–'} – {r.ref_max ?? '–'}</td>
                  <td>{r.critical_min ?? '–'} / {r.critical_max ?? '–'}</td>
                  <td className="aksi">
                    <button className="kecil" onClick={() => ubah(r)}>Ubah</button>
                    <button className="kecil bahaya" onClick={() => hapus(r)}>Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="kotak-coba">
            <h3>Coba tanpa menyimpan</h3>
            <p className="keterangan">
              Masukkan umur dan satu angka hasil untuk melihat rujukan mana yang terpilih dan
              penanda apa yang keluar. Tidak ada yang tersimpan.
            </p>
            <div className="baris-alat">
              <select value={coba.gender} onChange={(e) => setCoba({ ...coba, gender: e.target.value })}>
                <option value="">JK tidak diketahui</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
              <input
                type="number"
                placeholder="umur (hari)"
                value={coba.umur_hari}
                onChange={(e) => setCoba({ ...coba, umur_hari: e.target.value })}
              />
              <input
                placeholder="kondisi (mis. hamil)"
                value={coba.kondisi}
                onChange={(e) => setCoba({ ...coba, kondisi: e.target.value })}
              />
              <input
                placeholder="nilai hasil"
                value={coba.nilai}
                onChange={(e) => setCoba({ ...coba, nilai: e.target.value })}
              />
              <button onClick={jalankanCoba}>Coba</button>
            </div>
            {hasilCoba && (
              <div className="hasil-coba">
                <div>
                  Rujukan terpilih:{' '}
                  <strong>{hasilCoba.terpilih ? hasilCoba.terpilih.label : 'katalog pemeriksaan'}</strong>
                  {hasilCoba.terpilih && (
                    <> ({hasilCoba.terpilih.ref_min ?? '–'} – {hasilCoba.terpilih.ref_max ?? '–'})</>
                  )}
                </div>
                {hasilCoba.penilaian && (
                  <div>
                    Penanda: <strong className={`flag-${hasilCoba.penilaian.flag}`}>{hasilCoba.penilaian.flag}</strong>
                  </div>
                )}
                {hasilCoba.konteks.umurHari == null && (
                  <div className="peringatan">
                    Umur tidak diisi, jadi semua rentang berbasis umur dilewati. Ini juga yang
                    terjadi pada pasien yang tanggal lahirnya kosong.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {buka && (
        <div className="modal-latar" onClick={() => setBuka(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={simpan}>
            <h3>{editId ? 'Ubah rentang' : 'Rentang baru'}</h3>

            <label>Label — yang tercetak di lembar hasil</label>
            <input
              required
              placeholder="mis. neonatus 0-3 hari"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />

            <label>Umur (batas atas tidak termasuk)</label>
            <div className="baris-alat">
              <input
                type="number"
                placeholder="dari"
                value={form.umur_nilai_min}
                onChange={(e) => setForm({ ...form, umur_nilai_min: e.target.value })}
              />
              <select value={form.umur_satuan_min} onChange={(e) => setForm({ ...form, umur_satuan_min: e.target.value })}>
                <option value="hari">hari</option>
                <option value="bulan">bulan</option>
                <option value="tahun">tahun</option>
              </select>
              <input
                type="number"
                placeholder="sampai"
                value={form.umur_nilai_max}
                onChange={(e) => setForm({ ...form, umur_nilai_max: e.target.value })}
              />
              <select value={form.umur_satuan_max} onChange={(e) => setForm({ ...form, umur_satuan_max: e.target.value })}>
                <option value="hari">hari</option>
                <option value="bulan">bulan</option>
                <option value="tahun">tahun</option>
              </select>
            </div>

            <div className="baris-alat">
              <div>
                <label>Jenis kelamin</label>
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="">semua</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </div>
              <div>
                <label>Kondisi</label>
                <input
                  placeholder="mis. hamil"
                  value={form.kondisi}
                  onChange={(e) => setForm({ ...form, kondisi: e.target.value })}
                />
              </div>
            </div>

            <label>Rujukan normal</label>
            <div className="baris-alat">
              <input type="number" step="any" placeholder="min" value={form.ref_min} onChange={(e) => setForm({ ...form, ref_min: e.target.value })} />
              <input type="number" step="any" placeholder="maks" value={form.ref_max} onChange={(e) => setForm({ ...form, ref_max: e.target.value })} />
            </div>

            <label>Nilai kritis — kosongkan bila pemeriksaan ini tidak punya</label>
            <div className="baris-alat">
              <input type="number" step="any" placeholder="kritis bawah" value={form.critical_min} onChange={(e) => setForm({ ...form, critical_min: e.target.value })} />
              <input type="number" step="any" placeholder="kritis atas" value={form.critical_max} onChange={(e) => setForm({ ...form, critical_max: e.target.value })} />
            </div>

            <label>Sumber</label>
            <input
              placeholder="pustaka atau sisipan reagen"
              value={form.sumber}
              onChange={(e) => setForm({ ...form, sumber: e.target.value })}
            />

            <div className="modal-aksi">
              <button type="button" className="sekunder" onClick={() => setBuka(false)}>Batal</button>
              <button type="submit">Simpan</button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .keterangan { color: #667; font-size: 0.9rem; max-width: 46rem; }
        .baris-alat { display: flex; gap: 0.5rem; align-items: flex-end; flex-wrap: wrap; margin: 0.75rem 0; }
        .tabel { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
        .tabel th, .tabel td { text-align: left; padding: 0.55rem 0.7rem; border-bottom: 1px solid #e3e6ea; vertical-align: top; }
        .tabel th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #778; }
        .kosong { color: #889; font-style: italic; }
        .sumber { font-size: 0.78rem; color: #889; }
        .aksi { white-space: nowrap; }
        .kecil { font-size: 0.8rem; padding: 0.25rem 0.6rem; }
        .kecil.bahaya { background: #b93a25; }
        .kotak-coba { margin-top: 2rem; padding: 1rem 1.2rem; border: 1px solid #e3e6ea; border-radius: 6px; background: #fafbfc; }
        .kotak-coba h3 { margin: 0 0 0.3rem; }
        .hasil-coba { margin-top: 0.6rem; font-size: 0.95rem; display: flex; flex-direction: column; gap: 0.3rem; }
        .peringatan { color: #8a5a10; font-size: 0.88rem; }
        .flag-high, .flag-critical { color: #b93a25; }
        .flag-low { color: #1a5fb4; }
        .flag-normal { color: #1a7f4b; }
        .modal-latar { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: grid; place-items: center; z-index: 50; }
        .modal { background: #fff; padding: 1.4rem 1.6rem; border-radius: 8px; width: min(38rem, 92vw); max-height: 90vh; overflow-y: auto; }
        .modal h3 { margin-top: 0; }
        .modal label { display: block; font-size: 0.82rem; color: #667; margin-top: 0.8rem; }
        .modal input, .modal select { width: 100%; box-sizing: border-box; }
        .modal-aksi { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.2rem; }
      `}</style>
    </div>
  );
}

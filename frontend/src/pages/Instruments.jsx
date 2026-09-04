import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';

const PROTOCOL_LABELS = {
  astm: 'ASTM',
  hl7: 'HL7 v2',
  json: 'JSON',
  xml: 'XML',
  tcp_json: 'JSON (legacy)',
};

const PROTOCOL_HELP = {
  astm: 'P|…|nomor_order · R|order|kode_tes|nilai|satuan (pipe, akhiri newline atau EOT)',
  hl7: 'PID/OBR untuk nomor order · OBX-3 = kode tes · OBX-5 = nilai',
  json: '{"sampleId":"ORD001","results":[{"test_code":"HGB","value":"14.2","unit":"g/dL"}]}',
  xml: '<sample>ORD001</sample> + <item code="HGB" value="14.2"/>',
  tcp_json: 'Sama seperti JSON',
};

export default function Instruments() {
  const { can } = useAuth();
  const [list, setList] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tests, setTests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [maps, setMaps] = useState([]);
  const [simrsMaps, setSimrsMaps] = useState([]);
  const [form, setForm] = useState({ code: '', name: '', manufacturer: '', model: '', protocol: 'astm', conn_mode: 'server', host: '', port: 5000, is_active: 1 });
  
  const initialMapForm = {
    test_id: null,
    test_code: '',
    test_name: '',
    reference_min: '',
    reference_max: '',
    reference_min_l: '',
    reference_max_l: '',
    reference_min_p: '',
    reference_max_p: '',
    unit: '',
    show_in_report: 1,
    sort_order: 1,
    instrument_test_code: '',
    simrs_code: '',
    port: ''
  };
  const [mapForm, setMapForm] = useState(initialMapForm);
  const [searchTerm, setSearchTerm] = useState('');
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showMapForm, setShowMapForm] = useState(false);

  const load = () => {
    api.instruments.list().then(setList);
    api.instruments.logs().then(setLogs);
    api.tests.list().then(setTests);
    if (can('mapping.view')) {
      api.mapping.get().then(res => setSimrsMaps(res.mappings || [])).catch(() => {});
    }
  };

  useEffect(() => { load(); }, []);

  const reloadMaps = async () => {
    const m = await api.instruments.maps(selected.id);
    setMaps(m);
    api.tests.list().then(setTests);
    if (can('mapping.view')) {
      const rm = await api.mapping.get().catch(() => ({ mappings: [] }));
      setSimrsMaps(rm.mappings || []);
    }
  };

  const openDetail = async (inst) => {
    setSelected(inst);
    setShowMapForm(false);
    setMapForm(initialMapForm);
    const m = await api.instruments.maps(inst.id);
    setMaps(m);
    if (can('mapping.view')) {
      const rm = await api.mapping.get().catch(() => ({ mappings: [] }));
      setSimrsMaps(rm.mappings || []);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    await api.instruments.create(form);
    setForm({ code: '', name: '', manufacturer: '', model: '', protocol: 'astm', conn_mode: 'server', host: '', port: 5000, is_active: 1 });
    setShowForm(false);
    load();
    Swal.fire('Berhasil', 'Alat berhasil ditambahkan', 'success');
  };

  const saveParameterMapping = async (e) => {
    e.preventDefault();
    try {
      let currentTestId = mapForm.test_id;
      let finalTestCode = mapForm.test_code;
      
      // 1. Create or Update Test
      const testPayload = {
        code: mapForm.test_code,
        name: mapForm.test_name,
        reference_min: mapForm.reference_min !== '' ? mapForm.reference_min : null,
        reference_max: mapForm.reference_max !== '' ? mapForm.reference_max : null,
        reference_min_l: mapForm.reference_min_l !== '' ? mapForm.reference_min_l : null,
        reference_max_l: mapForm.reference_max_l !== '' ? mapForm.reference_max_l : null,
        reference_min_p: mapForm.reference_min_p !== '' ? mapForm.reference_min_p : null,
        reference_max_p: mapForm.reference_max_p !== '' ? mapForm.reference_max_p : null,
        unit: mapForm.unit,
        sort_order: Number(mapForm.sort_order) || 999
      };

      if (currentTestId) {
        await api.tests.update(currentTestId, testPayload);
        await api.tests.setVisibility(currentTestId, mapForm.show_in_report === 1);
      } else {
        // Cek apakah kode tes sudah ada di tests (kasus ketik manual kode yang sudah ada)
        const existing = tests.find(t => t.code.toLowerCase() === mapForm.test_code.toLowerCase());
        if (existing) {
           await api.tests.update(existing.id, testPayload);
           await api.tests.setVisibility(existing.id, mapForm.show_in_report === 1);
           currentTestId = existing.id;
        } else {
           const newTest = await api.tests.create(testPayload);
           await api.tests.setVisibility(newTest.id, mapForm.show_in_report === 1);
           currentTestId = newTest.id;
        }
      }

      // 2. Create or Update Instrument Map
      if (mapForm.instrument_test_code) {
        const existingMap = maps.find(m => m.test_id === currentTestId);
        if (existingMap) {
          if (existingMap.instrument_test_code !== mapForm.instrument_test_code) {
             await api.instruments.deleteMap(existingMap.id);
             await api.instruments.addMap(selected.id, { instrument_test_code: mapForm.instrument_test_code, test_id: currentTestId });
          }
        } else {
          await api.instruments.addMap(selected.id, { instrument_test_code: mapForm.instrument_test_code, test_id: currentTestId });
        }
      } else {
         // Jika kosong, hapus mapping alat jika ada
         const existingMap = maps.find(m => m.test_id === currentTestId);
         if (existingMap) await api.instruments.deleteMap(existingMap.id);
      }
      
      // 3. Create or Update SIMRS Map (dapat diisi beberapa kode dipisahkan koma, cth: 3962, 4000)
      const currentSimrsMaps = simrsMaps.filter(sm => sm.mapping_type === 'test' && sm.lis_field === finalTestCode);
      const newCodes = (mapForm.simrs_code || '').split(',').map(c => c.trim()).filter(Boolean);

      // Hapus mapping SIMRS yang sudah tidak ada di daftar baru
      for (const sm of currentSimrsMaps) {
        if (!newCodes.includes(sm.simrs_field)) {
          await api.mapping.remove(sm.id);
        }
      }

      // Tambahkan kode SIMRS baru yang belum terdaftar
      for (const c of newCodes) {
        const exist = currentSimrsMaps.find(sm => sm.simrs_field === c);
        if (!exist) {
          await api.mapping.create({ mapping_type: 'test', lis_field: finalTestCode, simrs_field: c });
        }
      }

      // 4. Update Instrument Port if changed
      if (mapForm.port && Number(mapForm.port) !== selected.port) {
        const updatedInst = await api.instruments.update(selected.id, {
          ...selected,
          port: Number(mapForm.port)
        });
        setSelected(updatedInst);
        api.instruments.list().then(setList);
      }

      setMapForm(initialMapForm);
      setShowMapForm(false);
      reloadMaps();
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Tersimpan', showConfirmButton: false, timer: 1500 });
    } catch(err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  };

  const handleEdit = (t, mapObj) => {
    const simrsMapObjs = simrsMaps.filter(sm => sm.mapping_type === 'test' && sm.lis_field === t.code);
    const simrsCodesStr = simrsMapObjs.map(s => s.simrs_field).join(', ');

    setMapForm({
      test_id: t.id,
      test_code: t.code,
      test_name: t.name,
      reference_min: t.reference_min != null ? t.reference_min : '',
      reference_max: t.reference_max != null ? t.reference_max : '',
      reference_min_l: t.reference_min_l != null ? t.reference_min_l : '',
      reference_max_l: t.reference_max_l != null ? t.reference_max_l : '',
      reference_min_p: t.reference_min_p != null ? t.reference_min_p : '',
      reference_max_p: t.reference_max_p != null ? t.reference_max_p : '',
      unit: t.unit || '',
      show_in_report: t.show_in_report ? 1 : 0,
      sort_order: t.sort_order ?? 999,
      instrument_test_code: mapObj ? mapObj.instrument_test_code : '',
      simrs_code: simrsCodesStr,
      port: selected ? selected.port : ''
    });
    setShowMapForm(true);
    // Scroll ke form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteMapping = async (mapObj, simrsMapObj) => {
    const res = await Swal.fire({ title: 'Hapus Mapping?', text: 'Hanya mapping yang dihapus, parameter LIS tetap ada.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus Mapping', confirmButtonColor: '#d33', cancelButtonText: 'Batal' });
    if (!res.isConfirmed) return;

    try {
       if (mapObj) await api.instruments.deleteMap(mapObj.id);
       if (simrsMapObj) await api.mapping.remove(simrsMapObj.id);
       reloadMaps();
       Swal.fire('Terhapus!', 'Mapping telah dikosongkan.', 'success');
    } catch (err) {
       Swal.fire('Gagal', err.message, 'error');
    }
  };

  const toggleVisibility = async (t) => {
    try {
      await api.tests.setVisibility(t.id, !t.show_in_report);
      const newTests = await api.tests.list();
      setTests(newTests);
    } catch (e) {
      Swal.fire('Gagal', e.message, 'error');
    }
  };

  const handleSortOrderChange = async (testId, newOrder) => {
    const val = Number(newOrder);
    setTests(prev => prev.map(t => t.id === testId ? { ...t, sort_order: val } : t));
    try {
      await api.tests.setSortOrder(testId, val);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const listCopy = [...filteredTests];
    const [moved] = listCopy.splice(draggedIndex, 1);
    listCopy.splice(dropIndex, 0, moved);

    const reorderedList = listCopy.map((item, idx) => ({
      id: item.id,
      sort_order: idx + 1
    }));

    const orderMap = new Map(reorderedList.map(o => [o.id, o.sort_order]));
    setTests(prev => prev.map(t => orderMap.has(t.id) ? { ...t, sort_order: orderMap.get(t.id) } : t));
    setDraggedIndex(null);

    try {
      await api.tests.reorder(reorderedList);
    } catch (err) {
      console.error(err);
    }
  };

  const handleMove = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= filteredTests.length) return;
    
    const listCopy = [...filteredTests];
    const [moved] = listCopy.splice(index, 1);
    listCopy.splice(targetIndex, 0, moved);

    const reorderedList = listCopy.map((item, idx) => ({
      id: item.id,
      sort_order: idx + 1
    }));

    const orderMap = new Map(reorderedList.map(o => [o.id, o.sort_order]));
    setTests(prev => prev.map(t => orderMap.has(t.id) ? { ...t, sort_order: orderMap.get(t.id) } : t));

    try {
      await api.tests.reorder(reorderedList);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteInstrument = async (id) => {
    const res = await Swal.fire({ title: 'Yakin ingin menghapus alat ini?', text: 'Data tidak dapat dikembalikan', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus', confirmButtonColor: '#d33', cancelButtonText: 'Batal' });
    if (!res.isConfirmed) return;
    await api.instruments.remove(id);
    if (selected && selected.id === id) setSelected(null);
    load();
    Swal.fire('Terhapus!', 'Alat telah dihapus.', 'success');
  };

  if (!can('instruments.view')) return <p className="error-msg">Akses ditolak</p>;

  const filteredTests = tests.filter(t => {
     if (!searchTerm.trim()) return true;
     const q = searchTerm.toLowerCase();
     const mapObj = maps.find(m => m.test_id === t.id);
     const simrsMapObj = simrsMaps.find(sm => sm.mapping_type === 'test' && sm.lis_field === t.code);
     return (
       (t.code || '').toLowerCase().includes(q) ||
       (t.name || '').toLowerCase().includes(q) ||
       (mapObj?.instrument_test_code || '').toLowerCase().includes(q) ||
       (simrsMapObj?.simrs_field || '').toLowerCase().includes(q)
     );
  }).sort((a, b) => {
     const orderA = a.sort_order ?? 999;
     const orderB = b.sort_order ?? 999;
     if (orderA !== orderB) return orderA - orderB;
     return a.code.localeCompare(b.code);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Alat Laboratorium</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {can('instruments.manage') && (
            <button type="button" className="secondary" title="Terapkan perubahan port/alat tanpa restart backend" onClick={async () => {
              try { const out = await api.instruments.reload(); Swal.fire('Listener dimuat ulang', `Alat aktif: ${out.active}. Port listener kini sesuai konfigurasi terbaru.`, 'success'); }
              catch (e) { Swal.fire('Gagal', e.message, 'error'); }
            }}>🔁 Reload Listener</button>
          )}
          {can('instruments.manage') && !showForm && !selected && (
            <button onClick={() => setShowForm(true)}>+ Tambah Alat</button>
          )}
        </div>
      </div>
      <p className="page-desc" style={{ marginTop: '-0.5rem' }}>
        <strong>Mapping kode Menggunakan Auto Mapping, Hanya Kirim alat di GeuLIS otomatis termapping oleh SYSTEM (JANGAN LUPA DAFTARKAN ALAT NYA DULU)</strong>
      </p>

      {can('instruments.manage') && showForm && (
        <form className="card" onSubmit={create} style={{ marginBottom: '1.25rem' }}>
          <h2 className="section-title">Tambah Alat</h2>
          <div className="form-grid">
            <div className="form-group"><label>Kode</label><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="form-group"><label>Nama</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Produsen</label><input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></div>
            <div className="form-group"><label>Model</label><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
            <div className="form-group">
              <label>Protokol data</label>
              <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })}>
                <option value="astm">ASTM</option>
                <option value="hl7">HL7</option>
                <option value="json">JSON</option>
                <option value="xml">XML</option>
              </select>
            </div>
            <div className="form-group">
              <label>Arah koneksi</label>
              <select value={form.conn_mode} onChange={(e) => setForm({ ...form, conn_mode: e.target.value })}>
                <option value="server">Alat menghubungi LIS</option>
                <option value="client">LIS menghubungi alat</option>
              </select>
            </div>
            {form.conn_mode === 'client' && (
              <div className="form-group">
                <label>Alamat IP alat</label>
                <input
                  required
                  placeholder="mis. 192.168.1.201"
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                />
              </div>
            )}
            <div className="form-group"><label>Port TCP</label><input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} /></div>
          </div>
          {/* Mindray BC-3600 dan BC-11 adalah TCP server: alat yang mendengarkan,
              LIS yang menghubungi. Alat ASTM seperti Sysmex justru sebaliknya. */}
          <p className="protocol-hint">
            {form.conn_mode === 'client'
              ? 'LIS akan menyambung ke alamat alat dan menyambung ulang sendiri bila putus. Dipakai untuk Mindray BC-3600, BC-11, BC-30s.'
              : 'LIS mendengarkan di port ini dan menunggu alat menghubungi. Dipakai untuk alat ASTM seperti Sysmex.'}
          </p>
          <p className="protocol-hint">{PROTOCOL_HELP[form.protocol]}</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="submit">Simpan</button>
            <button type="button" className="secondary" onClick={() => { setShowForm(false); setForm({ code: '', name: '', manufacturer: '', model: '', protocol: 'astm', conn_mode: 'server', host: '', port: 5000, is_active: 1 }); }}>Batal</button>
          </div>
          <p className="page-desc" style={{ marginTop: '0.75rem' }}>Restart backend setelah ubah port/protokol.</p>
        </form>
      )}

      {!selected ? (
        <>
          <div className="card">
            <h2 className="section-title">Daftar Alat</h2>
          <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Kode</th><th>Nama</th><th>Port</th><th>Protokol</th><th>Terakhir</th><th></th></tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id}>
                  <td>{i.code}</td>
                  <td>{i.name}</td>
                  <td>{i.port}</td>
                  <td><span className="badge processing">{PROTOCOL_LABELS[i.protocol] || i.protocol}</span></td>
                  <td>{i.last_connected ? new Date(i.last_connected).toLocaleString('id-ID') : '—'}</td>
                  <td>
                    <button type="button" className="secondary btn-sm" onClick={() => openDetail(i)}>Mapping</button>
                    {can('instruments.manage') && (
                      <button type="button" className="danger btn-sm" onClick={() => deleteInstrument(i.id)} style={{ marginLeft: '0.5rem' }}>Hapus</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </div>

          <div className="card" style={{ marginTop: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 className="section-title" style={{ margin: 0 }}>Log pesan alat</h2>
              <button type="button" className="btn-sm secondary" onClick={() => api.instruments.logs().then(setLogs)}>🔄 Refresh Log</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Waktu</th><th>Alat</th><th>Status</th><th>Preview</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.created_at).toLocaleString('id-ID')}</td>
                    <td>{l.instrument_name || '—'}</td>
                    <td><span className={`badge ${l.parsed_status}`}>{l.parsed_status}</span></td>
                    <td className="log-preview">{(l.raw_data || '').slice(0, 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 className="section-title" style={{ margin: 0 }}>Parameter & Mapping: {selected.name}</h2>
            <div>
              <button type="button" className="secondary btn-sm" onClick={() => { setSelected(null); setShowMapForm(false); }}>← Kembali</button>
            </div>
          </div>
          <p className="protocol-hint" style={{ marginTop: 0 }}>
            Protokol: <strong>{PROTOCOL_LABELS[selected.protocol]}</strong> — {PROTOCOL_HELP[selected.protocol] || PROTOCOL_HELP.astm}
            <span className="badge completed" style={{ marginLeft: '0.75rem', background: '#059669', color: '#fff', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>⚡ Auto-Mapping Aktif</span>
          </p>

          {showMapForm && (
            <form onSubmit={saveParameterMapping} style={{ marginBottom: '1.5rem', padding: '1.25rem', background: 'var(--surface2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 600 }}>{mapForm.test_id ? 'Edit Parameter LIS & Mapping' : 'Tambah Parameter LIS & Mapping'}</h3>
              
              <div className="form-grid" style={{ marginBottom: '1rem' }}>
                <div className="form-group"><label>Kode Tes (LIS)</label><input required value={mapForm.test_code} onChange={(e) => setMapForm({ ...mapForm, test_code: e.target.value })} placeholder="Cth: WBC" /></div>
                <div className="form-group"><label>Nama Tes (LIS)</label><input required value={mapForm.test_name} onChange={(e) => setMapForm({ ...mapForm, test_name: e.target.value })} placeholder="Cth: Leukosit" /></div>
                
                <div className="form-group"><label>Rujukan Minimal (umum)</label><input type="number" step="any" value={mapForm.reference_min} onChange={(e) => setMapForm({ ...mapForm, reference_min: e.target.value })} placeholder="Kosongkan jika tdk ada" /></div>
                <div className="form-group"><label>Rujukan Maksimal (umum)</label><input type="number" step="any" value={mapForm.reference_max} onChange={(e) => setMapForm({ ...mapForm, reference_max: e.target.value })} placeholder="Kosongkan jika tdk ada" /></div>
                <div className="form-group"><label>Rujukan Min (Laki-laki)</label><input type="number" step="any" value={mapForm.reference_min_l} onChange={(e) => setMapForm({ ...mapForm, reference_min_l: e.target.value })} placeholder="opsional" /></div>
                <div className="form-group"><label>Rujukan Max (Laki-laki)</label><input type="number" step="any" value={mapForm.reference_max_l} onChange={(e) => setMapForm({ ...mapForm, reference_max_l: e.target.value })} placeholder="opsional" /></div>
                <div className="form-group"><label>Rujukan Min (Perempuan)</label><input type="number" step="any" value={mapForm.reference_min_p} onChange={(e) => setMapForm({ ...mapForm, reference_min_p: e.target.value })} placeholder="opsional" /></div>
                <div className="form-group"><label>Rujukan Max (Perempuan)</label><input type="number" step="any" value={mapForm.reference_max_p} onChange={(e) => setMapForm({ ...mapForm, reference_max_p: e.target.value })} placeholder="opsional" /></div>
                <div className="form-group"><label>Satuan</label><input value={mapForm.unit} onChange={(e) => setMapForm({ ...mapForm, unit: e.target.value })} placeholder="Cth: 10^3/uL" /></div>
                <div className="form-group"><label>Urutan Tampil</label><input type="number" value={mapForm.sort_order} onChange={(e) => setMapForm({ ...mapForm, sort_order: e.target.value })} placeholder="Cth: 1, 2, 3..." /></div>
                <div className="form-group">
                  <label>Tampil di Hasil</label>
                  <select value={mapForm.show_in_report} onChange={(e) => setMapForm({ ...mapForm, show_in_report: Number(e.target.value) })}>
                    <option value={1}>Nyalakan (Tampil)</option>
                    <option value={0}>Matikan (Sembunyi)</option>
                  </select>
                </div>
              </div>

              <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '1.5rem 0' }} />
              
              <div className="form-grid">
                <div className="form-group"><label>Kode Alat ({selected.name})</label><input value={mapForm.instrument_test_code} onChange={(e) => setMapForm({ ...mapForm, instrument_test_code: e.target.value })} placeholder="Cth: WBC" /></div>
                <div className="form-group"><label>Port Alat</label><input type="number" value={mapForm.port !== '' ? mapForm.port : selected.port} onChange={(e) => setMapForm({ ...mapForm, port: e.target.value })} placeholder="Cth: 5000" /></div>
                <div className="form-group"><label>Kode Lab SIMRS (Bisa lebih dari 1, pisahkan koma)</label><input value={mapForm.simrs_code} onChange={(e) => setMapForm({ ...mapForm, simrs_code: e.target.value })} placeholder="Cth: 3962, 4000" /></div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn-sm">Simpan</button>
                <button type="button" className="secondary btn-sm" onClick={() => { setShowMapForm(false); setMapForm(initialMapForm); }}>Batal</button>
              </div>
            </form>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', marginTop: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ position: 'relative', width: '320px' }}>
              <input 
                type="text" 
                placeholder="🔍 Cari Kode / Nama Parameter..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                style={{ width: '100%', padding: '0.5rem 0.75rem' }}
              />
            </div>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Menampilkan: {filteredTests.length} Parameter</span>
          </div>

            <div style={{ overflowX: 'auto' }}>
            <table style={{ marginBottom: '1rem', whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  <th style={{ width: '100px', textAlign: 'center' }}>Geser / Urutan</th>
                  <th>Kode Tes</th>
                  <th>Nama Tes</th>
                  <th>Ruj. Min</th>
                  <th>Ruj. Max</th>
                  <th>Satuan</th>
                  <th>Kode Alat</th>
                  <th>Port Alat</th>
                  <th>Kode SIMRS</th>
                  <th>Tampil di Hasil</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredTests.map((t, idx) => {
                  const mapObj = maps.find(m => m.test_id === t.id);
                  const simrsMapObjs = simrsMaps.filter(sm => sm.mapping_type === 'test' && sm.lis_field === t.code);
                  const simrsDisplay = simrsMapObjs.length ? simrsMapObjs.map(s => s.simrs_field).join(', ') : '—';

                  return (
                    <tr 
                      key={t.id}
                      draggable={can('instruments.manage')}
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, idx)}
                      style={{
                        cursor: can('instruments.manage') ? 'grab' : 'default',
                        background: draggedIndex === idx ? 'var(--surface2)' : 'transparent',
                        opacity: draggedIndex === idx ? 0.5 : 1,
                        transition: 'background 0.15s'
                      }}
                    >
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{ cursor: 'grab', marginRight: '0.4rem', color: 'var(--muted)', fontSize: '1.1rem' }} title="Tarik / geser untuk mengubah urutan">☰</span>
                        <span className="badge" style={{ background: 'var(--surface2)', padding: '0.2rem 0.5rem', fontWeight: 600 }}>{idx + 1}</span>
                        {can('instruments.manage') && (
                          <span style={{ marginLeft: '0.4rem', display: 'inline-flex', gap: '0.1rem' }}>
                            <button type="button" className="secondary btn-sm" onClick={() => handleMove(idx, -1)} disabled={idx === 0} style={{ padding: '0.1rem 0.35rem', fontSize: '0.7rem' }} title="Naikkan">▲</button>
                            <button type="button" className="secondary btn-sm" onClick={() => handleMove(idx, 1)} disabled={idx === filteredTests.length - 1} style={{ padding: '0.1rem 0.35rem', fontSize: '0.7rem' }} title="Turunkan">▼</button>
                          </span>
                        )}
                      </td>
                      <td><code>{t.code}</code></td>
                      <td>{t.name}</td>
                      <td>{t.reference_min != null ? t.reference_min : '—'}</td>
                      <td>{t.reference_max != null ? t.reference_max : '—'}</td>
                      <td>{t.unit || '—'}</td>
                      <td>{mapObj ? <code>{mapObj.instrument_test_code}</code> : <span style={{color: 'var(--danger)'}}>Belum map</span>}</td>
                      <td>{mapObj ? selected.port : '—'}</td>
                      <td>{simrsMapObjs.length ? <code>{simrsDisplay}</code> : '—'}</td>
                      <td>
                        <span className={`badge ${t.show_in_report ? 'completed' : 'pending'}`}>
                          {t.show_in_report ? 'Ya' : 'Sembunyi'}
                        </span>
                      </td>
                      <td>
                        {can('instruments.manage') && (
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button type="button" className="secondary btn-sm" onClick={() => toggleVisibility(t)} style={{ background: t.show_in_report ? '#ef4444' : '#10b981', color: '#fff', borderColor: 'transparent' }} title="Atur agar nilai dari mesin tidak muncul di cetakan/PDF hasil">
                              {t.show_in_report ? 'Matikan' : 'Nyalakan'}
                            </button>
                            <button type="button" className="secondary btn-sm" onClick={() => handleEdit(t, mapObj)}>Edit</button>
                            {(mapObj || simrsMapObjs.length > 0) && (
                              <button type="button" className="danger btn-sm" onClick={() => handleDeleteMapping(mapObj, simrsMapObjs[0])}>Hapus</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
      )}
    </div>
  );
}

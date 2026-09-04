/**
 * Parser pesan alat lab per protokol.
 * Mapping kode tes (instrument_test_map) sama untuk semua protokol;
 * yang beda hanya format pesan masuk.
 */

function normalizeResults(results) {
  return (results || [])
    .filter((r) => r.test_code && r.value != null && r.value !== '')
    .map((r) => ({
      test_code: String(r.test_code).trim(),
      value: String(r.value).trim(),
      unit: r.unit ? String(r.unit).trim() : undefined,
    }));
}

/** ASTM E1381/E1394 sederhana — record P/O/R pipe-delimited */
export function parseAstm(raw) {
  // Alat tertentu seperti Sysmex XN hanya mengirim \r sebagai pemisah baris, bukan \n
  const lines = raw.split(/\r\n|\n|\r/).filter((l) => l.trim());
  const results = [];
  let specimenId = null;   // O-3, isi barcode tabung
  let patientRefId = null; // P-4, nomor pasien
  let queryBarcode = null;
  let patientInfo = {};

  for (const line of lines) {
    const parts = line.split('|').map((p) => p.trim());
    const rec = parts[0];
    
    if (rec === 'Q') {
      const qInfo = parts[2] || '';
      // qInfo biasanya berisi ^077071 atau hanya 077071
      queryBarcode = qInfo.split('^').pop()?.trim() || parts[1];
    }
    
    if (rec === 'P') {
      const pId = (parts[4] || parts[3] || parts[2] || '').split('^')[0]?.trim();
      // P-4 adalah nomor pasien, BUKAN nomor spesimen. Keduanya sempat
      // tertukar di sini: karena rekaman P selalu datang sebelum O, nomor
      // spesimen di O-3 — yang justru dicetak di barcode tabung — tidak pernah
      // terpakai. Disimpan terpisah dan dipilih di akhir.
      if (pId) patientRefId = pId;
      if (parts[5]) {
        let name = parts[5].replace(/\^/g, ' ').trim();
        patientInfo.name = name;
      }
      if (parts[7]) {
        let d = parts[7];
        if (d.length >= 8) patientInfo.dob = `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
      }
      if (parts[8]) {
        patientInfo.gender = (parts[8].toUpperCase() === 'F' || parts[8].toUpperCase() === 'W') ? 'P' : 'L';
      }
    }
    if (rec === 'O') {
      // O-3 = Specimen ID menurut ASTM E1394, yaitu isi barcode tabung.
      const rawOid = parts[2] || parts[3];
      if (rawOid && rawOid.trim() !== '') {
        const cleanOid = rawOid.split('^').filter(x => x.trim() !== '' && x.trim() !== 'M' && x.trim() !== 'F').pop()?.trim();
        if (cleanOid && !specimenId) specimenId = cleanOid;
      }
    }
    if (rec === 'R' && parts[2]) {
      // Sysmex often sends test code as ^^^^WBC^1. We want to extract "WBC".
      let code = parts[2];
      if (code.includes('^')) {
        const sub = code.split('^').filter(x => x.trim() !== '' && !x.match(/^\d+$/));
        if (sub.length > 0) code = sub[0];
      }
      results.push({ test_code: code, value: parts[3], unit: parts[4] });
    }
  }

  // Nomor spesimen didahulukan karena itulah yang dicocokkan ke order lab.
  // Nomor pasien tetap dibawa sebagai cadangan: sebagian alat hanya mengisi
  // salah satunya, dan di banyak rumah sakit nomor rekam medis dipakai
  // sekaligus sebagai identitas sampel.
  const sampleId = specimenId || patientRefId || null;

  return {
    sampleId,
    specimenId,
    patientRefId,
    queryBarcode,
    patientInfo,
    results: normalizeResults(results),
  };
}

/**
 * Apakah OBX-3 ini benar-benar parameter hasil pemeriksaan?
 *
 * Mindray BC-3600 mengirim puluhan OBX per sampel yang BUKAN hasil: umur pasien,
 * remark, penanda alarm, dan terutama metadata histogram (garis diskriminator,
 * panjang data biner) yang bertipe NM sehingga lolos penyaringan tipe nilai.
 * Lihat manual BC-3600 lampiran D.7.5.
 *
 * Aturan atas OBX-3 berbentuk <kode>^<nama>^<sistem>:
 * - sistem 99MRC: hanya kode 10000-10030 yang parameter hasil (LIC, PCT, GRAN-X/Y,
 *   PLCC, PLCR, MID#, GRAN#, MID%, GRAN%, dsb). Kode 01xxx/05xxx/08xxx/12xxx
 *   adalah informasi lain; 15xxx dan 152xx adalah histogram & scattergram.
 * - LOINC 30525-0 adalah umur pasien, bukan hasil.
 * - selebihnya diterima (kode LOINC parameter hematologi).
 */
function isResultCode(rawId) {
  const [code = '', , system = ''] = String(rawId).split('^').map((x) => x.trim());
  if (code === '30525-0') return false;
  if (system.toUpperCase() === '99MRC') {
    const n = Number(code);
    return Number.isInteger(n) && n >= 10000 && n <= 10030;
  }
  return true;
}

/** HL7 v2 — segment PID (pasien/order), OBX (hasil) */
export function parseHl7(raw) {
  const lines = raw.split(/\r\n|\n|\r/).filter((l) => l.includes('|'));
  const results = [];
  let sampleId = null;
  let patientInfo = {};
  // Data QC juga ditransmisikan lewat jalur yang sama. Tanpa dikenali, hasil
  // kontrol akan tersimpan sebagai hasil pasien. Penanda: MSH-11 bukan 'P',
  // atau OBR-4 berkode 00003 (LJ QCR). Lihat manual D.7.4 dan D.7.5.
  let isQc = false;
  let isOrderQuery = false;
  let orderBarcode = null;
  let controlId = '1';
  let processingId = 'P';

  for (const line of lines) {
    const parts = line.split('|');
    const seg = parts[0]?.replace(/^[\x0B\s]+/, '').trim();
    if (seg === 'MSH') {
      controlId = (parts[9] || '').trim() || controlId;
      processingId = (parts[10] || '').trim().toUpperCase() || processingId;
      if (processingId && processingId !== 'P') isQc = true;
      // ORM^O01 = alat meminta worklist, bukan mengirim hasil
      if ((parts[8] || '').trim().toUpperCase().startsWith('ORM')) isOrderQuery = true;
    }
    // ORC-1 'RF' = re-fill order request; nomor sampel ada di ORC-3
    if (seg === 'ORC' && (parts[1] || '').trim().toUpperCase() === 'RF') {
      orderBarcode = (parts[3] || '').split('^')[0].trim() || orderBarcode;
    }
    if (seg === 'OBR' && (parts[4] || '').startsWith('00003')) isQc = true;
    if (seg === 'PID') {
      sampleId = parts[3]?.split('^')[0] || parts[2] || sampleId;
      if (parts[5]) patientInfo.name = parts[5].replace(/\^/g, ' ').trim();
      if (parts[7]) {
        let d = parts[7];
        if (d.length >= 8) patientInfo.dob = `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
      }
      if (parts[8]) patientInfo.gender = (parts[8].toUpperCase() === 'F') ? 'P' : 'L';
    }
    if (seg === 'OBR') {
      sampleId = parts[2] || parts[3] || sampleId;
    }
    if (seg === 'OBX' && parts[3]) {
      // OBX-2 = tipe nilai. Alat seperti Mindray BC-3600 mengirim segmen non-hasil
      // (Take Mode, Blood Mode, dsb) bertipe IS/TX/FT — jangan diperlakukan sebagai
      // tes. ED = encapsulated data (histogram base64/bitmap), jangan pernah
      // disimpan sebagai nilai hasil.
      const valueType = (parts[2] || '').trim().toUpperCase();
      if (['IS', 'TX', 'FT', 'ED'].includes(valueType)) continue;
      if (!isResultCode(parts[3])) continue;

      // OBX-3 sering berbentuk <kode>^<nama>^<sistem>, mis. 6690-2^WBC^LN.
      // Utamakan nama yang terbaca manusia (WBC) daripada kode LOINC (6690-2).
      const idParts = parts[3].split('^').map((x) => x.trim());
      const readable = idParts.find(
        (x) => /^[A-Za-z][A-Za-z0-9%#/.\-]*$/.test(x) && !/^(LN|99MRC|MRC)$/i.test(x)
      );
      const code = readable || idParts[0] || parts[3];
      const value = parts[5];
      const unit = parts[6]?.split('^')[0];
      if (code && value) results.push({ test_code: code, value, unit });
    }
  }

  // Hasil QC dipisahkan ke qcResults, bukan dibuang. `results` sengaja tetap
  // kosong untuk QC supaya pemanggil lama tidak keliru menyimpannya sebagai
  // hasil pasien.
  const semua = normalizeResults(results);
  return {
    sampleId, patientInfo, isQc, isOrderQuery, orderBarcode, controlId, processingId,
    results: isQc ? [] : semua,
    qcResults: isQc ? semua : [],
  };
}

/** JSON — { "sampleId": "ORD001", "results": [{ "test_code", "value", "unit" }] } */
export function parseJson(raw) {
  const data = JSON.parse(raw.trim());
  const sampleId = data.sampleId || data.sample_id || data.orderNo || data.order_no || data.barcode;
  const patientInfo = data.patientInfo || {};
  const list = data.results || data.tests || data.items || [];
  const results = list.map((r) => ({
    test_code: r.test_code || r.code || r.testCode,
    value: r.value ?? r.result,
    unit: r.unit,
  }));
  return { sampleId, patientInfo, results: normalizeResults(results) };
}

/** XML sederhana */
export function parseXml(raw) {
  const sampleMatch = raw.match(/<(?:sample|sampleId|orderNo|order_no|barcode)>([^<]+)</i);
  const sampleId = sampleMatch?.[1]?.trim() || null;
  const results = [];
  const itemRe = /<item[^>]*\s+code=["']([^"']+)["'][^>]*\s+value=["']([^"']+)["'][^>]*\/?>/gi;
  let m;
  while ((m = itemRe.exec(raw)) !== null) {
    results.push({ test_code: m[1], value: m[2] });
  }
  const blockRe = /<result[^>]*>[\s\S]*?<code>([^<]+)<\/code>[\s\S]*?<value>([^<]+)<\/value>/gi;
  while ((m = blockRe.exec(raw)) !== null) {
    results.push({ test_code: m[1], value: m[2] });
  }
  return { sampleId, patientInfo: {}, results: normalizeResults(results) };
}

export function parseInstrumentMessage(protocol, raw) {
  const p = (protocol || 'astm').toLowerCase();
  const trimmed = raw.trim();
  if (!trimmed) return { sampleId: null, patientInfo: {}, results: [] };

  switch (p) {
    case 'hl7':
      return parseHl7(trimmed);
    case 'json':
    case 'tcp_json':
      return parseJson(trimmed);
    case 'xml':
      return parseXml(trimmed);
    case 'astm':
    default:
      return parseAstm(trimmed);
  }
}

export function buildAstmOrder(barcode, tests) {
  // tes: array string kode, misal ['WBC', 'HGB']
  if (!tests || tests.length === 0) return '';
  const testStr = tests.map((t, i) => (i === 0 ? `^^^${t}` : `\\^^^^${t}`)).join('');
  let msg = `H|\\^&|||LIS||||||||E1394-97\r`;
  msg += `P|1\r`;
  msg += `O|1|${barcode}||${testStr}|||||||N||||||||||||||Q\r`;
  msg += `L|1|N\r`;
  return msg;
}

export const PROTOCOL_HELP = {
  astm: 'Baris P|…|order, R|order|kode|nilai|satuan (pipe, akhiri EOT \\x04 atau newline)',
  hl7: 'Segment PID/OBR (order di field 3), OBX untuk hasil (kode di OBX-3, nilai OBX-5)',
  json: '{"sampleId":"ORD001","results":[{"test_code":"HGB","value":"14.2","unit":"g/dL"}]}',
  xml: '<sample>ORD001</sample><item code="HGB" value="14.2"/> atau <result><code>HGB</code><value>14.2</value></result>',
};

/**
 * Balasan ACK^R01 HL7 yang sah, sesuai manual BC-3600 D.7.4:
 *
 *   MSH|^~\&|LIS||||<waktu>||ACK^R01|1|<P atau Q>|2.3.1||||||UNICODE
 *   MSA|<AA|AE|AR>|<MSH-10 pesan yang diterima>
 *
 * MSA-2 WAJIB sama dengan MSH-10 pesan masuk supaya alat tahu balasan ini
 * untuk pesan yang mana. Dibungkus MLLP (0x0B ... 0x1C 0x0D).
 * Diperlukan bila "ACK synchronous transmission" di alat dinyalakan.
 */
export function buildHl7Ack(controlId = '1', processingId = 'P', code = 'AA') {
  const t = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const stamp = `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`;
  const msg =
    `MSH|^~\\&|LIS||||${stamp}||ACK^R01|1|${processingId}|2.3.1||||||UNICODE\r` +
    `MSA|${code}|${controlId}\r`;
  return `\x0B${msg}\x1C\r`;
}

/**
 * Balasan host query ASTM ketika barcode tidak punya order di LIS.
 * Terminator 'I' = "no information available from the last query" (ASTM E1394).
 * Tanpa ini alat menunggu sampai timeout dan operator tidak tahu penyebabnya.
 */
export function buildAstmNoOrder() {
  return `H|\\^&|||LIS||||||||E1394-97\rP|1\rL|1|I\r`;
}

/**
 * Balasan worklist ORR^O02 untuk permintaan ORM^O01 dari alat.
 *
 * Struktur menurut protokol Mindray BC-20s/30s:
 *   MSH | MSA | [ PID | [PV1] ] { ORC | [ OBR | { [OBX] } ] }
 *
 * ORC-1 'AF' = affirm the re-filled order. Nomor sampel diletakkan di ORC-2
 * dan OBR-2 (pada permintaan tadi ia ada di ORC-3).
 *
 * Bila order tidak ditemukan, dibalas MSA|AE tanpa PID/ORC — jangan mengarang
 * identitas pasien, karena alat akan menampilkannya ke petugas.
 */
/**
 * Tanggal lahir ke format Mindray: YYYYMMDD000000.
 *
 * Driver MySQL mengembalikan kolom DATE sebagai objek Date, bukan teks, sehingga
 * memotongnya dengan String(...).slice(0,10) menghasilkan "Wed Feb 04" —
 * tanggal lahir yang tidak terbaca alat. Objek Date maupun teks sama-sama
 * ditangani di sini.
 */
export function tanggalHl7(v) {
  if (!v) return '';
  if (typeof v === 'string') {
    const cocok = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (cocok) return `${cocok[1]}${cocok[2]}${cocok[3]}000000`;
  }
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}000000`;
}

/** Waktu ke format stempel HL7 (YYYYMMDDHHMMSS); kosong bila tidak ada. */
export function stempelHl7(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Balasan worklist ORR^O02.
 *
 * Peta rekaman OBR mengikuti tabel Mindray sendiri di LIS Protocol Manual
 * (bab OBR - Observation Request), yang berbeda dari HL7 baku:
 *
 *   OBR-6  Requested Date/Time        waktu permintaan
 *   OBR-7  Observation Date/Time      waktu pemeriksaan
 *   OBR-8  Observation End Date/Time  **waktu pengambilan sampel** -> "Draw Time"
 *   OBR-14 Specimen Received D/T      **Send D/T** -> "Delivery Time"
 *   OBR-15 Specimen Source            jenis sampel
 *   OBR-16 Ordering Provider          dokter pengirim
 *
 * Perhatikan OBR-8: di HL7 baku itu waktu selesai pemeriksaan, tapi Mindray
 * memakainya sebagai waktu pengambilan sampel. Menaruhnya di OBR-7 seperti
 * kebiasaan umum akan mengisi kotak yang salah di layar alat.
 */
export function buildHl7OrderResponse(controlId = '1', barcode = '', pasien = null, order = null) {
  const stamp = stempelHl7(new Date());
  const msh = `MSH|^~\\&|LIS||||${stamp}||ORR^O02||P|2.3.1||||||UNICODE\r`;

  if (!pasien) {
    return `\x0B${msh}MSA|AE|${controlId}\r\x1C\r`;
  }

  const bersih = (v) => String(v ?? '').replace(/[|^~\\&\r\n]/g, ' ').trim();
  const nama = bersih(pasien.name);
  // Manual Mindray meminta tanggal lahir lengkap sampai detik
  // (contoh: 19830512000000). Dikirim 8 digit saja membuat alat gagal
  // menghitung umur, lalu memakai kelompok rujukan "Neonate" untuk pasien
  // dewasa — kelompok rujukan itu yang menentukan penandaan di layar alat.
  const dob = tanggalHl7(pasien.birth_date);
  const jk = pasien.gender === 'P' ? 'F' : 'M';

  // Kotak "Patient ID" di layar alat dibaca dari PID-3, bukan PID-2 — walaupun
  // tabel di manual menandai PID-3 sebagai void and reserved. Buktinya ada pada
  // pesan yang dikirim alat itu sendiri:
  //
  //   PID|1||^^^^MR||NAILA BUNGA AZ-ZAHRO||20200720000000
  //
  // Alat menaruh nomor pasiennya di PID-3 dengan penanda ^^^^MR, dan namanya di
  // PID-5 komponen PERTAMA. Nomor rekam medis diisikan ke PID-2 sekaligus PID-3
  // supaya benar dibaca alat ini maupun alat lain yang mengikuti tabel manual.
  const noRm = bersih(pasien.medical_record_no) || barcode;
  const ruangan = bersih(pasien.clinician_unit);

  // BC-11 menampilkan OBR-6 sebagai "Draw Time" — terbukti di lapangan: order
  // tanpa collected_at (OBR-8 kosong) tetap memunculkan Draw Time 09:28, persis
  // waktu permintaannya. Manual justru menyebut OBR-8 sebagai waktu pengambilan
  // sampel. Karena itu waktu pengambilan dikirim di KEDUA kolom: OBR-6 supaya
  // benar terbaca alat ini, OBR-8 supaya benar bagi alat yang mengikuti manual.
  // Bila waktu pengambilan belum ada, OBR-6 jatuh ke waktu permintaan agar
  // kotaknya tidak kosong sama sekali.
  const diambil = stempelHl7(order?.collected_at);   // Draw Time
  const diminta = diambil || stempelHl7(order?.requested_at);
  const dikirim = stempelHl7(order?.received_at);    // Delivery Time
  const jenisSampel = bersih(order?.specimen_type);
  const dokter = bersih(order?.clinician_name);

  // OBR dibentuk per-rekaman supaya nomor kolomnya tidak meleset; kolom yang
  // tidak diisi tetap harus ada sebagai pemisah kosong.
  const obr = [
    'OBR', '1', barcode, '', '00001^Automated Count^99MRC', '',
    diminta,        // 6
    '',             // 7  waktu pemeriksaan, diisi alat
    diambil,            // 8  Draw Time
    '', '', '', '', '', // 9-13 (volume, kolektor, kode tindakan, kode bahaya, info klinis)
    dikirim,            // 14 Delivery Time
    jenisSampel,    // 15
    dokter,         // 16
  ].join('|');

  return (
    `\x0B${msh}` +
    `MSA|AA|${controlId}\r` +
    // PID-2 & PID-3 nomor rekam medis, PID-5 nama, PID-7 lahir,
    // PID-8 jenis kelamin, PID-11 ruangan/departemen.
    `PID|1|${noRm}|${noRm}^^^^MR||${nama}||${dob}|${jk}|||${ruangan}\r` +
    `ORC|AF|${barcode}\r` +
    `${obr}\r` +
    `\x1C\r`
  );
}

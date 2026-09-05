import net from 'net';
import pool from '../config/db.js';
import { parseInstrumentMessage, buildAstmOrder, buildAstmNoOrder, buildHl7Ack, buildHl7OrderResponse } from './protocolParsers.js';
import { nilaiHasil } from './flags.js';
import { konteksPasien } from './konteksPasien.js';
import { simpanHasilQc } from './qc.js';
import { hitungDelta } from './deltaCheck.js';

/**
 * Apakah pasien boleh didaftarkan otomatis dari nomor sampel yang tidak dikenal.
 * Mati secara bawaan: pendaftaran otomatis menghasilkan pasien karangan yang
 * memegang hasil pasien asli. Rumah sakit yang memang menginginkannya bisa
 * menyalakan lewat Pengaturan Sistem.
 */
async function pendaftaranOtomatisAktif() {
  const [[row]] = await pool
    .query("SELECT setting_value FROM settings WHERE setting_key = 'auto_register_pasien'")
    .catch(() => [[]]);
  const v = String(row?.setting_value ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'ya';
}

/**
 * Cari pasien dari satu atau beberapa penanda sampel.
 *
 * Alat ASTM bisa mengirim nomor spesimen (barcode tabung) dan nomor pasien
 * sekaligus. Keduanya dicoba berurutan: spesimen dulu karena itu yang terikat
 * ke order, lalu nomor pasien untuk rumah sakit yang memakai nomor rekam medis
 * sebagai identitas sampel.
 */
async function resolvePatient(...penanda) {
  for (const p of penanda.flat().filter(Boolean)) {
    const hasil = await cariPasien(p);
    if (hasil.id) return hasil;
  }
  return { id: null, gender: null };
}

async function cariPasien(sampleId) {
  if (!sampleId) return { id: null, gender: null };
  const [[row]] = await pool.query(
    `SELECT p.id, p.gender FROM patients p
     LEFT JOIN lab_requests lr ON lr.patient_id = p.id
     WHERE p.medical_record_no = ?
        OR p.order_no = ?
        OR lr.request_no = ?
        OR lr.simrs_order_id = ?
     LIMIT 1`,
    [sampleId, sampleId, sampleId, sampleId]
  );
  return { id: row?.id ?? null, gender: row?.gender ?? null };
}

/** Cari request + item aktif untuk pasien+tes (agar hasil terhubung ke order) */
async function findRequestLink(patientId, testId) {
  const [[row]] = await pool.query(
    `SELECT lri.id AS request_item_id, lri.request_id
     FROM lab_request_items lri
     JOIN lab_requests lr ON lr.id = lri.request_id
     WHERE lr.patient_id = ? AND lri.test_id = ?
       AND lr.status <> 'cancelled'
     ORDER BY lr.requested_at DESC LIMIT 1`,
    [patientId, testId]
  );
  return { request_item_id: row?.request_item_id ?? null, request_id: row?.request_id ?? null };
}

async function saveInstrumentResults(instrumentId, protocol, sampleId, results, raw, patientInfo, penandaLain = []) {
  const status = results.length ? 'ok' : 'partial';
  const [[checkInst]] = await pool.query('SELECT id FROM instruments WHERE id = ?', [instrumentId]).catch(() => [[]]);
  const validInstId = checkInst?.id || null;
  if (validInstId) {
    await pool.query(
      'INSERT INTO instrument_logs (instrument_id, direction, raw_data, parsed_status) VALUES (?, ?, ?, ?)',
      [validInstId, 'in', raw, status]
    ).catch(() => {});
    await pool.query('UPDATE instruments SET last_connected = NOW() WHERE id = ?', [validInstId]).catch(() => {});
  }

  let { id: patientId, gender: patientGender } = await resolvePatient(sampleId, penandaLain);

  // Nomor sampel yang tidak cocok dengan pasien mana pun.
  //
  // Dulu di sini pasien baru langsung dibuat bernama "Pasien <nomor sampel>".
  // Itu menghasilkan pasien karangan (121/WASTIAH, 1/muryati) yang memegang
  // hasil milik pasien asli, dan karena pasien itu jadi ada, worklist
  // mengembalikan namanya ke layar alat sehingga tampak sah. Kini hasilnya
  // ditahan untuk dicocokkan petugas. Rumah sakit yang memang menghendaki
  // pendaftaran otomatis bisa menyalakannya lewat pengaturan.
  if (!patientId && sampleId && sampleId !== 'UNKNOWN') {
    if (await pendaftaranOtomatisAktif()) {
      const name = patientInfo?.name || `Pasien ${sampleId}`;
      const dob = patientInfo?.dob || null;
      const gender = patientInfo?.gender || 'L';
      try {
        const [pRes] = await pool.query(
          'INSERT IGNORE INTO patients (medical_record_no, name, birth_date, gender) VALUES (?, ?, ?, ?)',
          [sampleId, name, dob, gender]
        );
        patientGender = gender;
        if (pRes.insertId) {
          patientId = pRes.insertId;
          const reqNo = `REQ-AUTO-${Date.now()}`;
          await pool.query(
            "INSERT INTO lab_requests (request_no, patient_id, status) VALUES (?, ?, 'completed')",
            [reqNo, patientId]
          );
        } else {
          const [[exist]] = await pool.query('SELECT id FROM patients WHERE medical_record_no = ?', [sampleId]);
          patientId = exist?.id;
        }
      } catch (err) {
        console.error('Auto-registration error:', err);
      }
    } else {
      // Alat dengan "Auto Retransmit" akan mengirim ulang sampel yang sama.
      // Baris yang masih menunggu diperbarui, bukan ditumpuk, supaya kotak
      // masuk tidak penuh duplikat dari satu sampel.
      const [[sudahAda]] = await pool.query(
        `SELECT id FROM unmatched_results
          WHERE status = 'pending' AND sample_id = ? AND instrument_id <=> ?
          ORDER BY id DESC LIMIT 1`,
        [sampleId, validInstId]
      ).catch(() => [[]]);

      if (sudahAda) {
        await pool.query(
          `UPDATE unmatched_results
              SET payload = ?, patient_info = ?, raw_message = ?, received_at = NOW()
            WHERE id = ?`,
          [JSON.stringify(results), JSON.stringify(patientInfo || null), raw.slice(0, 60000), sudahAda.id]
        ).catch((e) => console.error('Gagal memperbarui hasil belum cocok:', e.message));
      } else {
        await pool.query(
          `INSERT INTO unmatched_results (instrument_id, sample_id, patient_info, payload, raw_message)
           VALUES (?, ?, ?, ?, ?)`,
          [validInstId, sampleId, JSON.stringify(patientInfo || null), JSON.stringify(results), raw.slice(0, 60000)]
        ).catch((e) => console.error('Gagal menyimpan hasil belum cocok:', e.message));
      }
      console.log(`[Instrument] sampel ${sampleId} tidak cocok dengan order mana pun -> ditahan untuk dicocokkan`);
      // Sengaja BUKAN error: pesannya diterima utuh dan tersimpan, hanya belum
      // punya pemilik. Membalas AE membuat alat mengirim ulang tanpa henti.
      return { saved: 0, unmatched: true, info: `Sampel ${sampleId} ditahan untuk dicocokkan` };
    }
  }

  // 1. Auto-Mapping: Selalu daftarkan kode tes & mapping alat dari pesan masuk
  for (const item of results) {
    if (!item.test_code) continue;
    let testId;
    const [[map]] = await pool.query(
      'SELECT test_id FROM instrument_test_map WHERE instrument_id=? AND instrument_test_code=?',
      [instrumentId, item.test_code]
    );
    
    if (!map) {
      let [[existingTest]] = await pool.query('SELECT id FROM lab_tests WHERE code=?', [item.test_code]);
      if (existingTest) {
         testId = existingTest.id;
      } else {
         try {
           const [testRes] = await pool.query(
             'INSERT INTO lab_tests (code, name, unit) VALUES (?, ?, ?)',
             [item.test_code, item.test_code, item.unit || '']
           );
           testId = testRes.insertId;
         } catch(e) {
           const [[fallback]] = await pool.query('SELECT id FROM lab_tests WHERE code=?', [item.test_code]);
           if (fallback) testId = fallback.id;
           else continue;
         }
      }
      
      try {
        await pool.query(
          'INSERT INTO instrument_test_map (instrument_id, test_id, instrument_test_code) VALUES (?, ?, ?)',
          [instrumentId, testId, item.test_code]
        );
      } catch (e) {}
    }
  }

  if (!patientId) {
    return { saved: 0, error: `Order/pasien tidak ditemukan: ${sampleId}` };
  }

  let saved = 0;
  for (const item of results) {
    let testId;
    const [[map]] = await pool.query(
      'SELECT test_id FROM instrument_test_map WHERE instrument_id=? AND instrument_test_code=?',
      [instrumentId, item.test_code]
    );
    testId = map ? map.test_id : null;
    if (!testId) {
      const [[test]] = await pool.query('SELECT id FROM lab_tests WHERE code=?', [item.test_code]);
      testId = test?.id;
    }
    if (!testId) continue;

    const [[test]] = await pool.query('SELECT * FROM lab_tests WHERE id = ?', [testId]);
    const { flag } = await nilaiHasil(item.value, test, await konteksPasien(patientId));
    const link = await findRequestLink(patientId, testId);
    // Dihitung sebelum baris baru masuk, supaya pembandingnya benar-benar hasil
    // sebelumnya dan bukan hasil ini sendiri.
    const delta = await hitungDelta(patientId, testId, item.value, test?.code, test?.delta_limit_percent);
    await pool.query(
      `INSERT INTO lab_results (patient_id, test_id, request_id, request_item_id, result_value, result_numeric, unit, flag, instrument_id, raw_message, status, delta_percent, delta_flag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'preliminary', ?, ?)`,
      [
        patientId,
        testId,
        link.request_id,
        link.request_item_id,
        item.value,
        parseFloat(item.value) || null,
        item.unit || test?.unit || '',
        flag,
        instrumentId,
        raw.slice(0, 5000),
        delta?.percent ?? null,
        delta?.flag ?? 'none',
      ]
    );
    if (delta?.flag === 'check') {
      console.warn(`[Delta] ${test?.code} pasien ${patientId}: ${delta.sebelumnya} -> ${item.value} (${delta.percent}%) — periksa kemungkinan sampel tertukar`);
    }
    if (link.request_item_id) {
      await pool.query("UPDATE lab_request_items SET status='done' WHERE id=?", [link.request_item_id]).catch(() => {});
    }
    saved++;
  }
  return { saved, protocol };
}

function isMessageComplete(buffer, protocol) {
  const p = (protocol || 'astm').toLowerCase();
  if (p === 'json' || p === 'tcp_json') {
    try {
      JSON.parse(buffer.trim());
      return true;
    } catch {
      return false;
    }
  }
  if (p === 'xml') return buffer.includes('</') && (buffer.includes('<item') || buffer.includes('<result') || buffer.includes('</results>'));
  if (p === 'hl7') return buffer.includes('\x1C') || buffer.includes('OBX|') && buffer.trimEnd().endsWith('\n');
  if (p === 'astm') {
    return buffer.includes('\x04') || buffer.includes('L|1') || (buffer.includes('R|') && (buffer.includes('\n') || buffer.includes('\r')));
  }
  return buffer.includes('\x04') || buffer.includes('\n');
}

const servers = new Map();
const RECONNECT_DELAY_MS = 5000;

/** Chunk yang isinya hanya heartbeat 0x02 (BC-3600 mengirimnya tiap 3 detik) */
function isHeartbeatOnly(str) {
  return str.length > 0 && /^[\x02\r\n]+$/.test(str);
}

/**
 * Pasang penangan data pada satu socket. Dipakai KEDUA arah koneksi:
 * mode 'server' (alat menghubungi LIS) dan mode 'client' (LIS menghubungi alat).
 */
function attachSocket(inst, protocol, socket, isClient = false) {
  let buffer = '';
  
  socket.on('error', (err) => {
    console.error(`[Socket Error - ${inst.code}]`, err.message);
  });
  
  socket.on('data', async (chunk) => {
    const str = chunk.toString();

    // BC-3600 mengirim heartbeat 0x02 tiap 3 detik selama koneksi hidup.
    // Diabaikan total: jangan di-buffer, jangan dicatat — kalau tidak,
    // tabel instrument_logs terisi ~28.800 baris kosong per hari.
    if (isClient && isHeartbeatOnly(str)) return;

    buffer += str;
    
    // Debug logging to see exactly what comes from Sysmex
    import('fs').then(fs => fs.appendFileSync('/tmp/lis_debug.log', `[IN] ${JSON.stringify(str)}\n`));

    // Always log raw incoming message to instrument_logs so it appears in UI immediately
    const [[checkInst]] = await pool.query('SELECT id FROM instruments WHERE id = ?', [inst.id]).catch(() => [[]]);
    const validInstId = checkInst?.id || null;
    if (validInstId && str.trim()) {
      const readableStr = str.replace(/\x05/g, '<ENQ>').replace(/\x06/g, '<ACK>').replace(/\x04/g, '<EOT>').replace(/\x02/g, '<STX>').replace(/\x03/g, '<ETX>');
      await pool.query(
        'INSERT INTO instrument_logs (instrument_id, direction, raw_data, parsed_status) VALUES (?, ?, ?, ?)',
        [validInstId, 'in', readableStr.slice(0, 5000), 'ok']
      ).catch(() => {});
    }

    // Auto-reply ACK for ASTM if ENQ or end of frame is received
    if (protocol === 'astm') {
      if (str.includes('\x05')) {
        socket.write('\x06');
        import('fs').then(fs => fs.appendFileSync('/tmp/lis_debug.log', `[OUT] ACK (ENQ)\n`));
      } else if ((str.includes('\n') || str.includes('\r')) && !str.includes('\x04')) {
        socket.write('\x06');
        import('fs').then(fs => fs.appendFileSync('/tmp/lis_debug.log', `[OUT] ACK (Frame)\n`));
      }
    }

    if (!isMessageComplete(buffer, protocol)) return;

    const raw = buffer.replace(/\x04|\x1C|\x05|\x02|\x03/g, '').trim();
    buffer = '';
    try {
      const { sampleId, specimenId, patientRefId, queryBarcode, patientInfo, results, qcResults, isQc, isOrderQuery, orderBarcode, controlId, processingId } =
        parseInstrumentMessage(protocol, raw);

      // --- WORKLIST HL7: alat meminta identitas pasien untuk satu barcode ---
      // Alat mengirim ORM^O01, LIS menjawab ORR^O02 berisi identitas pasien.
      // Tanpa ini operator harus mengetik nomor sampel manual, dan salah ketik
      // menghasilkan pasien baru alih-alih menempel ke order yang ada.
      if (isOrderQuery) {
        // Waktu pengambilan dan pengiriman sampel ikut dikirim supaya kotak
        // "Draw Time" dan "Delivery Time" di layar alat terisi sendiri.
        // Permintaan terbaru yang belum selesai didahulukan; kalau tidak ada,
        // jatuh ke permintaan terbaru apa pun, agar identitas pasien tetap
        // ketemu walau ordernya sudah lama selesai.
        const [[pasien]] = await pool.query(
          `SELECT p.name, p.birth_date, p.gender, p.medical_record_no,
                  lr.requested_at, lr.collected_at, lr.received_at,
                  lr.specimen_type, lr.clinician_name, lr.clinician_unit
             FROM patients p
             LEFT JOIN lab_requests lr ON lr.patient_id = p.id
            WHERE p.medical_record_no = ? OR p.order_no = ?
               OR lr.request_no = ? OR lr.simrs_order_id = ?
            ORDER BY (lr.status IN ('pending','collected','processing')) DESC,
                     lr.requested_at DESC
            LIMIT 1`,
          [orderBarcode, orderBarcode, orderBarcode, orderBarcode]
        ).catch(() => [[]]);

        const balasan = buildHl7OrderResponse(controlId, orderBarcode || '', pasien || null, pasien || null);
        socket.write(balasan);
        await pool.query(
          'INSERT INTO instrument_logs (instrument_id, direction, raw_data, parsed_status) VALUES (?, ?, ?, ?)',
          [
            inst.id,
            'out',
            pasien
              ? `worklist ${orderBarcode} -> ${pasien.name}`
              : `worklist ${orderBarcode} -> tidak ditemukan`,
            pasien ? 'ok' : 'partial',
          ]
        ).catch(() => {});
        return;
      }

      // Data QC dikirim lewat jalur yang sama dengan hasil pasien. Kalau tidak
      // dihentikan di sini, nomor kontrol akan terdaftar sebagai pasien baru.
      if (isQc) {
        if (protocol === 'hl7') socket.write(buildHl7Ack(controlId, processingId, 'AA'));
        // Dulu data QC dibuang di sini. Sekarang disimpan dan dinilai terhadap
        // mean/SD lot kontrol, karena inilah yang memberi tahu alat melenceng
        // sebelum hasil pasien ikut salah.
        const jumlah = await simpanHasilQc(inst.id, sampleId, qcResults);
        await pool.query(
          'INSERT INTO instrument_logs (instrument_id, direction, raw_data, parsed_status) VALUES (?, ?, ?, ?)',
          [inst.id, 'in', `data QC tersimpan: ${jumlah} parameter (kontrol ${sampleId || '-'})`, jumlah ? 'ok' : 'partial']
        ).catch(() => {});
        return;
      }
      
      // --- BIDIRECTIONAL HOST QUERY ---
      if (queryBarcode && protocol === 'astm') {
        const [[req]] = await pool.query(
          `SELECT lr.id FROM lab_requests lr
           JOIN patients p ON lr.patient_id = p.id
           WHERE p.medical_record_no = ? OR p.order_no = ? OR lr.request_no = ? OR lr.simrs_order_id = ?
           ORDER BY lr.requested_at DESC LIMIT 1`,
          [queryBarcode, queryBarcode, queryBarcode, queryBarcode]
        );
        
        let testsToSend = [];
        if (req) {
          const [mapItems] = await pool.query(
            `SELECT m.instrument_test_code 
             FROM lab_request_items i 
             JOIN instrument_test_map m ON i.test_id = m.test_id 
             WHERE i.request_id = ? AND m.instrument_id = ?`,
            [req.id, inst.id]
          );
          testsToSend = mapItems.map(r => r.instrument_test_code);
        }
        
        // ASTM E1394: terminator 'I' berarti "no information available from the last
        // query". Tanpa balasan ini alat menggantung sampai timeout dan operator
        // tidak tahu bahwa barcodenya memang belum punya order.
        const astmMsg = testsToSend.length
          ? buildAstmOrder(queryBarcode, testsToSend)
          : buildAstmNoOrder();
        if (astmMsg) {
          socket.write(astmMsg);
          import('fs').then(fs => fs.appendFileSync('/tmp/lis_debug.log', `[OUT] QUERY RESP:\n${astmMsg}\n`));
          await pool.query(
            'INSERT INTO instrument_logs (instrument_id, direction, raw_data, parsed_status) VALUES (?, ?, ?, ?)',
            [inst.id, 'out', astmMsg.trim(), 'ok']
          );
        }
        return;
      }
      // --------------------------------

      const sid = sampleId || 'UNKNOWN';
      const out = await saveInstrumentResults(inst.id, protocol, sid, results, raw, patientInfo, [specimenId, patientRefId]);
      let responseMsg = '';
      if (out.error) {
        responseMsg = `NAK|${out.error}\r\n`;
      } else if (out.unmatched) {
        responseMsg = `ACK|0|${protocol}|${out.info}\r\n`;
      } else {
        responseMsg = `ACK|${out.saved}|${protocol}\r\n`;
      }
      
      // HL7 wajib dibalas ACK^R01 yang sah (manual BC-3600 D.7.4), bukan teks biasa —
      // tanpa itu "ACK synchronous transmission" di alat tidak boleh dinyalakan.
      // Alat ASTM seperti Sysmex justru error bila dikirimi teks setelah EOT.
      if (protocol === 'hl7') {
        // Catat yang BENAR-BENAR dikirim, bukan teks NAK/ACK internal.
        responseMsg = `ACK^R01 MSA|${out.error ? 'AE' : 'AA'}|${controlId}` + (out.error ? ` (${out.error})` : '');
        socket.write(buildHl7Ack(controlId, processingId, out.error ? 'AE' : 'AA'));
      } else if (protocol !== 'astm') {
        socket.write(responseMsg);
      }

      // Safely log output
      const [[checkInst]] = await pool.query('SELECT id FROM instruments WHERE id = ?', [inst.id]).catch(() => [[]]);
      const validInstId = checkInst?.id || null;

      if (validInstId) {
        await pool.query(
          'INSERT INTO instrument_logs (instrument_id, direction, raw_data, parsed_status) VALUES (?, ?, ?, ?)',
          [validInstId, 'out', responseMsg.trim(), 'ok']
        ).catch(err => console.error("Log error:", err.message));
      }
    } catch (e) {
      const [[checkInst]] = await pool.query('SELECT id FROM instruments WHERE id = ?', [inst.id]).catch(() => [[]]);
      const validInstId = checkInst?.id || null;

      if (validInstId) {
        await pool.query(
          'INSERT INTO instrument_logs (instrument_id, direction, raw_data, parsed_status, error_message) VALUES (?, ?, ?, ?, ?)',
          [validInstId, 'in', raw.slice(0, 10000), 'error', e.message]
        ).catch(err => console.error("Log error:", err.message));
      }

      const errMsg = `NAK|${e.message}\r\n`;
      if (protocol !== 'astm') {
        socket.write(errMsg);
      }

      if (validInstId) {
        await pool.query(
          'INSERT INTO instrument_logs (instrument_id, direction, raw_data, parsed_status) VALUES (?, ?, ?, ?)',
          [validInstId, 'out', errMsg.trim(), 'error']
        ).catch(err => console.error("Log error:", err.message));
      }
    }
    
    // Tutup koneksi dengan rapi setelah menerima EOT
    if (protocol === 'astm' && str.includes('\x04')) {
       socket.end();
    }
  });
}

/**
 * Mode client: LIS yang menghubungi alat, bukan sebaliknya.
 * Mindray BC-3600 bekerja begini — alat mendengarkan di portnya sendiri dan
 * mengirim heartbeat 0x02 tiap 3 detik setelah koneksi terbentuk (manual D.3).
 * Menyambung ulang otomatis bila koneksi putus.
 */
function startClientConnector(inst, protocol) {
  const host = inst.host && inst.host !== '0.0.0.0' ? inst.host : null;
  const port = inst.port || 5000;
  if (!host) {
    console.warn(`[Instrument] ${inst.code} mode client tapi host belum diisi — dilewati`);
    return null;
  }

  const entry = { mode: 'client', host, port, socket: null, timer: null, stopped: false };

  const connect = () => {
    if (entry.stopped) return;
    const socket = net.createConnection({ host, port }, () => {
      console.log(`[Instrument] ${inst.code} (${protocol}) client -> ${host}:${port} terhubung`);
      entry.galatTerakhir = null;
      entry.galatBerturut = 0;
      pool
        .query(
          'INSERT INTO instrument_logs (instrument_id, direction, raw_data, parsed_status) VALUES (?, ?, ?, ?)',
          [inst.id, 'out', `koneksi ke ${host}:${port} terbentuk`, 'ok']
        )
        .catch(() => {});
      pool.query('UPDATE instruments SET last_connected = NOW() WHERE id = ?', [inst.id]).catch(() => {});
    });

    entry.socket = socket;
    attachSocket(inst, protocol, socket, true);

    let retried = false;
    const retry = () => {
      if (entry.stopped || retried) return;
      retried = true;
      socket.destroy();
      entry.timer = setTimeout(connect, RECONNECT_DELAY_MS);
    };
    socket.on('close', retry);
    socket.on('error', (err) => {
      // Alat yang sedang tidak dipakai memang mati — di salah satu lokasi pemasangan dua
      // BC-3600 dipakai bergantian tiap hari. Tanpa penahan ini, percobaan
      // sambung tiap 5 detik menghasilkan belasan ribu baris log per hari dan
      // menenggelamkan kejadian yang benar-benar perlu dibaca. Kegagalan
      // pertama tetap dicatat, berikutnya diringkas sekali per 10 menit.
      const sekarang = Date.now();
      const jedaCukup = !entry.galatTerakhir || sekarang - entry.galatTerakhir > 600000;
      if (jedaCukup) {
        const diam = entry.galatBerturut
          ? ` (${entry.galatBerturut} percobaan sejak pesan terakhir)`
          : '';
        console.warn(`[Instrument] ${inst.code} koneksi ${host}:${port} gagal: ${err.message}${diam}`);
        entry.galatTerakhir = sekarang;
        entry.galatBerturut = 0;
      } else {
        entry.galatBerturut = (entry.galatBerturut || 0) + 1;
      }
      retry();
    });
  };

  connect();
  return entry;
}

/** Kunci identitas listener, supaya reload tahu kapan harus dibangun ulang */
function keyOf(inst) {
  return `${inst.conn_mode || 'server'}:${inst.host || '0.0.0.0'}:${inst.port || 5000}`;
}

export async function startInstrumentListeners() {
  if (process.env.INSTRUMENT_LISTENER_ENABLED === 'false') return;

  const [instruments] = await pool.query('SELECT * FROM instruments WHERE is_active = 1');
  for (const inst of instruments) {
    if (servers.has(inst.id)) continue;
    const port = inst.port || 5000;
    const protocol = inst.protocol || 'astm';
    const mode = inst.conn_mode || 'server';

    if (mode === 'client') {
      const entry = startClientConnector(inst, protocol);
      if (entry) servers.set(inst.id, { ...entry, key: keyOf(inst) });
      continue;
    }

    const server = net.createServer((socket) => {
      socket.on('error', (err) => {
        console.error(`[Socket Error - ${inst.code}]`, err.message);
      });
      attachSocket(inst, protocol, socket, false);
    });

    server.listen(port, inst.host || '0.0.0.0', () => {
      console.log(`[Instrument] ${inst.code} (${protocol}) server :${port}`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') console.warn(`[Instrument] Port ${port} in use for ${inst.code}`);
      else console.error(`[Instrument] ${inst.code}:`, err.message);
    });
    servers.set(inst.id, { mode: 'server', server, port, key: keyOf(inst) });
  }
}

function closeEntry(entry) {
  if (entry.mode === 'client') {
    entry.stopped = true;
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.socket) entry.socket.destroy();
  } else if (entry.server) {
    entry.server.close();
  }
}

export function stopInstrumentListeners() {
  for (const [, entry] of servers) closeEntry(entry);
  servers.clear();
}

/**
 * #7 Reload listener tanpa restart backend.
 * Menutup listener untuk alat yang non-aktif/dihapus atau yang berubah
 * mode/host/port, lalu membuka yang baru. Aman dipanggil berulang.
 */
export async function reloadInstrumentListeners() {
  if (process.env.INSTRUMENT_LISTENER_ENABLED === 'false') {
    return { reloaded: false, reason: 'listener dinonaktifkan (.env)' };
  }
  const [rows] = await pool.query('SELECT id, conn_mode, host, port FROM instruments WHERE is_active = 1');
  const desired = new Map(rows.map((r) => [r.id, keyOf(r)]));

  for (const [id, entry] of [...servers]) {
    if (!desired.has(id) || desired.get(id) !== entry.key) {
      closeEntry(entry);
      servers.delete(id);
    }
  }
  await startInstrumentListeners();
  return { reloaded: true, active: servers.size };
}

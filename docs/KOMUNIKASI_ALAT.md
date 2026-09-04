# Dokumentasi Komunikasi Alat Laboratorium — GeuLIS

Dokumen ini menjelaskan cara GeuLIS berkomunikasi dengan alat/analyzer
laboratorium: arsitektur koneksi, protokol yang didukung, alur pesan, sampai
konfigurasi di sisi alat.

Kode inti: [`backend/src/services/instrumentListener.js`](../backend/src/services/instrumentListener.js)
dan [`backend/src/services/protocolParsers.js`](../backend/src/services/protocolParsers.js).

---

## 1. Model Dasar: Dua Arah Koneksi

Kolom `instruments.conn_mode` menentukan siapa yang menghubungi siapa.

### Mode `server` (default) — alat menghubungi LIS

Berlaku untuk mayoritas analyzer. LIS membuka TCP socket server dan **menunggu
alat yang melakukan koneksi** (*passive listener*).

```
Sysmex XN-1000  ──TCP connect──▶  LIS :5001   (instrument HEM-01)
Roche c501      ──TCP connect──▶  LIS :5002   (instrument CHEM-01)
```

Konsekuensi di lapangan:

- Di panel setting alat, isi **Host IP = IP server LIS** dan
  **Host Port = port** yang Anda tetapkan di menu *Alat Laboratorium*.

### Mode `client` — LIS menghubungi alat

Sebagian analyzer justru bertindak sebagai TCP server dan menunggu dihubungi.
**Mindray BC-3600** termasuk golongan ini: ia mendengarkan di portnya sendiri
dan mengirim heartbeat `0x02` tiap 3 detik setelah koneksi terbentuk.

```
LIS  ──TCP connect──▶  BC-3600 192.168.1.200:3600   (instrument HTM001)
```

Pada mode ini `instruments.host` berisi **alamat alat**, bukan alamat bind, dan
di panel alat tidak ada isian Host IP sama sekali. LIS menyambung ulang otomatis
tiap 5 detik bila koneksi putus.

Rinciannya: [BC-3600.md](BC-3600.md).

### Worklist — alat menarik identitas pasien dari LIS

Sebagian alat bisa menanyakan identitas pasien ke LIS berdasarkan barcode, sehingga
petugas tidak perlu mengetik apa pun. GeuLIS mendukungnya untuk **HL7**:

```
alat   ──ORM^O01──▶  GeuLIS     "siapa pasien untuk sampel 122?"
GeuLIS ──ORR^O02──▶  alat       identitas pasien + order
```

Ketersediaannya berbeda per model: **BC-11 mendukung** (setelan `Auto Fetch Info
From LIS`), **BC-3600 tidak** — manualnya hanya mendefinisikan `ORU^R01` dan
`ACK^R01`. Pada jalur **ASTM** ada mekanisme setara lewat record `Q` (host query).

Jenis pesan worklist berbeda antar generasi alat Mindray: BC-11 memakai ORM/ORR,
sedangkan Host Interface Manual Ver 4.0 mendokumentasikan QRY/QCK/DSR. **Rekam dulu
pesan asli dari alat** (tercatat di `instrument_logs` dan `/tmp/lis_debug.log`)
sebelum menulis kode untuk alat baru.

Rinciannya: [BC-11.md](BC-11.md).
- **Belum ada dukungan serial RS-232.** Alat yang hanya punya port serial perlu
  *converter serial-to-TCP* (mis. Moxa NPort / USR-TCP232) di depannya.

---

## 2. Satu TCP Server per Alat

Saat backend start, LIS membaca tabel `instruments` yang `is_active = 1`, lalu
membuka satu `net.createServer()` untuk masing-masing di `host:port`-nya.

Default: `host = 0.0.0.0` (menerima dari semua interface), `port = 5000`.

Seed bawaan:

| Kode    | Nama                 | Protokol | Port |
| :------ | :------------------- | :------- | :--- |
| HEM-01  | Hematology Analyzer  | astm     | 5001 |
| CHEM-01 | Chemistry Analyzer   | astm     | 5002 |

> ⚠️ **PENTING — listener hanya dibuka sekali saat backend boot.**
> Belum ada endpoint reload. Setelah **menambah alat baru** atau **mengubah
> port** lewat UI, Anda **wajib me-restart backend** agar port-nya benar-benar
> terbuka:
> ```bash
> pm2 restart geulis-backend
> ```
> Jika port sudah dipakai proses lain, server gagal diam-diam dan hanya muncul
> warning `EADDRINUSE` di log.

Untuk menonaktifkan seluruh listener (mis. saat development):
```
INSTRUMENT_LISTENER_ENABLED=false   # di backend/.env
```

---

## 3. Protokol yang Didukung

Diset per-alat lewat kolom `protocol`. Empat protokol tersedia:

| Protokol         | Kegunaan umum                         | Balasan teks LIS |
| :--------------- | :------------------------------------ | :--------------- |
| `astm`           | Sysmex, Roche, Mindray (E1381/E1394)  | **Tidak** (hanya `<ACK>` biner) |
| `hl7`            | Analyzer/middleware berbasis HL7 v2   | Ya (`ACK\|n\|hl7`) |
| `json`/`tcp_json`| Integrasi custom / middleware modern  | Ya (`ACK\|n\|json`) |
| `xml`            | Integrasi custom berbasis XML         | Ya (`ACK\|n\|xml`) |

Format pesan yang diharapkan tiap protokol (`PROTOCOL_HELP`):

- **ASTM** — record `P` (pasien), `O` (order/barcode), `R` (hasil), pipe-delimited,
  diakhiri `<EOT>` (`\x04`) atau newline.
- **HL7 v2** — segment `PID` (pasien), `OBR` (order, barcode di field 3),
  `OBX` (hasil: kode di OBX-3, nilai di OBX-5).
- **JSON** — `{"sampleId":"ORD001","results":[{"test_code":"HGB","value":"14.2","unit":"g/dL"}]}`
- **XML** — `<sample>ORD001</sample><item code="HGB" value="14.2"/>`

> **Catatan:** kolom `config_json` (mis. `{"delimiter":"|"}`) tersimpan di DB
> tetapi **belum dibaca** oleh parser — delimiter pipe saat ini di-hardcode.

---

## 4. Alur Komunikasi End-to-End

```
┌─────────┐                                          ┌──────────────────────────┐
│  ALAT   │                                          │   LIS (TCP server:port)  │
└────┬────┘                                          └────────────┬─────────────┘
     │  TCP connect                                               │
     │ ─────────────────────────────────────────────────────────▶│
     │                                                            │
     │  <ENQ> (0x05)        [ASTM]                                │
     │ ─────────────────────────────────────────────────────────▶│
     │                                        balas <ACK> (0x06)  │
     │ ◀─────────────────────────────────────────────────────────│
     │                                                            │
     │  frame data (P|... O|... R|...)                            │  buffer += chunk
     │ ─────────────────────────────────────────────────────────▶│  cek isMessageComplete()
     │                                        balas <ACK> [ASTM]  │  log ke instrument_logs
     │ ◀─────────────────────────────────────────────────────────│
     │                                                            │
     │  <EOT> (0x04)        [ASTM]                                │  ── parse & simpan hasil ──
     │ ─────────────────────────────────────────────────────────▶│  socket.end()
     │                                                            │
     │  (non-ASTM) balas ACK|<jumlah tersimpan>|<protokol>        │
     │ ◀─────────────────────────────────────────────────────────│
```

### 4a. Buffering & deteksi akhir pesan

TCP adalah *stream*, bukan pesan — satu pesan alat bisa tiba tercecer dalam
beberapa event `data`. Tiap chunk ditumpuk ke `buffer`, lalu dicek dengan
`isMessageComplete()`:

| Protokol | Dianggap lengkap bila |
| :------- | :-------------------- |
| `astm`   | ada `<EOT>` (`\x04`), atau baris `L\|1`, atau `R\|` + newline |
| `hl7`    | ada `\x1C` (FS/MLLP), atau `OBX\|` + diakhiri newline |
| `json`   | `JSON.parse()` berhasil |
| `xml`    | ada tag penutup `</…>` |

Jika belum lengkap → tunggu chunk berikutnya. Jika lengkap → buffer diproses lalu
dikosongkan.

### 4b. Handshake ASTM (ENQ / ACK / EOT)

Khusus `astm`, LIS membalas otomatis:

- Chunk mengandung `<ENQ>` (`\x05`) → balas `<ACK>` (`\x06`) = "silakan kirim".
- Chunk mengandung newline tapi bukan `<EOT>` → balas `<ACK>` = "frame diterima".
- `<EOT>` (`\x04`) diterima → `socket.end()`, koneksi ditutup rapi.

> Untuk ASTM, LIS **tidak pernah** mengirim teks seperti `ACK|3|astm`
> (Sysmex akan error bila dikirimi teks bebas setelah EOT). Balasan teks
> `ACK|n|protokol` / `NAK|pesan` **hanya** untuk JSON/HL7/XML.

---

## 5. Parsing → Pencocokan Pasien → Penyimpanan

### 5a. Yang diambil dari pesan

Parser hanya mencari dua hal: **ID sampel (barcode)** dan **daftar hasil**
(plus data pasien opsional: nama, tgl lahir, gender).

Contoh penanganan khusus Sysmex:
- Kode tes berformat `^^^^WBC^1` → diekstrak menjadi `WBC`.
- Pemisah baris hanya `\r` (bukan `\n`) tetap didukung.

### 5b. Pencocokan barcode ke pasien

Barcode dicari **sekaligus ke 4 kolom** (`resolvePatientId`):

- `patients.medical_record_no`
- `patients.order_no`
- `lab_requests.request_no`
- `lab_requests.simrs_order_id`

Jadi barcode boleh berisi No. RM **atau** No. Order SIMRS — keduanya cocok.

Bila **tidak ditemukan sama sekali**, pasien dibuat otomatis (nama dari record `P`
atau `Pasien <barcode>`), plus satu `lab_requests` berstatus `completed`.

### 5c. Auto-mapping kode tes

Sebelum menyimpan, tiap kode tes dari alat dicek di `instrument_test_map`.
Bila belum ada mapping-nya, kode itu **otomatis didaftarkan** ke `lab_tests`
sekaligus dibuatkan mapping-nya.

> Praktis untuk setup awal: jalankan satu sampel, semua parameter alat langsung
> muncul di menu *Alat Laboratorium*, tinggal Anda rapikan nama/satuan/nilai
> rujukannya.

### 5d. Perhitungan flag

Flag dihitung dari nilai rujukan tes (`calcFlag`):

| Kondisi                          | Flag       |
| :------------------------------- | :--------- |
| nilai < `reference_min`          | `low`      |
| nilai < 70% dari `reference_min` | `critical` |
| nilai > `reference_max`          | `high`     |
| nilai > 130% dari `reference_max`| `critical` |
| dalam rentang                    | `normal`   |
| bukan angka                      | `abnormal` |

Hasil disimpan ke `lab_results`.

---

## 6. Komunikasi Dua Arah — Host Query (ASTM saja)

Fitur worklist otomatis: alat menanyakan "tabung ini mau diperiksa apa?" dan LIS
menjawab dengan daftar tes yang sudah di-order.

```
Alat scan barcode tabung
   │
   ├──▶ kirim record  Q|...|077071          "tabung ini mau diperiksa apa?"
   │
   │    LIS: cari lab_requests dari barcode → ambil lab_request_items
   │         → terjemahkan ke kode alat via instrument_test_map
   │
   ◀──── H|…   P|1   O|1|077071||^^^WBC\^^^^HGB…|…|Q   L|1|N
   │
   └──▶ alat langsung menjalankan tes yang diminta, tanpa input manual
```

Bila order tidak ditemukan atau tidak ada tes yang ter-mapping,
`buildAstmOrder()` mengembalikan string kosong → LIS tidak membalas → alat
biasanya jatuh ke mode default/manual.

---

## 7. Logging

Setiap chunk masuk dan setiap balasan dicatat ke tabel `instrument_logs`, dengan
control character diubah menjadi teks terbaca agar bisa dibaca di UI:

`<ENQ>`, `<ACK>`, `<EOT>`, `<STX>`, `<ETX>`

- 50 log terakhir tampil via `GET /api/instruments/logs/recent`
  (menu *Alat Laboratorium*).
- Kolom `instruments.last_connected` diperbarui tiap ada data masuk.
- Debug log mentah ditulis ke `/tmp/lis_debug.log`
  (⚠️ path Unix — tidak berfungsi di Windows Server; tanpa rotasi).

---

## 8. Ringkasan Konfigurasi Alat

Di menu **Alat Laboratorium** LIS, tiap alat memiliki:

| Field       | Keterangan                                             |
| :---------- | :----------------------------------------------------- |
| `code`      | Kode unik alat (mis. `HEM-01`)                         |
| `name`      | Nama alat                                              |
| `protocol`  | `astm` / `hl7` / `json` / `xml`                        |
| `host`      | Interface listen LIS (default `0.0.0.0`)               |
| `port`      | Port TCP tempat LIS menunggu koneksi alat              |
| `is_active` | Hanya alat aktif yang dibukakan listener saat boot     |

Di sisi **alat**: set Host = IP server LIS, Port = `port` di atas, protokol/
format output sesuaikan dengan kolom `protocol`.

**Setelah perubahan port/alat baru → restart backend.**

---

## 9. Catatan Keterbatasan (Perlu Diwaspadai)

Beberapa hal yang perlu diperhatikan untuk pemakaian produksi dengan data medis:

1. **Frame number ASTM belum di-strip.** ASTM ter-*frame* mengirim
   `<STX>` + nomor frame + isi + `<CR><ETX>` + checksum. Kode membuang `<STX>`/
   `<ETX>` tetapi **tidak** nomor frame/checksum, sehingga record bisa jadi
   `2P|1|...` dan **terlewat** karena parser mencocokkan `parts[0] === 'P'`.
   Aman hanya bila alat mengirim baris polos tanpa framing.
2. **Checksum tidak divalidasi.** Frame rusak diterima apa adanya sebagai hasil
   pasien.
3. **ACK dikirim per-chunk, bukan per-frame.** Bila satu chunk TCP memuat dua
   frame, ACK bisa kurang; bila satu frame terpecah dua chunk, ACK bisa dobel.
   Sebagian analyzer toleran, sebagian bisa timeout/retry.
4. **Listener tidak reload otomatis** — lihat peringatan di Bagian 2.

---

---

## 10. Panduan Penggunaan (Setup s/d Terima Hasil)

### 10.1. Prasyarat

- **Database**: MySQL / MariaDB (mis. lewat **XAMPP** — Control Panel → Start MySQL).
- **Node.js** 18.x / 20.x+.
- Server LIS dan alat berada dalam **satu jaringan** (bisa saling ping).

### 10.2. Import Database (XAMPP)

Dump `database/dump_contoh.sql` **tidak** memuat `CREATE DATABASE`, jadi buat dulu database-nya
baru import ke dalamnya.

```bash
# path mysql XAMPP di macOS:
MYSQL=/Applications/XAMPP/xamppfiles/bin/mysql
# (Windows XAMPP: C:\xampp\mysql\bin\mysql.exe)

# 1. buat database
"$MYSQL" -u root -e "CREATE DATABASE IF NOT EXISTS geulis CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"

# 2. import dump
"$MYSQL" -u root geulis < database/dump_contoh.sql

# 3. verifikasi
"$MYSQL" -u root geulis -e "SHOW TABLES;"
```

Alternatif lewat **phpMyAdmin** (`http://localhost/phpmyadmin`): buat database
`geulis` → tab *Import* → pilih `database/dump_contoh.sql` → *Go*.

### 10.3. Konfigurasi Credential (`backend/.env`)

Default XAMPP: user `root`, **tanpa password**. Isi `backend/.env`:

```ini
PORT=3001
JWT_SECRET=ganti-dengan-teks-acak-panjang
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=geulis
INSTRUMENT_LISTENER_ENABLED=true
```

> Gunakan `127.0.0.1` (bukan `localhost`) agar driver `mysql2` konek via TCP
> ke MariaDB XAMPP. Jika MySQL Anda berpassword, isi `DB_PASSWORD`.

### 10.4. Jalankan Aplikasi

```bash
# dari folder root proyek
npm run install:all      # install dependency backend + frontend (sekali saja)
npm start                # jalankan backend (:3001) + frontend (:5173)
```

Akses: **http://localhost:5173**

| Login | Username | Password |
| :---- | :------- | :------- |
| Administrator | `admin` | `<lihat SANDI_AWAL.txt>` |
| Petugas Lab   | `lab`   | `<lihat SANDI_AWAL.txt>`  |

> Password di atas berlaku untuk database hasil import ini. Untuk instalasi baru
> dari `schema.sql`, `ensureSeed` menetapkan password default yang sama.

### 10.5. Mendaftarkan Alat & Menghubungkannya

1. Login sebagai **admin** → menu **Alat Laboratorium** → **Tambah Alat**.
2. Isi `code`, `name`, pilih `protocol` (mis. `astm`), dan **Port TCP**
   (mis. `5005`). Pastikan `is_active` menyala.
3. **Restart backend** agar port listener terbuka
   (lihat [Bagian 2](#2-satu-tcp-server-per-alat)) — `pm2 restart geulis-backend`
   atau hentikan & jalankan ulang `npm start`.
4. Di **panel setting alat** (mis. Sysmex): set **Host/IP = IP server LIS**,
   **Port = 5005**, mode output sesuai protokol.
5. Kirim satu sampel uji. Buka menu **Alat Laboratorium → log** untuk memastikan
   data masuk (`<ENQ>`, `<ACK>`, record `R|...`).

### 10.6. Alur Kerja Harian

```
Order masuk (SIMRS via /bridging/order  ATAU input manual di menu Permintaan Lab)
      │
      ▼
Sampel diproses di alat → alat kirim hasil ke port LIS
      │
      ▼
LIS cocokkan barcode → simpan ke lab_results (flag otomatis)
      │
      ▼
Petugas cek/verifikasi di menu Hasil Lab → cetak laporan
      │
      ▼
SIMRS tarik hasil via  GET /bridging/result/:simrs_order_id
```

### 10.7. Verifikasi Cepat & Troubleshooting

```bash
# cek backend hidup
curl http://localhost:3001/api/health          # -> {"status":"ok",...}
```

| Gejala | Kemungkinan sebab & solusi |
| :----- | :------------------------- |
| Backend gagal start / error DB | MySQL XAMPP belum Start; atau `.env` salah. Pakai `DB_HOST=127.0.0.1`. |
| Alat tidak bisa connect | Backend belum di-restart setelah tambah alat; port salah; firewall memblok port alat. |
| `EADDRINUSE` di log | Port sudah dipakai proses lain — ganti port alat, restart backend. |
| Data masuk tapi hasil tak muncul | Barcode tidak cocok ke pasien/order — cek `medical_record_no` / `order_no` / `simrs_order_id`. |
| Login gagal | Pakai `admin/<lihat SANDI_AWAL.txt>`. Data user tersimpan di tabel `users`. |
| Alat ASTM ter-*frame* record terlewat | Lihat [Bagian 9](#9-catatan-keterbatasan-perlu-diwaspadai) — kirim baris polos tanpa framing. |

---

*Dokumen ini dibuat berdasarkan kode di `backend/src/services/`. Perbarui bila
logika listener/parser berubah.*

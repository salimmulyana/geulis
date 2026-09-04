# Logika Aplikasi GeuLIS

Dokumen ini menjelaskan **cara kerja** GeuLIS, bukan cara memakainya. Sasarannya
siapa pun yang perlu mengubah kodenya: apa yang berjalan di mana, data mengalir
ke mana, dan keputusan mana yang diambil di titik mana.

Untuk pemasangan lihat `PANDUAN_SERVER.txt`, untuk alat lihat
[KOMUNIKASI_ALAT.md](KOMUNIKASI_ALAT.md), untuk kewajiban regulasi lihat
[REGULASI.md](REGULASI.md).

---

## 1. Yang berjalan di satu server

```
                    ┌─────────────── satu mesin di rumah sakit ───────────────┐
                    │                                                          │
  browser ─────────▶│  nginx :80/:5173/:443                                    │
                    │    ├── berkas statis  frontend/dist                      │
                    │    └── /api/*  proxy ──▶ backend :3001 (127.0.0.1 saja)  │
                    │                              │                           │
  SIMRS Khanza ────▶│  /api/bridging/*             ├──▶ MariaDB geulis     │
                    │                              │                           │
                    │                         listener alat (proses yang sama) │
                    └──────────────────────────────┼───────────────────────────┘
                                                   │
                    alat lab ◀──── TCP ────────────┘
```

Hanya **satu proses Node** (`geulis-backend` di PM2). Listener alat bukan proses
terpisah — ia hidup di dalam proses yang sama, lihat
[index.js](../backend/src/index.js).

API sengaja **hanya mendengarkan di 127.0.0.1**; nginx yang menghadap jaringan.
Port 3001 tidak perlu terbuka ke luar.

---

## 2. Peta berkas

```
backend/src/
  index.js              rakit express, pasang rute, nyalakan listener alat
  ensureSchema.js       migrasi skema idempoten, jalan tiap backend start
  config/db.js          pool mysql2
  middleware/auth.js    authenticate (JWT), requirePermission, punyaHak, requireApiKey
  routes/               16 berkas, satu per bidang
  services/
    instrumentListener.js  soket TCP dua arah, framing, simpan hasil
    protocolParsers.js     urai & bentuk pesan HL7/ASTM/JSON/XML
    flags.js               normal / low / high / critical
    deltaCheck.js          bandingkan dengan hasil sebelumnya
    qc.js                  kontrol mutu, aturan Westgard
    pemetaanTes.js         padankan kode alat ke katalog tes
    revisiHasil.js         simpan keadaan sebelum hasil diperbaiki
    audit.js               audit_logs
  scripts/              perkakas pemeliharaan (hitung ulang flag, cocokkan hasil)
  test/                 uji node:test — jalankan `npm test` di folder backend

frontend/src/
  App.jsx               daftar rute
  api.js                satu-satunya tempat memanggil backend
  components/Layout.jsx sidebar + menu
  pages/                15 halaman
```

---

## 3. Model data

Tiga sumbu utama: **pasien**, **permintaan**, **hasil**.

```
patients ──1:N──▶ lab_requests ──1:N──▶ lab_request_items
                        │                      │
                        └──────────┬───────────┘
                                   ▼
                              lab_results ──1:N──▶ lab_result_revisions
                                   │
                     lab_tests ────┘         instruments
                        ▲                         │
                        └── instrument_test_map ──┘
```

**`lab_requests`** — satu permintaan lab. `simrs_order_id` menyimpan nomor order
SIMRS (mis. `PK202609030026`), `request_no` nomor internal LIS.
Status: `pending → collected → processing → completed`, atau `cancelled`.
`collected_at` terisi saat status berubah jadi `collected`
([requests.js:134](../backend/src/routes/requests.js#L134)).

**`lab_request_items`** — pemeriksaan yang diminta. `simrs_code` menyimpan kode
asli SIMRS **apa adanya**, karena satu tes LIS bisa punya puluhan `id_template`
di Khanza (satu per panel/kelas) sehingga menebaknya saat mengembalikan hasil
sering meleset.

**`lab_results`** — satu baris per parameter.
- `status`: `preliminary` → `final` (setelah diverifikasi) → `corrected`
- `flag`: `normal` / `low` / `high` / `critical` / `abnormal`
- `abnormal` dipakai untuk hasil yang **bukan angka** (mis. nama berkas
  histogram), bukan untuk hasil yang di luar rujukan
- `raw_message` menyimpan potongan pesan asli dari alat, untuk telusur

**`lab_tests`** — katalog. Rujukan disimpan per gender
(`reference_min_l`/`_max_l` untuk laki-laki, `_p` untuk perempuan), dengan
`reference_min`/`reference_max` sebagai cadangan bila gender tidak ditentukan.
`critical_min`/`critical_max` **berbeda** dari rujukan: itu ambang yang menuntut
pemberitahuan segera ke dokter, dan angkanya ditetapkan lab.

**`unmatched_results`** — hasil yang belum punya pemilik. Lihat bagian 6.

**`instrument_test_map`** — jembatan kode alat (`GRAN%`, `PLCR`) ke `lab_tests`.
Per alat, karena dua alat bisa memakai kode berbeda untuk pemeriksaan sama.

---

## 4. Alur utama

### 4.1 Order masuk dari SIMRS

```
Khanza ──POST /api/bridging/order──▶ GeuLIS
   header: x-api-key
   body  : simrs_order_id, medical_record_no, patient_name, gender, birth_date,
           clinician_name, clinician_unit, specimen_type, collected_at, tests[]
```

[bridging.js](../backend/src/routes/bridging.js) akan:
1. cari pasien lewat `medical_record_no`; buat bila belum ada
2. buat `lab_requests` berstatus `pending`, `received_at = NOW()`
3. untuk tiap kode tes: cari padanan di `lab_tests`, simpan `simrs_code` aslinya

Otentikasinya **API key**, bukan JWT — `requireApiKey` di
[middleware/auth.js](../backend/src/middleware/auth.js).

### 4.2 Sampel dijalankan di alat

Petugas mengetik **Sample ID** di alat. Isinya boleh nomor order SIMRS atau
nomor rekam medis — keduanya dicocokkan (lihat 5.3).

### 4.3 Hasil masuk

Alat mengirim pesan hasil, listener menyimpannya, lalu membalas ACK. Rincian di
bagian 5.

### 4.4 Verifikasi

Hasil masuk berstatus `preliminary`. Petugas berwenang memverifikasi
(`POST /api/results/verify-group` atau `verify-request/:id`), status jadi
`final`, `verified_by` dan `verified_at` terisi — dan itulah yang tercetak
sebagai identitas pemverifikasi di laporan.

### 4.5 Hasil ditarik SIMRS

```
Khanza ──GET /api/bridging/result/{simrs_order_id}──▶ GeuLIS
```

Hanya hasil yang **sudah diverifikasi** yang dikembalikan. Relasinya lewat
`request_id`, bukan tebakan tanggal, dan satu baris per pemeriksaan supaya tidak
duplikat.

---

## 5. Komunikasi alat

Seluruhnya di [instrumentListener.js](../backend/src/services/instrumentListener.js)
dan [protocolParsers.js](../backend/src/services/protocolParsers.js).

### 5.1 Dua arah koneksi

Kolom `instruments.conn_mode` menentukan siapa menghubungi siapa:

| `conn_mode` | Arti | Contoh |
|---|---|---|
| `server` | LIS mendengarkan, **alat** menghubungi | Sysmex (ASTM) |
| `client` | **LIS** menghubungi alat | Mindray BC-3600, BC-11, BC-30s |

Mode client menyambung ulang otomatis tiap 5 detik bila putus. Alat Mindray
mengirim detak `0x02` tiap 3 detik; detak itu disaring dan tidak dianggap pesan.

Mengubah alat tidak perlu restart backend — `POST /api/instruments/reload`
memuat ulang listener.

### 5.2 Kapan pesan dianggap lengkap

TCP tidak mengenal batas pesan, jadi buffer diperiksa `isMessageComplete()`:

| Protokol | Penanda selesai |
|---|---|
| HL7 | `0x1C` (MLLP end block) |
| ASTM | `0x04` (EOT) atau rekaman `L\|1` |
| JSON | `JSON.parse` berhasil |
| XML | tag penutup |

### 5.3 Worklist — alat menanyakan pasien

Alat mengirim `ORM^O01` dengan `ORC-1 = RF`, LIS membalas `ORR^O02`:

```
alat  ──▶  ORC|RF||PK202609030026||IP
LIS   ──▶  PID|1|103531|103531^^^^MR||WASTIAH ABDULAH, NY||19700204000000|F
           ORC|AF|PK202609030026
           OBR|1|PK202609030026||00001^Automated Count^99MRC||<diambil>|...
```

Nomor sampel dicocokkan ke `patients.medical_record_no`, `patients.order_no`,
`lab_requests.request_no`, atau `lab_requests.simrs_order_id`. Permintaan yang
**belum selesai didahulukan**, supaya alat menerima order yang sedang berjalan.

Bila tidak ketemu, LIS membalas `MSA|AE` **tanpa** PID dan ORC. GeuLIS tidak
pernah mengarang identitas pasien — data palsu di layar alat lebih berbahaya
daripada pesan "tidak ditemukan".

### 5.4 Penyimpanan hasil

```
pesan masuk
   ├── data QC?         ──▶ qc_results (bagian 7)
   ├── pertanyaan order? ──▶ balasan worklist (5.3)
   └── hasil pasien
         ├── pasien ketemu?  ──▶ lab_results
         └── tidak ketemu    ──▶ unmatched_results (bagian 6)
```

Kode pemeriksaan yang belum ada di katalog **didaftarkan otomatis** beserta
pemetaannya ([pemetaanTes.js](../backend/src/services/pemetaanTes.js)).

---

## 6. Hasil belum cocok

Nomor sampel asing **tidak** membuat pasien baru. Hasilnya ditahan di
`unmatched_results` untuk dicocokkan orang, lewat halaman **Hasil Belum Cocok**.

Alasannya berdasar kejadian nyata: pendaftaran otomatis menghasilkan pasien
karangan (`121/WASTIAH`, `1/muryati`) yang memegang hasil milik pasien asli —
dan karena pasien karangan itu jadi ada, worklist mengembalikan namanya ke layar
alat sehingga tampak sah.

Dua hal penting pada jalur ini:

- Alat tetap dibalas **ACK positif**. Membalas AE membuat alat dengan
  *Auto Retransmit* mengirim ulang tanpa henti.
- Kiriman ulang **memperbarui baris yang sama**, bukan menumpuk duplikat.

Rumah sakit yang memang menghendaki pendaftaran otomatis bisa menyalakan
pengaturan `auto_register_pasien` (bawaan: mati).

---

## 7. Penafsiran hasil

### 7.1 Flag — [flags.js](../backend/src/services/flags.js)

```
bukan angka                          → abnormal
n ≤ critical_min atau n ≥ critical_max → critical
n < rujukan bawah                     → low
n > rujukan atas                      → high
selain itu                            → normal
```

Rujukan dipilih menurut gender pasien. **Kritis hanya muncul bila lab
menetapkan ambangnya sendiri.** Dulu ada tebakan "30% di luar rujukan berarti
kritis"; itu dibuang karena menandai LYMPH% 13,2 dan NEUT% 22 sebagai kritis —
banyak merah palsu membuat petugas berhenti menghiraukan yang merah sungguhan.

Flag dihitung **saat hasil disimpan**. Kalau rujukan diubah belakangan, hasil
lama tetap memakai flag lamanya — jalankan
`node scripts/hitung-ulang-flag.mjs --terapkan`.

### 7.2 Delta check — [deltaCheck.js](../backend/src/services/deltaCheck.js)

Membandingkan dengan hasil sebelumnya milik pasien dan pemeriksaan yang sama
dalam 7 hari. Lewat ambang → `delta_flag = 'check'`. Hanya menandai, tidak
menolak: perubahan besar memang bisa nyata (perdarahan, transfusi).

Gunanya menangkap **sampel tertukar** — HGB turun 4 g/dL dalam sehari lebih
sering berarti tabung tertukar daripada pasien memburuk secepat itu.

### 7.3 Pelaporan nilai kritis

`critical_ack` bukan sekadar "sudah dilihat". Saat di-acknowledge, wajib
mencatat siapa yang dihubungi, lewat apa, dan apakah hasilnya dibacakan ulang.

### 7.4 Riwayat perbaikan

Setiap perbaikan hasil menyimpan keadaan sebelumnya ke `lab_result_revisions`
lebih dulu. **`result_at` tidak ditimpa** — itu waktu pemeriksaan asli.

---

## 8. Kontrol mutu

**QC internal** ([qc.js](../backend/src/services/qc.js)) — alat mengirim bahan
kontrol lewat jalur yang sama dengan sampel pasien. Nilainya diubah jadi z-score
terhadap mean/SD lot, lalu dinilai aturan Westgard:

| Aturan | Arti |
|---|---|
| `1-3s` | satu titik lewat 3 SD → tolak |
| `2-2s` | dua titik sesisi lewat 2 SD → tolak |
| `R-4s` | dua titik berseberangan, rentang > 4 SD → tolak |
| `4-1s` | empat titik berurutan sesisi lewat 1 SD → tolak |
| `10x` | sepuluh titik berurutan sesisi mean → tolak |
| `1-2s` | satu titik lewat 2 SD → peringatan |

`2-2s` dan `R-4s` dinilai **menyilang antar level kontrol** dalam satu run
(jendela 120 menit), karena regulasi mengandaikan dua bahan kontrol per hari.

Tanpa mean/SD lot, nilai tetap disimpan dengan verdict `unknown` — datanya tidak
hilang, tinggal dinilai setelah lotnya didaftarkan.

**PME** ([pme.js](../backend/src/routes/pme.js)) — pemantapan mutu eksternal,
dinilai dengan SDI: ≤2 baik, 2–3 ragu, >3 buruk.

---

## 9. Hak akses

JWT berlaku 8 jam, isinya `{ id, username, roleId, roleCode }` — **datar**, jadi
`req.user.roleCode`, bukan `req.user.role.code`.

Peran `admin` melewati semua pemeriksaan izin. Selain itu, izin dicek per
endpoint dengan `requirePermission('kode.izin')`.

Izin dipisah tiga tingkat sesuai PMK 24/2022 Pasal 30 ayat (3):

| Izin | Untuk |
|---|---|
| `results.view` | melihat |
| `results.manage` | memasukkan hasil baru |
| `results.correct` | **memperbaiki dan menghapus** |

Karena satu endpoint bisa membuat **atau** memperbaiki, pemeriksaan izin
perbaikan dilakukan di tengah handler dengan `punyaHak()`, bukan sebagai
middleware.

Semua perubahan penting tercatat di `audit_logs`.

---

## 10. Migrasi skema

Tidak ada perkakas migrasi. [ensureSchema.js](../backend/src/ensureSchema.js)
berjalan **tiap backend start** dan bersifat idempoten: `ensureColumn()` hanya
menambah kolom bila belum ada, `CREATE TABLE IF NOT EXISTS` untuk tabel.

Konsekuensinya: menambah kolom = menambah satu baris di berkas itu, lalu restart.
Tidak ada mekanisme rollback — perubahan yang merusak harus dihindari, bukan
dibatalkan.

---

## 11. Uji otomatis

```bash
cd backend && npm test
```

Memakai `node:test` bawaan, tanpa kerangka uji tambahan. Yang diuji: parser
protokol dan aturan Westgard/SDI — **inti domain yang paling sunyi kalau salah**.

Pesan HL7/ASTM dalam berkas uji adalah **rekaman dari alat produksi**, bukan
karangan dari manual. Ini disengaja: manual Mindray berbeda antar generasi, dan
beberapa kali terbukti tidak sesuai kenyataan (lihat bagian 12).

Rute HTTP **belum ada ujinya** — itu celah terbesar yang tersisa.

---

## 12. Jebakan yang sudah terbukti di lapangan

Bagian ini yang paling mahal diperoleh. Semuanya berasal dari alat sungguhan,
dan beberapa **bertentangan dengan manual resminya**.

| Hal | Kenyataan |
|---|---|
| Kotak **Patient ID** di BC-11 | dibaca dari **PID-3**, walau tabel manual menandainya *void and reserved* |
| Nama pasien | komponen **pertama** PID-5; `^NAMA` membuat kotak First Name kosong |
| Tanggal lahir | wajib **14 digit** (`19700204000000`); 8 digit membuat umur tidak terhitung |
| **Draw Time** | diambil dari **OBR-6**, bukan OBR-8 seperti kata manual |
| **Delivery Time** | OBR-14 |
| Umur | tidak bisa dikirim LIS lewat HL7; alat menghitung sendiri saat sampel dijalankan |
| Port alat | BC-3600 → **3600**, BC-11 → **5100**. Tiap keluarga beda, jangan diasumsikan |
| Ping | alat Mindray **memblokir ICMP**; pakai `nmap` atau `nc`, bukan ping |
| Worklist BC-11 | memakai **ORM/ORR**, bukan QRY/QCK/DSR seperti di *Host Interface Manual v4.0* |
| Kolom DATE MySQL | kembali sebagai objek `Date`, bukan teks — `String(x).slice(0,10)` menghasilkan `"Wed Feb 04"` |
| `Number(null)` | menghasilkan **0**, bukan NaN — pernah melahirkan vonis PME "buruk" palsu |

Cara memastikan sesuatu tentang alat: **rekam pesannya**. Semua lalu lintas
masuk tercatat di `instrument_logs` dan tampil di menu Alat.

---

## 13. Deployment

- Aplikasi di `/var/www/geulis`, PM2 menjalankan `geulis-backend`
- nginx menyajikan `frontend/dist` dan mem-proxy `/api`
- `JWT_SECRET` **wajib** ≥32 karakter; backend berhenti bila tidak ada
- Cadangan harian `/usr/local/bin/backup-lis.sh` lewat cron 01:00

Saat rsync ke server **wajib** `--exclude 'backend/.env'` dan
`--exclude 'frontend/dist'`. Tanpa yang kedua, `--delete` menghapus `dist` di
server (karena `dist` ada di `.gitignore` sehingga tidak ada di mesin lokal) dan
situs mati 500.

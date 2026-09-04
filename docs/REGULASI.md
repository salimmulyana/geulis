# Regulasi laboratorium & rekam medis — dan posisi GeuLIS terhadapnya

Telaah tiga regulasi yang mengikat langsung cara GeuLIS bekerja. Berkas aslinya
ada di [docs/regulasi/](regulasi/), lengkap dengan hasil ekstraksi teksnya.

| Regulasi | Isi | Yang mengikat GeuLIS |
|---|---|---|
| **PMK 24/2022** — Rekam Medis | Rekam medis elektronik | Cadangan wajib di luar lokasi, retensi 25 tahun, hak akses, integritas data |
| **PMK 43/2013** — Cara Penyelenggaraan Laboratorium Klinik yang Baik | Mutu lab, 183 halaman | Pemantapan mutu internal (Westgard), 14 komponen wajib laporan hasil |
| **PMK 411/2010** — Laboratorium Klinik | Klasifikasi & izin | Kewajiban PMI + PME, akreditasi tiap 5 tahun |

---

## 1. PMK 24/2022 — Rekam Medis Elektronik

### Cadangan data (Pasal 20)

> (4) ... wajib memiliki cadangan data (backup system).
> (5) Cadangan data dilaksanakan dengan ketentuan:
> **a. diletakkan pada tempat yang berbeda dari lokasi Fasilitas Pelayanan Kesehatan;**
> b. dilakukan secara periodik; dan
> c. dituangkan dalam standar prosedur operasional.

**Posisi GeuLIS:** cadangan harian sudah jalan sejak 2026-09-03 (`backup-lis.sh`,
cron 01:00, retensi 14 hari, sudah diuji pulihkan). Tapi **masih di mesin yang
sama** — huruf (a) belum dipenuhi, dan huruf (c) juga belum ada SPO tertulis.
Sebelum tanggal itu tidak ada cadangan sama sekali di kedua server.

### Retensi 25 tahun (Pasal 39)

> Penyimpanan data Rekam Medis Elektronik ... dilakukan **paling singkat 25 (dua
> puluh lima) tahun** sejak tanggal kunjungan terakhir Pasien.

**Posisi GeuLIS:** belum ada kebijakan retensi, dan yang lebih menyulitkan,
`DELETE /api/results/:id` serta `DELETE /api/results/group/batch` **menghapus
baris secara permanen**. Data yang dihapus tidak bisa ditemukan kembali.

### Integritas dan hak akses (Pasal 29–30)

> (3) Integritas ... jaminan terhadap keakuratan data, dan **perubahan terhadap
> data hanya boleh dilakukan oleh orang yang diberi hak akses untuk mengubah**.

Hak akses dibagi tiga: penginputan data, perbaikan data, melihat data.

**Posisi GeuLIS:** sudah ada peran + permission + `audit_logs`, jadi kerangkanya
ada. Yang belum: pemisahan tegas "boleh melihat" vs "boleh memperbaiki", dan
riwayat perubahan nilai hasil (lihat butir 2 di bawah).

### Interoperabilitas dengan platform Kemenkes (Pasal 21, 10, 11)

> **Pasal 21.** Rekam Medis Elektronik yang disimpan oleh Fasilitas Pelayanan
> Kesehatan **harus terhubung/terinteroperabilitas dengan platform layanan
> interoperabilitas dan integrasi data kesehatan yang dikelola oleh Kementerian
> Kesehatan.**

Pasal 10 menuntut sistem punya kemampuan kompatibilitas/interoperabilitas yang
**mengacu ke standar yang diselenggarakan Kemenkes**, dan Pasal 11 menuntut
variabel serta meta data (definisi, format, **kodifikasi**) mengikuti ketetapan
Kemenkes.

**Posisi GeuLIS:** belum ada sama sekali. GeuLIS bertukar data dengan SIMRS
Khanza lewat API sendiri, dan kode pemeriksaannya lokal (`WBC`, `HGB`) dengan
pemetaan per rumah sakit — bukan kodifikasi standar. Ini celah terbesar yang
tersisa dari sisi regulasi, dan yang paling besar pula usahanya.

### Nama, waktu, dan tanda tangan pada setiap pencatatan (Pasal 16 ayat 2)

> Pencatatan dan pendokumentasian harus lengkap, jelas, dan dilakukan setelah
> Pasien menerima pelayanan kesehatan dengan **mencantumkan nama, waktu, dan
> tanda tangan** Tenaga Kesehatan pemberi pelayanan kesehatan.

**Posisi GeuLIS:** `verified_by` dan `verified_at` tersimpan di database, tapi
**tidak pernah ditampilkan maupun dicetak** — kotak tanda tangan di laporan
hanya bertulis "Analis Laboratorium" tanpa nama.

### Pemisahan hak akses (Pasal 30 ayat 3)

Hak akses dibagi tiga: **penginputan data**, **perbaikan data**, dan **melihat
data**.

**Posisi GeuLIS:** hanya ada dua tingkat per modul (`results.view` dan
`results.manage`). "Boleh memasukkan hasil" dan "boleh mengubah hasil yang sudah
ada" tidak terpisah, padahal justru perbaikan yang paling perlu dibatasi.

### Tanda tangan elektronik (Pasal 31)

Boleh, bukan wajib — dipakai sebagai alat verifikasi dan autentikasi isi rekam
medis serta identitas penanda tangan. GeuLIS punya `verified_by`/`verified_at`,
yang memenuhi semangatnya walau bukan tanda tangan elektronik tersertifikasi.

---

## 2. PMK 43/2013 — Pemantapan Mutu Internal

Regulasi ini menyebut **persis** aturan Westgard yang dipakai GeuLIS, dengan
penamaan yang sedikit berbeda (halaman 122–124):

| Regulasi | GeuLIS | Arti |
|---|---|---|
| `13S` | `1-3s` | satu kontrol melewati x ± 3 S → tolak |
| `22S` | `2-2s` | 2 kontrol berturut-turut keluar batas yang sama → tolak |
| `R4S` | `R-4s` | beda 2 kontrol berturut-turut lebih dari 4 S → tolak |
| `41S` | `4-1s` | 4 kontrol berturut-turut sesisi lewat 1 S → tolak |
| `10X` | `10x` | 10 kontrol berturut-turut sesisi dari mean → tolak |
| `12S` | `1-2s` | penapis: kalau tidak dilanggar, run diterima |

**Satu perbedaan yang perlu diperbaiki.** Regulasi mengandaikan **dua bahan
kontrol tiap hari** (kontrol rendah dan kontrol tinggi), dan aturan dievaluasi
menyilang antar keduanya dalam satu run:

> setiap hari diperiksa 2 bahan kontrol, misalnya kontrol rendah dan kontrol tinggi

GeuLIS saat ini menilai per lot/level secara berurutan waktu, belum menyilang
antar level dalam satu run. Untuk `R-4s` dan `2-2s` perbedaan ini nyata.

Kewajiban PMI **dan** PME (pemantapan mutu eksternal) juga ditegaskan di
PMK 411/2010 Pasal 6 huruf a. PME belum tersentuh GeuLIS sama sekali.

---

## 3. PMK 43/2013 — 14 komponen wajib laporan hasil

Bab IX menetapkan isi minimum laporan hasil pemeriksaan. Berikut perbandingannya
dengan laporan GeuLIS sekarang ([ReportModal.jsx](../frontend/src/components/ReportModal.jsx)):

| # | Komponen wajib | GeuLIS |
|---|---|---|
| 1 | Identifikasi pemeriksaan yang jelas | ada |
| 2 | Identifikasi laboratorium penerbit | ada (kop dari Pengaturan) |
| 3 | Identifikasi pasien serta lokasinya | sebagian — ruangan/bangsal belum ada |
| 4 | Nama dan alamat pemohon | **belum ada** |
| 5 | Tanggal & waktu pengambilan sampel, dan waktu diterima lab | **belum ada** |
| 6 | Tanggal & waktu penerbitan laporan | sebagian — yang tercetak tanggal cetak, bukan tanggal terbit |
| 7 | Jenis spesimen (mis. darah vena) | **belum ada** |
| 8 | Satuan SI | ada |
| 9 | Interval acuan biologis | **rusak** — lihat catatan di bawah |
| 10 | Interpretasi hasil bila sesuai | sebagian (tanda `*` + flag) |
| 11 | Tanggapan mutu/kecukupan spesimen | **belum ada** |
| 12 | Identitas petugas yang berwenang mengeluarkan hasil | **belum ada** — kotak tanda tangan hanya bertulis "Analis Laboratorium" tanpa nama |
| 13 | **Hasil asli dan hasil yang diperbaiki** | **belum ada** — koreksi menimpa nilai lama |
| 14 | Tanda tangan/otorisasi petugas | kotak kosong, tanpa nama pemverifikasi |

### Catatan komponen 9 — ini bug, bukan sekadar fitur kurang

Laporan membaca `reference_min`/`reference_max`, sedangkan nilai rujukan yang
baru diisi tersimpan di kolom spesifik gender `reference_min_l`/`_max_l`/
`_min_p`/`_max_p`. Akibatnya di salah satu lokasi pemasangan kolom **NILAI RUJUKAN pada
laporan tercetak "-" untuk semua parameter**, walaupun datanya ada di database.
Endpoint-nya sudah mengirim keempat kolom itu; yang tidak memakainya adalah
tampilan laporan.

### Catatan komponen 13

Regulasi menuntut hasil asli **dan** hasil yang diperbaiki dua-duanya ada. Ini
sejalan dengan tuntutan integritas PMK 24/2022. GeuLIS sekarang menimpa nilai
lama saat hasil dikoreksi (`UPDATE lab_results SET result_value=...` di
[results.js](../backend/src/routes/results.js)), dan **ikut menimpa `result_at`
dengan `NOW()`** — sehingga bukan hanya nilai aslinya hilang, waktu pemeriksaan
aslinya pun hilang. Tidak ada tabel riwayat.

---

## 4. Penyimpanan dokumen (PMK 43/2013 Bab IX C)

> Berkas laboratorium disimpan selama **5 tahun**.
> Semua dokumen yang disimpan harus asli dan harus ada **bukti verifikasi pada
> dokumen dengan tanda tangan oleh penanggungjawab/supervisor laboratorium**.

Perhatikan: 5 tahun di PMK 43/2013 untuk berkas laboratorium, sementara
PMK 24/2022 menetapkan 25 tahun untuk rekam medis elektronik. Yang lebih baru
dan lebih panjang yang dipakai untuk data di dalam LIS.

---

## Ringkasan celah

| # | Celah | Dasar | Keadaan |
|---|---|---|---|
| 1 | Cadangan belum di luar lokasi | PMK 24/2022 Ps. 20 (5) a | **belum** |
| 2 | Nilai rujukan tidak tercetak di laporan | PMK 43/2013 komp. 9 | selesai 2026-09-03 |
| 3 | Koreksi menimpa hasil asli | komp. 13 + PMK 24/2022 Ps. 29 | selesai 2026-09-03 |
| 4 | Penghapusan permanen vs retensi 25 tahun | PMK 24/2022 Ps. 39 | **belum** |
| 5 | Identitas pemverifikasi tidak tercetak | komp. 12 & 14, Ps. 16 (2) | selesai 2026-09-03 |
| 6 | Pemohon, waktu sampling, jenis spesimen | komp. 4, 5, 7, 11 | selesai 2026-09-03 |
| 7 | Westgard belum menyilang antar level | PMK 43/2013 hlm. 123 | selesai 2026-09-03 |
| 8 | Pemantapan mutu eksternal | PMK 411/2010 Ps. 6 a | selesai 2026-09-03 |
| 9 | Hak akses tidak dipisah | PMK 24/2022 Ps. 30 (3) | selesai 2026-09-03 |
| 10 | Interoperabilitas platform Kemenkes | PMK 24/2022 Ps. 21 | **belum** |

### Yang sudah dikerjakan, ringkasnya

- **Riwayat perbaikan hasil** — tabel `lab_result_revisions` menyimpan nilai,
  satuan, flag, dan waktu SEBELUM perbaikan, beserta siapa dan alasannya.
  `result_at` tidak lagi ditimpa, jadi waktu pemeriksaan asli tetap utuh.
  Laporan menandai hasil yang pernah diperbaiki dengan superskrip `R`.
- **Hak akses dipisah** — hak baru `results.correct` untuk memperbaiki dan
  menghapus. Diberikan otomatis ke peran yang sudah punya `results.manage`
  supaya tidak ada yang kehilangan kemampuan saat pembaruan dipasang; admin
  tinggal mencabutnya dari peran yang tidak seharusnya.
- **Laporan** — dokter pemohon, ruangan, jenis spesimen, waktu pengambilan,
  waktu diterima lab, catatan spesimen, serta nama dan waktu pemverifikasi.
  Datanya mengalir dari SIMRS: Khanza sebenarnya sudah mengirim nama dokter dan
  poli, hanya dititipkan sebagai kalimat di dalam `notes`; kini terstruktur.
- **Westgard menyilang antar level** — 2-2s dan R-4s kini juga dinilai terhadap
  bahan kontrol level lain dalam run yang sama (jendela 120 menit), sesuai
  andaian regulasi bahwa tiap hari dijalankan kontrol rendah dan tinggi.
- **PME** — pendaftaran program, pencatatan hasil, dan penilaian SDI
  (≤2 baik, 2–3 ragu, >3 buruk).

### Yang tersisa

1. **Cadangan ke luar mesin** — paling murah, dan satu-satunya yang berbunyi
   "wajib" di antara sisa ini.
2. **Penghapusan bertanda** menggantikan `DELETE` permanen di 5 tempat.
3. **Interoperabilitas platform Kemenkes** — proyek tersendiri: butuh
   pendaftaran fasilitas, kredensial, dan pemetaan ke LOINC/FHIR.

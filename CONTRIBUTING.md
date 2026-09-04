# Menyumbang ke GeuLIS

Terima kasih sudah tertarik. Dokumen ini pendek dan berisi hal yang benar-benar
perlu Anda ketahui sebelum mengirim perubahan.

## Sebelum apa pun: ini perangkat lunak yang dipakai pada pasien

GeuLIS berjalan di laboratorium rumah sakit yang sesungguhnya. Kode di sini
menandai nilai kritis, memilih nilai rujukan, dan mencetak laporan hasil yang
dipakai dokter untuk mengambil keputusan.

Sebagian besar kesalahan pada perangkat lunak seperti ini **tidak memunculkan
galat apa pun**. Alat tetap mengirim hasil, sistem tetap menandainya, laporan
tetap tercetak — hanya angkanya yang salah, dan itu baru ketahuan setelah ada
yang bertindak atas dasarnya. Karena itu tinjauan di sini lebih rewel daripada
di kebanyakan proyek, terutama untuk perubahan yang menyentuh:

- penilaian hasil terhadap nilai rujukan dan nilai kritis
- penguraian pesan alat (HL7, ASTM)
- pencocokan hasil ke pasien
- verifikasi, pengesahan, dan pencetakan laporan

Perubahan pada bagian itu perlu disertai uji yang menunjukkan perilaku
lamanya salah dan perilaku barunya benar.

## Perjanjian Lisensi Kontributor (CLA)

**Dengan mengirim perubahan, Anda menyatakan:**

1. Anda pemilik hak cipta atas perubahan itu, atau berwenang menyumbangkannya.
2. Anda memberi Salim Mulyana **lisensi permanen, mendunia, non-eksklusif,
   bebas royalti, dan boleh dilisensikan ulang (sublicensable)** untuk memakai,
   menyalin, mengubah, dan menyebarkan sumbangan Anda — **termasuk melisensikan
   ulang di bawah ketentuan lain**.
3. Anda tetap memegang hak cipta atas sumbangan Anda dan bebas memakainya untuk
   keperluan lain.

**Kenapa poin 2 ada, dan apa artinya untuk Anda.** Pemegang hak cipta memelihara
juga perangkat lunak lain yang tidak berlisensi AGPL. Tanpa hak melisensikan
ulang, satu sumbangan dari luar akan mengunci kode itu pada AGPL saja, dan
proyek ini kehilangan kemampuan menempuh dua jalur. Ini disebutkan terus terang
supaya Anda bisa memutuskan dengan sadar: kalau Anda **tidak** ingin sumbangan
Anda mungkin dipakai dalam produk tertutup, jangan mengirimkannya — dan itu
pilihan yang sah sepenuhnya. Anda tetap bebas memelihara fork AGPL Anda sendiri;
AGPL menjamin hak itu dan tidak ada yang bisa mencabutnya.

Sumbangan Anda kepada publik tetap terbit di bawah AGPL-3.0.

## Cara mengirim perubahan

1. Jelaskan **masalahnya** lebih dulu, bukan solusinya. Untuk perubahan besar,
   buka isu dulu sebelum menulis kode.
2. Satu perubahan satu pokok soal.
3. Pesan commit menjelaskan **kenapa**, bukan hanya apa. Yang membaca kode enam
   bulan lagi bisa melihat apa yang berubah; yang tidak bisa ia lihat adalah
   alasannya.
4. Ikuti gaya kode yang sudah ada — komentar seperlunya, penamaan dalam bahasa
   Indonesia untuk hal yang khas laboratorium.
5. **Jangan pernah menyertakan data pasien sungguhan** dalam kode, uji, isu,
   maupun tangkapan layar. Pakai data karangan. Ini bukan formalitas: repositori
   ini pernah nyaris menerbitkan nama pasien sungguhan lewat berkas dump.

## Melaporkan celah keamanan

Jangan buka isu publik. Kirim surel ke pemelihara. Perangkat lunak ini berjalan
di rumah sakit; celah yang diumumkan sebelum ada perbaikan memaparkan data
pasien nyata.

## Yang paling dibutuhkan

- Dukungan alat laboratorium lain, **disertai rekaman lalu lintas jaringan
  sungguhan**. Manual pabrikan sering keliru — pemetaan Mindray di proyek ini
  berbeda dari manualnya, dan yang benar adalah yang terekam dari alatnya.
- Terjemahan pesan kesalahan.
- Uji untuk jalur yang belum teruji.

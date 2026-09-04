# Bridging SIMRS Khanza ↔ GeuLIS

Menghubungkan SIMRS Khanza dengan GeuLIS: permintaan lab dikirim dari SIMRS ke LIS,
hasilnya ditarik kembali ke SIMRS.

Sisi LIS: [`backend/src/routes/bridging.js`](../backend/src/routes/bridging.js).
Sisi SIMRS: `src/bridging/ApiGEULIS.java` pada source SIMRS-Khanza (branch
`feat/bridging-geulis`).

---

## 1. Alur

```
SIMRS  ──POST /api/bridging/order────────▶  GeuLIS   (kirim permintaan)
SIMRS  ──GET  /api/bridging/result/{no}─▶  GeuLIS   (tarik hasil)
```

Menu di **Permintaan Lab → klik kanan**: "Kirim Permintaan ke GeuLIS" dan
"Ambil Hasil dari GeuLIS", sejajar dengan LICA/MEDQLAB yang sudah ada.

Hasil yang ditarik **tidak langsung masuk rekam medis**. Ia mendarat di tabel
singgahan `temporary_permintaan_lab`, lalu form *Periksa Laboratorium* terbuka
dengan nilai yang sudah terisi. Petugas memeriksa dan menyimpan seperti biasa.

## 2. Alamat endpoint — perhatikan baik-baik

```
HOSTWSGEULIS = http://192.168.1.14:5173/api/bridging
```

> **Jangan pakai `/bridging` tanpa awalan `/api` di port web.** Rute itu jatuh ke
> fallback SPA dan membalas **HTML dengan status 200** — pemanggil mengira
> berhasil padahal permintaan tidak pernah sampai ke API. `ApiGEULIS` mendeteksi
> balasan yang diawali `<` dan menolaknya, tetapi lebih baik alamatnya benar sejak
> awal.

Alternatif langsung ke backend (melewati nginx): `http://192.168.1.14:3001/bridging`.
Keduanya berfungsi; yang lewat nginx lebih disarankan agar port 3001 tidak perlu
dibuka ke jaringan.

## 3. Konfigurasi di SIMRS

Tambahkan dua baris ke `setting/database.xml` pada folder SIMRS:

```xml
<entry key="HOSTWSGEULIS">http://192.168.1.14:5173/api/bridging</entry>
<entry key="KEYWSGEULIS">&lt;API key GeuLIS, terenkripsi AES&gt;</entry>
```

`KEYWSGEULIS` **wajib terenkripsi AES**, sama seperti `KEYWSLICA` dan key bridging
lainnya — `koneksiDB.KEYWSGEULIS()` memanggil `EnkripsiAES.decrypt()`. Nilai mentah
tidak akan bekerja.

Cara membangkitkan nilai terenkripsi dari API key GeuLIS:

```bash
# dari folder SIMRS-Khanza
cat > /tmp/GenKey.java <<'EOF'
import AESsecurity.EnkripsiAES;
public class GenKey {
    public static void main(String[] a) throws Exception {
        System.out.println(EnkripsiAES.encrypt(a[0]));
    }
}
EOF
CP="KhanzaSecurity16bit/build/classes:$(find . -name '*.jar' ! -name '*-src.jar' | tr '\n' ':')"
javac -cp "$CP" -d /tmp /tmp/GenKey.java
java -cp "/tmp:$CP" GenKey <API_KEY_GEULIS>
```

API key GeuLIS dibuat dan dilihat di menu **Pengaturan → API Key** pada web LIS.

## 4. Pemetaan kode pemeriksaan

Yang dikirim SIMRS sebagai kode tes adalah **`id_template`** dari
`permintaan_detail_permintaan_lab`, bukan nama pemeriksaan — supaya pemetaan tidak
rusak ketika nama pemeriksaan diedit di SIMRS.

Di GeuLIS, isi tabel pemetaan lewat menu **Mapping SIMRS** (`simrs_mappings`,
`mapping_type = 'test'`):

| Kolom | Isi |
|---|---|
| `simrs_field` | `id_template` dari SIMRS |
| `lis_field` | kode tes di GeuLIS (mis. `WBC`, `HGB`) |

Pemetaan ini dipakai dua arah: saat order masuk (menerjemahkan `id_template` ke
kode tes LIS) dan saat hasil ditarik (endpoint mengembalikannya sebagai
`code_simrs`).

**Tanpa pemetaan, hasil tidak bisa ditarik** — `ApiGEULIS` melewati baris yang
`code_simrs`-nya kosong dan melaporkan jumlah yang dilewati.

## 5. Aturan penarikan hasil

Hanya hasil berstatus **`completed`** yang ditarik, yaitu yang sudah diverifikasi
petugas di GeuLIS. Hasil `preliminary` (sudah ada angka tetapi belum diverifikasi)
sengaja dilewati, agar nilai yang belum disahkan tidak masuk rekam medis pasien.

Kalau petugas menarik hasil terlalu cepat, muncul pesan bahwa belum ada hasil yang
diverifikasi — bukan tabel kosong tanpa penjelasan.

## 6. Kontrak API

### POST `/api/bridging/order`

Header: `x-api-key: <API key>`

```json
{
  "simrs_order_id": "PL202609030001",
  "medical_record_no": "000123",
  "patient_name": "BUDI SANTOSO",
  "gender": "L",
  "birth_date": "1990-01-01",
  "priority": "normal",
  "notes": "[ralan] Poli Umum - dr. Andi - Anemia",
  "tests": ["12", "15", "18"]
}
```

Balasan `201` berisi `data.request_no`. Balasan `409` berarti `simrs_order_id`
sudah pernah dikirim.

### GET `/api/bridging/result/{simrs_order_id}`

```json
{
  "simrs_order_id": "PL202609030001",
  "request_no": "REQ20260903123456",
  "status": "completed",
  "patient": { "medical_record_no": "000123", "name": "BUDI SANTOSO" },
  "results": [
    {
      "test_code": "WBC", "code_simrs": "12", "test_name": "Leukosit",
      "result_value": "7.25", "unit": "10*9/L", "reference": "4.0 - 10.0",
      "flag": "normal", "status": "completed"
    }
  ]
}
```

`status` per pemeriksaan: `pending` (belum ada hasil), `preliminary` (ada hasil,
belum diverifikasi), `completed` (sudah diverifikasi).

## 7. Kalau bermasalah

| Gejala | Sebab |
|---|---|
| "server membalas halaman web, bukan API" | `HOSTWSGEULIS` salah — harus berakhiran `/api/bridging` |
| "API Key GeuLIS ditolak" | `KEYWSGEULIS` salah, atau lupa dienkripsi AES |
| "sudah pernah dikirim ke GeuLIS" | `simrs_order_id` sama dikirim dua kali (HTTP 409) |
| Hasil ditarik tapi kosong semua | Belum diverifikasi di GeuLIS, atau `id_template` belum dipetakan |
| "Koneksi ke server GeuLIS terputus" | Jaringan, atau backend LIS mati — cek `pm2 status` di server |

Semua permintaan yang masuk tercatat di log audit GeuLIS (menu **Log Audit**,
sumber `bridging`).

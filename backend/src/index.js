import express from 'express';
import { pasangTangkapAsync } from './tangkapAsync.js';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import patientRoutes from './routes/patients.js';
import requestRoutes from './routes/requests.js';
import resultRoutes from './routes/results.js';
import userRoutes from './routes/users.js';
import instrumentRoutes from './routes/instruments.js';
import mappingRoutes from './routes/mapping.js';
import testRoutes from './routes/tests.js';
import settingsRoutes from './routes/settings.js';
import apiKeysRoutes from './routes/apiKeys.js';
import bridgingRoutes from './routes/bridging.js';
import qcRoutes from './routes/qc.js';
import pmeRoutes from './routes/pme.js';
import unmatchedRoutes from './routes/unmatched.js';
import auditRoutes from './routes/audit.js';
import rujukanRoutes from './routes/rujukan.js';
import verifSpesimenRoutes from './routes/verifSpesimen.js';
import duploRoutes from './routes/duplo.js';
import naratifRoutes from './routes/naratif.js';
import laporanRekapRoutes from './routes/laporanRekap.js';
import bankDarahRoutes from './routes/bankDarah.js';
import mikrobiologiRoutes from './routes/mikrobiologi.js';
import monitoringRoutes from './routes/monitoring.js';
import pengesahanRoutes from './routes/pengesahan.js';
import pindaiRoutes from './routes/pindai.js';
import laporanRoutes from './routes/laporan.js';
import reagenRoutes from './routes/reagen.js';
import konteksVerifikasiRoutes from './routes/konteksVerifikasi.js';
import loincRoutes from './routes/loinc.js';
import interpretasiRoutes from './routes/interpretasi.js';
import portalRoutes from './routes/portal.js';
import ttdRoutes, { rutePublik as ttdPublik } from './routes/ttdRoute.js';
import { startInstrumentListeners } from './services/instrumentListener.js';
import { ensureSeed } from './ensureSeed.js';
import { ensureSchema } from './ensureSchema.js';

dotenv.config();

// Dipasang sebelum rute apa pun didaftarkan: menambal Router agar galat dari
// handler async diteruskan ke penangan galat, bukan mematikan proses.
pasangTangkapAsync();

const app = express();
// JWT_SECRET wajib ada. Sebelumnya jwt.sign/verify punya cadangan 'dev-secret',
// sehingga bila .env hilang atau tertimpa aplikasi TETAP JALAN memakai secret yang
// diketahui umum — siapa pun bisa membuat token admin palsu, tanpa gejala apa pun.
// Lebih baik menolak start daripada jalan dalam keadaan tidak aman secara diam-diam.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET tidak ada atau terlalu pendek di backend/.env.');
  console.error('        Bangkitkan dengan: openssl rand -hex 32');
  process.exit(1);
}

const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_, res) => res.json({ status: 'ok', service: 'GeuLIS' }));

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/users', userRoutes);
app.use('/api/instruments', instrumentRoutes);
app.use('/api/mapping', mappingRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/api-keys', apiKeysRoutes);
// Bridging SIMRS. Dipasang di /api/bridging supaya bisa lewat nginx (yang hanya
// mem-proxy /api/), sekaligus tetap di /bridging demi kompatibilitas integrasi lama.
// Tanpa /api/bridging, permintaan ke port 5173 jatuh ke fallback SPA dan membalas
// HTML dengan status 200 — pemanggil mengira berhasil padahal tidak pernah sampai.
app.use('/api/bridging', bridgingRoutes);
app.use('/bridging', bridgingRoutes);
app.use('/api/qc', qcRoutes);
app.use('/api/pme', pmeRoutes);
app.use('/api/unmatched', unmatchedRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/rujukan', rujukanRoutes);
app.use('/api/verif-spesimen', verifSpesimenRoutes);
app.use('/api/duplo', duploRoutes);
app.use('/api/naratif', naratifRoutes);
app.use('/api/laporan/rekap', laporanRekapRoutes);
app.use('/api/bank-darah', bankDarahRoutes);
app.use('/api/mikrobiologi', mikrobiologiRoutes);
app.use('/api/dashboard/monitoring', monitoringRoutes);
app.use('/api/pengesahan', pengesahanRoutes);
app.use('/api/pindai', pindaiRoutes);
app.use('/api/laporan', laporanRoutes);
app.use('/api/reagen', reagenRoutes);
app.use('/api/konteks-verifikasi', konteksVerifikasiRoutes);
app.use('/api/loinc', loincRoutes);
app.use('/api/interpretasi', interpretasiRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/ttd', ttdRoutes);

// Verifikasi QR, publik dan tanpa login.
//
// DIPASANG DI BAWAH /api, bukan di /verifikasi. Alamat /verifikasi/<kode>
// adalah HALAMAN yang dibuka saat QR dipindai, dan halaman itu disajikan
// frontend. Bila backend juga memakai alamat yang sama, permintaan dari
// peramban jatuh ke SPA dan mengembalikan index.html alih-alih JSON — QR
// terlihat berfungsi saat diuji dengan curl langsung ke backend, lalu gagal
// diam-diam begitu dipakai orang.
app.use('/api/verifikasi', ttdPublik);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

// Dengar hanya di localhost. Nginx yang menghadap jaringan dan mem-proxy /api,
// sehingga API tidak lagi bisa dihubungi langsung di port 3001 dari luar —
// itu melewati seluruh konfigurasi nginx dan memperlebar permukaan serangan.
// Bisa ditimpa lewat BIND_HOST bila memang perlu, mis. untuk diagnosis.
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';

app.listen(PORT, BIND_HOST, async () => {
  console.log(`GeuLIS API http://${BIND_HOST}:${PORT}`);
  try {
    await ensureSchema();
  } catch (e) {
    console.warn('[schema] Migrasi skema:', e.message);
  }
  try {
    await ensureSeed();
  } catch (e) {
    console.warn('[seed] Gagal set password default:', e.message);
  }
  try {
    await startInstrumentListeners();
  } catch (e) {
    console.warn('Instrument listeners:', e.message);
  }
});

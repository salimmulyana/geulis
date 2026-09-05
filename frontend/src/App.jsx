import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Requests from './pages/Requests';
import Patients from './pages/Patients';
import Results from './pages/Results';
import Tests from './pages/Tests';
import Users from './pages/Users';
import Mapping from './pages/Mapping';
import Instruments from './pages/Instruments';
import Settings from './pages/Settings';
import Audit from './pages/Audit';
import Manual from './pages/Manual';
import NilaiRujukan from './pages/NilaiRujukan';
import VerifSpesimen from './pages/VerifSpesimen';
import Duplo from './pages/Duplo';
import Naratif from './pages/Naratif';
import LaporanRekap from './pages/LaporanRekap';
import BankDarah from './pages/BankDarah';
import Mikrobiologi from './pages/Mikrobiologi';
import PortalPasien from './pages/PortalPasien';
import VerifikasiDokumen from './pages/VerifikasiDokumen';
import Unmatched from './pages/Unmatched';
import QualityControl from './pages/QualityControl';
import PME from './pages/PME';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Memuat...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Publik: tanpa login, tanpa sidebar, dan sengaja di luar Layout.
          Pasien yang membukanya di komputer lab tidak boleh melihat menu
          petugas, apalagi mewarisi sesinya. */}
      <Route path="/portal" element={<PortalPasien />} />
      <Route path="/verifikasi/:kode" element={<VerifikasiDokumen />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="requests" element={<Requests />} />
        <Route path="patients" element={<Patients />} />
        <Route path="results" element={<Results />} />
        <Route path="tests" element={<Tests />} />
        <Route path="users" element={<Users />} />
        <Route path="mapping" element={<Mapping />} />
        <Route path="instruments" element={<Instruments />} />
        <Route path="settings" element={<Settings />} />
        <Route path="audit" element={<Audit />} />
        <Route path="unmatched" element={<Unmatched />} />
        <Route path="qc" element={<QualityControl />} />
        <Route path="pme" element={<PME />} />
        <Route path="nilai-rujukan" element={<NilaiRujukan />} />
        <Route path="verif-spesimen" element={<VerifSpesimen />} />
        <Route path="duplo" element={<Duplo />} />
        <Route path="naratif" element={<Naratif />} />
        <Route path="laporan-rekap" element={<LaporanRekap />} />
        <Route path="bank-darah" element={<BankDarah />} />
        <Route path="mikrobiologi" element={<Mikrobiologi />} />

        <Route path="manual/:doc" element={<Manual />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

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
        <Route path="manual/:doc" element={<Manual />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

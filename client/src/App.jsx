import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast.jsx';
import { AuthProvider, Protected } from './components/Auth.jsx';
import Login from './pages/Login.jsx';
import Users from './pages/Users.jsx';
import Backup from './pages/Backup.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';
import Viewer from './pages/Viewer.jsx';
import Admin from './pages/Admin.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Records from './pages/Records.jsx';
import ImportPage from './pages/ImportPage.jsx';
import Fields from './pages/Fields.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected publicOk><Viewer /></Protected>} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/records" element={<Protected><Records /></Protected>} />
          <Route path="/import" element={<Protected min="operator"><ImportPage /></Protected>} />
          <Route path="/fields" element={<Protected min="admin"><Fields /></Protected>} />
          <Route path="/admin" element={<Protected min="admin"><Admin /></Protected>} />
          <Route path="/reports" element={<Protected><Reports /></Protected>} />
          <Route path="/settings" element={<Protected min="admin"><Settings /></Protected>} />
          <Route path="/users" element={<Protected min="admin"><Users /></Protected>} />
          <Route path="/backup" element={<Protected min="admin"><Backup /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

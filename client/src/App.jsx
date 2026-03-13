import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import { ToastProvider } from './components/Toast';
import PinDialog from './components/PinDialog';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Fees from './pages/Fees';
import Payments from './pages/Payments';
import StatementOfAccount from './pages/StatementOfAccount';
import SOAPrintPage from './pages/SOAPrintPage';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Users from './pages/Users';

function PinGate({ children, onMenuClick }) {
  const { settingsUnlocked, unlockSettings, hasRole } = useAuth();
  const navigate = useNavigate();

  if (!hasRole('Admin')) return <Navigate to="/" replace />;

  if (!settingsUnlocked) {
    return (
      <PinDialog
        onSuccess={unlockSettings}
        onCancel={() => navigate(-1)}
      />
    );
  }

  return typeof children === 'function' ? children() : children;
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated, loading, hasRole } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-[#6B9DB5] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <Routes>
        {/* Login page — always accessible */}
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />

        {/* Standalone print page */}
        <Route path="/soa/print/:studentId" element={isAuthenticated ? <SOAPrintPage /> : <Navigate to="/login" replace />} />

        {/* App layout with sidebar */}
        <Route path="*" element={
          isAuthenticated ? (
            <div className="flex h-screen overflow-hidden">
              <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
              <main className="flex-1 overflow-y-auto">
                <Routes>
                  <Route path="/" element={<Dashboard onMenuClick={() => setSidebarOpen(true)} />} />
                  <Route path="/students" element={<Students onMenuClick={() => setSidebarOpen(true)} />} />
                  <Route path="/students/:studentId" element={<StudentDetail onMenuClick={() => setSidebarOpen(true)} />} />
                  <Route path="/fees" element={<Fees onMenuClick={() => setSidebarOpen(true)} />} />
                  <Route path="/payments" element={<Payments onMenuClick={() => setSidebarOpen(true)} />} />
                  <Route path="/soa" element={<StatementOfAccount onMenuClick={() => setSidebarOpen(true)} />} />
                  <Route path="/reports" element={<Reports onMenuClick={() => setSidebarOpen(true)} />} />
                  <Route path="/settings" element={
                    <PinGate>
                      <Settings onMenuClick={() => setSidebarOpen(true)} />
                    </PinGate>
                  } />
                  <Route path="/users" element={
                    <PinGate>
                      <Users onMenuClick={() => setSidebarOpen(true)} />
                    </PinGate>
                  } />
                </Routes>
              </main>
            </div>
          ) : (
            <Navigate to="/login" replace />
          )
        } />
      </Routes>
    </ToastProvider>
  );
}

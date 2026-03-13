import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { ToastProvider } from './components/Toast';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Fees from './pages/Fees';
import Payments from './pages/Payments';
import StatementOfAccount from './pages/StatementOfAccount';
import SOAPrintPage from './pages/SOAPrintPage';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ToastProvider>
      <Routes>
        {/* Standalone print page — NO app layout */}
        <Route path="/soa/print/:studentId" element={<SOAPrintPage />} />

        {/* App layout with sidebar */}
        <Route path="*" element={
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
                <Route path="/settings" element={<Settings onMenuClick={() => setSidebarOpen(true)} />} />
              </Routes>
            </main>
          </div>
        } />
      </Routes>
    </ToastProvider>
  );
}

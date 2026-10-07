import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Shell from './shell';
import LoginPage from './pages/Login';
import OverviewPage from './pages/Overview';
import ClientsPage from './pages/Clients';
import ClientDetailPage from './pages/ClientDetail';
import LeadsPage from './pages/Leads';
import StatsPage from './pages/Stats';
import PlansPage from './pages/Plans';
import InvoicesPage from './pages/Invoices';
import AuditPage from './pages/Audit';

function Guard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="bo-boot">Se încarcă…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="bo-boot">Se încarcă…</div>;

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/*"
        element={
          <Guard>
            <Shell>
              <Routes>
                <Route index element={<OverviewPage />} />
                <Route path="clients" element={<ClientsPage />} />
                <Route path="clients/:id" element={<ClientDetailPage />} />
                <Route path="leads" element={<LeadsPage />} />
                <Route path="stats" element={<StatsPage />} />
                <Route path="plans" element={<PlansPage />} />
                <Route path="pipeline" element={<InvoicesPage />} />
                <Route path="invoices" element={<Navigate to="/pipeline" replace />} />
                <Route path="audit" element={<AuditPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          </Guard>
        }
      />
    </Routes>
  );
}

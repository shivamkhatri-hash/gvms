import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Users } from './pages/Users';
import { Reports } from './pages/Reports';
import { MetabaseView } from './pages/MetabaseView';
import { Settings } from './pages/Settings';
import { Logs } from './pages/Logs';
import { GasChromatographyDashboard } from './pages/GasChromatographyDashboard';
import { OilCompositionDashboard } from './pages/OilCompositionDashboard';
import { GasIsotopeDashboard } from './pages/GasIsotopeDashboard';
import { SteraneDashboard } from './pages/SteraneDashboard';
import { HopaneDashboard } from './pages/HopaneDashboard';
import { TricyclicDashboard } from './pages/TricyclicDashboard';
import { AromaticDashboard } from './pages/AromaticDashboard';
import { PrPhDashboard } from './pages/PrPhDashboard';
import { DynamicDashboard } from './pages/DynamicDashboard';
import { Spinner } from './components/common/Spinner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes cache
    },
  },
});

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ongc-bg flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="dynamic-dashboard" element={<DynamicDashboard />} />
              <Route
                path="metabase"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'researcher']}>
                    <MetabaseView />
                  </ProtectedRoute>
                }
              />
              <Route path="reports" element={<Reports />} />

              {/* Oil Laboratory Module Routing */}
              <Route path="oil/dashboard" element={<GasChromatographyDashboard />} />
              <Route path="oil/composition-dashboard" element={<OilCompositionDashboard />} />
              <Route path="oil/reports" element={<Reports module="oil" />} />

              {/* Isotope Laboratory Module Routing */}
              <Route path="isotope/dashboard" element={<GasIsotopeDashboard />} />
              <Route path="isotope/reports" element={<Reports module="isotope" />} />

              {/* Biomarker Laboratory Module Routing */}
              <Route path="biomarker/sterane-dashboard" element={<SteraneDashboard />} />
              <Route path="biomarker/hopane-dashboard" element={<HopaneDashboard />} />
              <Route path="biomarker/tricyclic-dashboard" element={<TricyclicDashboard />} />
              <Route path="biomarker/aromatic-dashboard" element={<AromaticDashboard />} />
              <Route path="biomarker/pr-ph-dashboard" element={<PrPhDashboard />} />
              <Route path="biomarker/reports" element={<Reports module="biomarker" />} />
              <Route
                path="users"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Users />
                  </ProtectedRoute>
                }
              />
              <Route
                path="logs"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Logs />
                  </ProtectedRoute>
                }
              />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;

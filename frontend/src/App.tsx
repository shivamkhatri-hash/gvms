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
import { InorganicDashboard } from './pages/InorganicDashboard';
import { SurfaceDashboard } from './pages/SurfaceDashboard';
import { OilCrossPlotDashboard } from './pages/OilCrossPlotDashboard';
import { Spinner } from './components/common/Spinner';
import { LabRouteGuard } from './components/common/LabRouteGuard';

import { hasLabAccess, getFirstAccessibleRoute } from './utils/rbac';

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
    const fallback = getFirstAccessibleRoute(user);
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};

const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ongc-bg flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isAuthenticated) {
    const fallback = getFirstAccessibleRoute(user);
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};

const RootIndexRoute: React.FC = () => {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (hasLabAccess(user, 'source-rock')) {
    return (
      <LabRouteGuard labKey="source-rock" labName="Core Lab">
        <Dashboard />
      </LabRouteGuard>
    );
  }

  const targetRoute = getFirstAccessibleRoute(user);
  if (targetRoute && targetRoute !== '/') {
    return <Navigate to={targetRoute} replace />;
  }

  return (
    <LabRouteGuard labKey="source-rock" labName="Core Lab">
      <Dashboard />
    </LabRouteGuard>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <Login />
                </PublicOnlyRoute>
              }
            />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              {/* Root / Source Rock Laboratory Module Routing */}
              <Route
                index
                element={<RootIndexRoute />}
              />
              <Route
                path="dynamic-dashboard"
                element={
                  <LabRouteGuard labKey="analytics" labName="Analytics">
                    <DynamicDashboard />
                  </LabRouteGuard>
                }
              />
              <Route
                path="metabase"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'researcher']}>
                    <LabRouteGuard labKey="analytics" labName="Analytics">
                      <MetabaseView />
                    </LabRouteGuard>
                  </ProtectedRoute>
                }
              />
              <Route path="reports" element={<Reports />} />

              {/* Oil Laboratory Module Routing */}
              <Route
                path="oil/dashboard"
                element={
                  <LabRouteGuard labKey="oil" labName="Oil Lab">
                    <GasChromatographyDashboard />
                  </LabRouteGuard>
                }
              />
              <Route
                path="oil/composition-dashboard"
                element={
                  <LabRouteGuard labKey="oil" labName="Oil Lab">
                    <OilCompositionDashboard />
                  </LabRouteGuard>
                }
              />
              <Route
                path="oil/cross-plot"
                element={
                  <LabRouteGuard labKey="oil" labName="Oil Lab">
                    <OilCrossPlotDashboard />
                  </LabRouteGuard>
                }
              />
              <Route
                path="oil/reports"
                element={
                  <LabRouteGuard labKey="oil" labName="Oil Lab">
                    <Reports module="oil" />
                  </LabRouteGuard>
                }
              />

              {/* Isotope Laboratory Module Routing */}
              <Route
                path="isotope/dashboard"
                element={
                  <LabRouteGuard labKey="isotope" labName="Isotope Lab">
                    <GasIsotopeDashboard />
                  </LabRouteGuard>
                }
              />
              <Route
                path="isotope/reports"
                element={
                  <LabRouteGuard labKey="isotope" labName="Isotope Lab">
                    <Reports module="isotope" />
                  </LabRouteGuard>
                }
              />

              {/* IGC (Inorganic Geochemistry) Laboratory Module Routing */}
              <Route
                path="igc/dashboard"
                element={
                  <LabRouteGuard labKey="igc" labName="Inorganic Lab">
                    <InorganicDashboard />
                  </LabRouteGuard>
                }
              />

              {/* Surface Geochemistry / MBER Module Routing */}
              <Route
                path="surface/dashboard"
                element={
                  <LabRouteGuard labKey="surface" labName="Surface Lab">
                    <SurfaceDashboard />
                  </LabRouteGuard>
                }
              />

              {/* Biomarker Laboratory Module Routing */}
              <Route
                path="biomarker/sterane-dashboard"
                element={
                  <LabRouteGuard labKey="biomarker" labName="Biomarker Lab">
                    <SteraneDashboard />
                  </LabRouteGuard>
                }
              />
              <Route
                path="biomarker/hopane-dashboard"
                element={
                  <LabRouteGuard labKey="biomarker" labName="Biomarker Lab">
                    <HopaneDashboard />
                  </LabRouteGuard>
                }
              />
              <Route
                path="biomarker/tricyclic-dashboard"
                element={
                  <LabRouteGuard labKey="biomarker" labName="Biomarker Lab">
                    <TricyclicDashboard />
                  </LabRouteGuard>
                }
              />
              <Route
                path="biomarker/aromatic-dashboard"
                element={
                  <LabRouteGuard labKey="biomarker" labName="Biomarker Lab">
                    <AromaticDashboard />
                  </LabRouteGuard>
                }
              />
              <Route
                path="biomarker/pr-ph-dashboard"
                element={
                  <LabRouteGuard labKey="biomarker" labName="Biomarker Lab">
                    <PrPhDashboard />
                  </LabRouteGuard>
                }
              />
              <Route
                path="biomarker/reports"
                element={
                  <LabRouteGuard labKey="biomarker" labName="Biomarker Lab">
                    <Reports module="biomarker" />
                  </LabRouteGuard>
                }
              />
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

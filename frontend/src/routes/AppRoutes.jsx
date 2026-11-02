import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import Home from '../pages/Home';

const InstructorsPage = lazy(() => import('../pages/InstructorsPage'));
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'));
const ClientProfilePage = lazy(() => import('../pages/client/ClientProfilePage'));
const ClientProgressPage = lazy(() => import('../pages/client/ClientProgressPage'));
const ClientSchedulePage = lazy(() => import('../pages/client/ClientSchedulePage'));
const InstructorProgressPage = lazy(() => import('../pages/instructor/InstructorProgressPage'));
const InstructorSchedulePage = lazy(() => import('../pages/instructor/InstructorSchedulePage'));

function PageFallback() {
  return (
    <div className="py-12 flex justify-center">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-8 py-6 text-center max-w-md w-full">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-base font-medium text-slate-700">Ładowanie widoku...</p>
      </div>
    </div>
  );
}

function RootEntry() {
  const { isAuthenticated, isLoading, hasRole } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <div className="w-9 h-9 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-300">Inicjalizacja sesji...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    if (hasRole('ROLE_ADMIN')) {
      return <Navigate to="/app/admin" replace />;
    }
    if (hasRole('ROLE_INSTRUCTOR')) {
      return <Navigate to="/app/instructor" replace />;
    }
    if (hasRole('ROLE_CLIENT')) {
      return <Navigate to="/app/client" replace />;
    }
  }

  return <Home />;
}

export default function AppRoutes() {
  return (
    <Layout>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<RootEntry />} />
          <Route path="/instructors" element={<InstructorsPage />} />
          <Route path="/terminy" element={<ClientSchedulePage mode="slots" />} />

          {/* Moduł Administratora */}
          <Route
            path="/app/admin"
            element={
              <ProtectedRoute requiredRole="ROLE_ADMIN">
                <AdminDashboard section="health" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/admin/users"
            element={
              <ProtectedRoute requiredRole="ROLE_ADMIN">
                <AdminDashboard section="users" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/admin/availability"
            element={
              <ProtectedRoute requiredRole="ROLE_ADMIN">
                <AdminDashboard section="availability" />
              </ProtectedRoute>
            }
          />

          {/* Moduł Klienta */}
          <Route path="/app/client" element={<ClientSchedulePage mode="slots" />} />
          <Route
            path="/app/client/reservations"
            element={
              <ProtectedRoute requiredRole="ROLE_CLIENT">
                <ClientSchedulePage mode="reservations" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/client/progress"
            element={
              <ProtectedRoute requiredRole="ROLE_CLIENT">
                <ClientProgressPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/client/profile"
            element={
              <ProtectedRoute requiredRole="ROLE_CLIENT">
                <ClientProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Moduł Instruktora */}
          <Route
            path="/app/instructor"
            element={
              <ProtectedRoute requiredRole="ROLE_INSTRUCTOR">
                <InstructorSchedulePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/instructor/slots/new"
            element={
              <Navigate to="/app/instructor?add=1" replace />
            }
          />
          <Route
            path="/app/instructor/progress"
            element={
              <ProtectedRoute requiredRole="ROLE_INSTRUCTOR">
                <InstructorProgressPage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

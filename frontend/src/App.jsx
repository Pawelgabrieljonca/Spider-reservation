import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LogIn, ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './core/auth';
import AppLayout from './layout/AppLayout';
import HomePage from './pages/HomePage';
import { BTN_DARK, CARD_CLASS } from './ui/common';

const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ClientProgressPage = lazy(() => import('./pages/client/ClientProgressPage'));
const ClientSchedulePage = lazy(() => import('./pages/client/ClientSchedulePage'));
const InstructorProgressPage = lazy(() => import('./pages/instructor/InstructorProgressPage'));
const InstructorSchedulePage = lazy(() => import('./pages/instructor/InstructorSchedulePage'));

const ROUTE_TITLES = {
  '/': 'Centrum Wspinaczkowe Spider Bydgoszcz | Rezerwacja Treningów Online',
  '/terminy': 'Grafik Treningów i Terminy | CW Spider Bydgoszcz',
  '/app/client': 'Grafik Treningów i Terminy | CW Spider Bydgoszcz',
  '/app/client/reservations': 'Moje Rezerwacje | CW Spider',
  '/app/client/progress': 'Dziennik Postępów | CW Spider',
  '/app/client/profile': 'Mój Profil | CW Spider',
  '/app/instructor': 'Grafik Dyżurów | Panel Instruktora CW Spider',
  '/app/instructor/progress': 'Dziennik Podopiecznych | Panel Instruktora CW Spider',
  '/app/instructor/profile': 'Mój Profil Instruktora | CW Spider',
};

function LoadingBox({ title, subtitle, py = 'py-12' }) {
  return (
    <div className={`${py} flex justify-center`}>
      <div className={`${CARD_CLASS} px-8 py-6 text-center max-w-md w-full`}>
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-base font-medium text-slate-700">{title}</p>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

function ProtectedRoute({ requiredRole, children }) {
  const { isAuthenticated, isLoading, hasRole, roles, login } = useAuth();

  if (isLoading) {
    return <LoadingBox py="py-16" title="Weryfikacja sesji logowania..." subtitle="Łączenie z serwerem tożsamości Keycloak" />;
  }

  if (!isAuthenticated) {
    return (
      <div className={`${CARD_CLASS} max-w-md mx-auto my-12 p-6 sm:p-8`}>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Wymagane logowanie</h2>
        <p className="text-base text-slate-600 mb-6 leading-relaxed">
          Ten widok jest dostępny wyłącznie dla zalogowanych użytkowników CW Spider. Zaloguj się, aby zarządzać rezerwacjami lub grafikiem.
        </p>
        <button type="button" onClick={() => login({ redirectUri: window.location.href })} className={`${BTN_DARK} w-full`}>
          <LogIn className="w-5 h-5" />
          <span>Zaloguj przez Keycloak</span>
        </button>
      </div>
    );
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div className="max-w-lg mx-auto my-12 bg-white border border-red-200 rounded-xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2.5 text-red-700 mb-3">
          <ShieldAlert className="w-6 h-6 shrink-0" />
          <h2 className="text-xl font-bold text-slate-900">Brak uprawnień do modułu</h2>
        </div>
        <p className="text-base text-slate-600 mb-4 leading-relaxed">Twoje konto nie posiada wymaganej roli dla tej podstrony:</p>
        <div className="font-mono text-sm bg-red-50 border border-red-200 px-3.5 py-2.5 rounded-lg text-red-900 font-semibold mb-4">{requiredRole}</div>
        <p className="text-sm text-slate-500 mb-2">Twoje przypisane role:</p>
        <div className="flex flex-wrap gap-2">
          {roles.length > 0 ? roles.map((r) => <span key={r} className="text-xs font-mono bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-md">{r}</span>) : <span className="text-sm text-slate-400">Brak przypisanych ról</span>}
        </div>
      </div>
    );
  }

  return children;
}

const wrap = (role, el) => <ProtectedRoute requiredRole={role}>{el}</ProtectedRoute>;

function PageFallback() {
  return <LoadingBox title="Ładowanie widoku..." />;
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
    if (hasRole('ROLE_INSTRUCTOR')) return <Navigate to="/app/instructor" replace />;
    if (hasRole('ROLE_CLIENT')) return <Navigate to="/app/client" replace />;
  }
  return <HomePage />;
}

function AppRoutes() {
  const { pathname } = useLocation();
  useEffect(() => { document.title = ROUTE_TITLES[pathname] || ROUTE_TITLES['/']; }, [pathname]);

  return (
    <AppLayout>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<RootEntry />} />
          <Route path="/terminy" element={<ClientSchedulePage mode="slots" />} />
          <Route path="/app/client" element={<ClientSchedulePage mode="slots" />} />
          <Route path="/app/client/reservations" element={wrap('ROLE_CLIENT', <ClientSchedulePage mode="reservations" />)} />
          <Route path="/app/client/progress" element={wrap('ROLE_CLIENT', <ClientProgressPage />)} />
          <Route path="/app/client/profile" element={wrap('ROLE_CLIENT', <ProfilePage role="client" />)} />
          <Route path="/app/instructor" element={wrap('ROLE_INSTRUCTOR', <InstructorSchedulePage />)} />
          <Route path="/app/instructor/slots/new" element={<Navigate to="/app/instructor?add=1" replace />} />
          <Route path="/app/instructor/progress" element={wrap('ROLE_INSTRUCTOR', <InstructorProgressPage />)} />
          <Route path="/app/instructor/profile" element={wrap('ROLE_INSTRUCTOR', <ProfilePage role="instructor" />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AlertTriangle, LogIn, Menu, User, X } from 'lucide-react';
import { useAuth } from '../core/auth';
import { AlertBanner } from '../ui/common';
import NotificationBell from './NotificationBell';

const PUBLIC_LINKS = [{ to: '/terminy', label: 'Terminy', end: true }];

function Navbar() {
  const { isAuthenticated, userProfile, login, logout, isLoading, hasRole, clearSessionExpiredNotice } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  const isLanding = !isAuthenticated && pathname === '/';
  const isInstructor = hasRole('ROLE_INSTRUCTOR');
  const isClient = hasRole('ROLE_CLIENT') && !isInstructor;
  const closeMobile = () => setMobileOpen(false);
  const handleLogin = () => { clearSessionExpiredNotice?.(); login(); };

  const displayName = userProfile?.firstName
    ? `${userProfile.firstName} ${userProfile.lastName || ''}`.trim()
    : userProfile?.username || userProfile?.email || 'Użytkownik';
  const primaryRoleLabel = isInstructor ? 'Instruktor' : isClient ? 'Klient' : 'Użytkownik';

  const navItems = !isAuthenticated
    ? PUBLIC_LINKS
    : isInstructor
      ? [
          { to: '/app/instructor', label: 'Grafik', end: true },
          { to: '/app/instructor/progress', label: 'Dziennik postępów', end: false },
          { to: '/app/instructor/profile', label: 'Mój profil', end: false },
        ]
      : [
          { to: '/app/client', label: 'Terminy', end: true },
          { to: '/app/client/reservations', label: 'Moje rezerwacje', end: false },
          { to: '/app/client/progress', label: 'Dziennik postępów', end: false },
          { to: '/app/client/profile', label: 'Mój profil', end: false },
        ];

  const linkClass = (base) => ({ isActive }) =>
    `${base} rounded-lg font-medium transition-colors ${isActive ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200'}`;

  if (isLanding) {
    return (
      <header className="absolute top-0 inset-x-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-14 py-4 sm:py-6 md:py-8 flex items-center justify-between gap-3 sm:gap-4">
          <NavLink to="/" onClick={closeMobile} className="inline-flex items-center shrink-0 focus:outline-none" aria-label="Centrum Wspinaczkowe Spider — strona główna">
            <img src="/logospider.png" alt="Centrum Wspinaczkowe Spider" className="h-[72px] sm:h-[104px] md:h-[125px] w-auto object-contain drop-shadow-md" />
          </NavLink>
          <div className="flex items-center gap-2 sm:gap-4">
            <nav className="hidden md:flex items-center gap-1.5 mr-1 sm:mr-2" aria-label="Nawigacja strony startowej">
              {PUBLIC_LINKS.map((l) => (
                <NavLink key={l.to} to={l.to} className="inline-flex items-center min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold text-white/90 hover:text-white hover:bg-white/10 backdrop-blur-sm transition-colors">
                  {l.label}
                </NavLink>
              ))}
            </nav>
            {isLoading ? (
              <span className="text-xs sm:text-sm text-white/80 px-3 py-2">Weryfikacja sesji...</span>
            ) : (
              <button type="button" onClick={handleLogin} className="hidden md:inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-slate-950/40 whitespace-nowrap">
                Zaloguj do panelu
              </button>
            )}
            <button type="button" onClick={() => setMobileOpen((p) => !p)} aria-expanded={mobileOpen} aria-label="Otwórz menu nawigacji" className="md:hidden inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl border border-white/30 bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm">
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <div className="md:hidden border-t border-white/10 bg-slate-950/95 backdrop-blur-md px-5 pt-3 pb-6 space-y-3 shadow-2xl">
            <nav className="flex flex-col gap-1.5" aria-label="Menu mobilne start">
              {PUBLIC_LINKS.map((l) => (
                <NavLink key={l.to} to={l.to} onClick={closeMobile} className="flex items-center min-h-[44px] px-4 py-2.5 rounded-xl text-base font-semibold text-white hover:bg-white/10">
                  {l.label}
                </NavLink>
              ))}
            </nav>
            <div className="pt-3 border-t border-white/10">
              <button type="button" onClick={() => { closeMobile(); handleLogin(); }} className="w-full inline-flex items-center justify-center min-h-[46px] px-4 py-2.5 text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg">
                Zaloguj do panelu
              </button>
            </div>
          </div>
        )}
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-[60px] sm:min-h-[68px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 lg:gap-5 min-w-0">
          <NavLink to="/" onClick={closeMobile} className="flex items-center min-h-[44px] shrink-0 focus:outline-none" aria-label="Centrum Wspinaczkowe Spider">
            <img src="/logospider.png" alt="Centrum Wspinaczkowe Spider" className="h-12 sm:h-14 -my-1.5 w-auto object-contain brightness-0 shrink-0" />
          </NavLink>
          <nav className="hidden md:flex items-center gap-1" aria-label="Główna nawigacja">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass('inline-flex items-center min-h-[40px] px-3.5 py-1.5 text-sm whitespace-nowrap')}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isLoading && isAuthenticated && <NotificationBell onNavigate={closeMobile} />}

          <div className="hidden md:flex items-center gap-2">
            {isLoading ? (
              <span className="text-sm text-slate-500 px-3 py-2">Weryfikacja sesji...</span>
            ) : isAuthenticated ? (
              <>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0"><User className="w-3.5 h-3.5" /></div>
                  <div className="text-left leading-tight max-w-[130px] lg:max-w-[175px]">
                    <div className="text-xs lg:text-sm font-semibold text-slate-900 truncate">{displayName}</div>
                    <div className="text-[11px] text-emerald-700 font-medium truncate">{primaryRoleLabel}</div>
                  </div>
                </div>
                <button type="button" onClick={() => logout()} className="inline-flex items-center justify-center min-h-[40px] px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-sm">
                  Wyloguj
                </button>
              </>
            ) : (
              <button type="button" onClick={handleLogin} className="inline-flex items-center justify-center min-h-[40px] px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-sm whitespace-nowrap">
                Zaloguj do panelu
              </button>
            )}
          </div>

          <button type="button" onClick={() => setMobileOpen((p) => !p)} aria-expanded={mobileOpen} aria-label="Otwórz menu nawigacji" className="md:hidden inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-4 space-y-3 shadow-lg">
          <nav className="flex flex-col gap-1" aria-label="Menu mobilne">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} onClick={closeMobile} className={linkClass('flex items-center min-h-[44px] px-3.5 py-2.5 text-base')}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="pt-3 border-t border-slate-200">
            {isLoading ? (
              <div className="text-sm text-slate-500 py-2">Weryfikacja sesji...</div>
            ) : isAuthenticated ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0"><User className="w-5 h-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">{displayName}</div>
                    <div className="text-xs text-emerald-700 font-medium">{primaryRoleLabel}</div>
                  </div>
                </div>
                <button type="button" onClick={() => { closeMobile(); logout(); }} className="w-full inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 text-base font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-sm">
                  Wyloguj
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => { closeMobile(); handleLogin(); }} className="w-full inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-sm">
                Zaloguj do panelu
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export default function AppLayout({ children }) {
  const { authError, clearAuthError, sessionExpiredNotice, clearSessionExpiredNotice, login, isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const isLanding = !isAuthenticated && pathname === '/';

  useEffect(() => {
    if (!isLanding) return undefined;
    document.documentElement.classList.add('no-scrollbar');
    document.body.classList.add('no-scrollbar');
    return () => {
      document.documentElement.classList.remove('no-scrollbar');
      document.body.classList.remove('no-scrollbar');
    };
  }, [isLanding]);

  return (
    <div className={`relative flex flex-col min-h-[100dvh] bg-slate-50 text-slate-900 ${isLanding ? 'no-scrollbar' : ''}`}>
      <Navbar />

      {authError && (
        <div className={isLanding ? 'fixed top-24 inset-x-4 z-50 max-w-2xl mx-auto' : 'max-w-6xl w-full mx-auto px-4 sm:px-6 pt-4'}>
          <AlertBanner type="error" message={authError} onClose={clearAuthError} />
        </div>
      )}

      {!isAuthenticated && sessionExpiredNotice && (
        <div className={isLanding ? 'fixed bottom-6 inset-x-4 z-50 max-w-2xl mx-auto' : 'max-w-6xl w-full mx-auto px-4 sm:px-6 pt-5'}>
          <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-amber-50 border border-amber-300 text-amber-950 rounded-xl px-4 sm:px-5 py-4 shadow-lg">
            <div className="flex items-start sm:items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <span className="text-base font-semibold">{sessionExpiredNotice}</span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button type="button" onClick={() => login()} className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow-sm">
                <LogIn className="w-4 h-4" />
                <span>Zaloguj się ponownie</span>
              </button>
              <button type="button" onClick={clearSessionExpiredNotice} aria-label="Zamknij komunikat" className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-amber-800 hover:bg-amber-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <main className={isLanding ? 'flex-1 w-full flex flex-col' : 'flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-10 sm:pb-16'}>
        {children}
      </main>
    </div>
  );
}

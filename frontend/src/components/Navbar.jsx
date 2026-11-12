import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Menu, User, X } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import NotificationBell from './NotificationBell';

export default function Navbar() {
  const {
    isAuthenticated,
    userProfile,
    login,
    logout,
    isLoading,
    hasRole,
    clearSessionExpiredNotice,
  } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const isLanding = !isAuthenticated && location.pathname === '/';

  const handleLogin = () => {
    clearSessionExpiredNotice?.();
    login();
  };

  const isAdmin = hasRole('ROLE_ADMIN');
  const isInstructor = hasRole('ROLE_INSTRUCTOR');
  const isClient = hasRole('ROLE_CLIENT') && !isInstructor && !isAdmin;

  const displayName = userProfile?.firstName
    ? `${userProfile.firstName} ${userProfile.lastName || ''}`.trim()
    : userProfile?.username || userProfile?.email || 'Użytkownik';

  // Główna, pojedyncza rola kontekstowa do wyświetlenia w belce użytkownika (zamiast wielokrotnych "Instruktor • Klient")
  const primaryRoleLabel = isAdmin
    ? 'Admin'
    : isInstructor
    ? 'Instruktor'
    : isClient
    ? 'Klient'
    : 'Użytkownik';

  const navItems = [];
  if (isAuthenticated && isAdmin) {
    navItems.push(
      { to: '/app/admin', label: 'Stan systemu', end: true },
      { to: '/app/admin/users', label: 'Baza użytkowników', end: false },
      { to: '/app/admin/availability', label: 'Godziny instruktorów', end: false }
    );
  } else if (isAuthenticated && isInstructor) {
    navItems.push(
      { to: '/app/instructor', label: 'Grafik', end: true },
      { to: '/app/instructor/progress', label: 'Dziennik postępów', end: false }
    );
  } else if (isAuthenticated && isClient) {
    navItems.push(
      { to: '/app/client', label: 'Terminy', end: true },
      { to: '/app/client/reservations', label: 'Moje rezerwacje', end: false },
      { to: '/app/client/progress', label: 'Dziennik postępów', end: false },
      { to: '/instructors', label: 'Instruktorzy', end: false },
      { to: '/app/client/profile', label: 'Mój profil', end: false }
    );
  } else if (!isAuthenticated) {
    navItems.push(
      { to: '/terminy', label: 'Terminy', end: true },
      { to: '/instructors', label: 'Instruktorzy', end: false }
    );
  }

  const desktopLinkClass = ({ isActive }) =>
    `inline-flex items-center min-h-[40px] px-3.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
      isActive
        ? 'bg-emerald-600 text-white shadow-sm'
        : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200'
    }`;

  const mobileLinkClass = ({ isActive }) =>
    `flex items-center min-h-[44px] px-3.5 py-2.5 rounded-lg text-base font-medium transition-colors ${
      isActive
        ? 'bg-emerald-600 text-white shadow-sm'
        : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200'
    }`;

  const closeMobile = () => setMobileOpen(false);

  // Wariant nawigacji na pełnoekranowej stronie startowej dla niezalogowanych
  if (isLanding) {
    return (
      <header className="absolute top-0 inset-x-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-14 py-4 sm:py-6 md:py-8 flex items-center justify-between gap-3 sm:gap-4">
          <NavLink
            to="/"
            onClick={closeMobile}
            className="inline-flex items-center shrink-0 focus:outline-none"
            aria-label="Centrum Wspinaczkowe Spider — strona główna"
          >
            <img
              src="/logospider.png"
              alt="Centrum Wspinaczkowe Spider"
              className="h-[72px] sm:h-[104px] md:h-[125px] w-auto object-contain drop-shadow-md"
            />
          </NavLink>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Nawigacja przesunięta w prawo, tuż obok przycisku logowania */}
            <nav className="hidden md:flex items-center gap-1.5 sm:gap-2 mr-1 sm:mr-2" aria-label="Nawigacja strony startowej">
              <NavLink
                to="/terminy"
                className="inline-flex items-center min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold text-white/90 hover:text-white hover:bg-white/10 active:bg-white/20 backdrop-blur-sm transition-colors"
              >
                Terminy
              </NavLink>
              <NavLink
                to="/instructors"
                className="inline-flex items-center min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold text-white/90 hover:text-white hover:bg-white/10 active:bg-white/20 backdrop-blur-sm transition-colors"
              >
                Instruktorzy
              </NavLink>
            </nav>

            {isLoading ? (
              <span className="text-xs sm:text-sm text-white/80 px-3 py-2">
                Weryfikacja sesji...
              </span>
            ) : (
              <button
                type="button"
                onClick={handleLogin}
                className="hidden md:inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl shadow-lg shadow-slate-950/40 transition-colors whitespace-nowrap"
              >
                Zaloguj do panelu
              </button>
            )}

            {/* Ikona hamburgera na mobile (< 768px) */}
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-expanded={mobileOpen}
              aria-label="Otwórz menu nawigacji"
              className="md:hidden inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl border border-white/30 bg-white/10 hover:bg-white/20 active:bg-white/25 text-white backdrop-blur-sm transition-colors"
            >
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Wysuwane menu mobilne na stronie startowej */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/10 bg-slate-950/95 backdrop-blur-md px-5 pt-3 pb-6 space-y-3 shadow-2xl">
            <nav className="flex flex-col gap-1.5" aria-label="Menu mobilne start">
              <NavLink
                to="/terminy"
                onClick={closeMobile}
                className="flex items-center min-h-[44px] px-4 py-2.5 rounded-xl text-base font-semibold text-white hover:bg-white/10 active:bg-white/15 transition-colors"
              >
                Terminy
              </NavLink>
              <NavLink
                to="/instructors"
                onClick={closeMobile}
                className="flex items-center min-h-[44px] px-4 py-2.5 rounded-xl text-base font-semibold text-white hover:bg-white/10 active:bg-white/15 transition-colors"
              >
                Instruktorzy
              </NavLink>
            </nav>

            <div className="pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  closeMobile();
                  handleLogin();
                }}
                className="w-full inline-flex items-center justify-center min-h-[46px] px-4 py-2.5 text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl shadow-lg transition-colors"
              >
                Zaloguj do panelu
              </button>
            </div>
          </div>
        )}
      </header>
    );
  }

  // Standardowa nawigacja dla zalogowanych oraz na podstronach aplikacji
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-[60px] sm:min-h-[68px] flex items-center justify-between gap-3">
        {/* Logo + Desktop Nav w jednej linii */}
        <div className="flex items-center gap-4 lg:gap-5 min-w-0">
          <NavLink
            to="/"
            onClick={closeMobile}
            className="flex items-center min-h-[44px] shrink-0 group focus:outline-none"
            aria-label="Centrum Wspinaczkowe Spider"
          >
            <img
              src="/logospider.png"
              alt="Centrum Wspinaczkowe Spider"
              className="h-12 sm:h-14 -my-1.5 w-auto object-contain brightness-0 shrink-0"
            />
          </NavLink>

          <nav className="hidden md:flex items-center gap-1" aria-label="Główna nawigacja">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={desktopLinkClass}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Prawa strona: Dzwonek powiadomień + Profil i akcje sesji (Desktop >= 768px) */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {isLoading ? (
            <span className="text-sm text-slate-500 px-3 py-2">Weryfikacja sesji...</span>
          ) : isAuthenticated ? (
            <div className="flex items-center gap-2">
              <NotificationBell />

              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-semibold text-xs shrink-0">
                  <User className="w-3.5 h-3.5" />
                </div>
                <div className="text-left leading-tight max-w-[130px] lg:max-w-[175px]">
                  <div className="text-xs lg:text-sm font-semibold text-slate-900 truncate">
                    {displayName}
                  </div>
                  <div className="text-[11px] text-emerald-700 font-medium truncate">
                    {primaryRoleLabel}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => logout()}
                className="inline-flex items-center justify-center min-h-[40px] px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 rounded-lg shadow-sm transition-colors"
              >
                Wyloguj
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              className="inline-flex items-center justify-center min-h-[40px] px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl shadow-sm transition-colors whitespace-nowrap"
            >
              Zaloguj do panelu
            </button>
          )}
        </div>

        {/* Prawa strona Mobile (< 768px): Dzwonek powiadomień + Hamburger */}
        <div className="flex md:hidden items-center gap-2">
          {!isLoading && isAuthenticated && (
            <NotificationBell onNavigate={closeMobile} />
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-label="Otwórz menu nawigacji"
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Wysuwane menu mobilne na podstronach (< 768px) */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-4 space-y-3 shadow-lg">
          <nav className="flex flex-col gap-1" aria-label="Menu mobilne">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={closeMobile}
                className={mobileLinkClass}
              >
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
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-semibold shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {displayName}
                    </div>
                    <div className="text-xs text-emerald-700 font-medium">
                      {primaryRoleLabel}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    closeMobile();
                    logout();
                  }}
                  className="w-full inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 text-base font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 active:bg-slate-100 rounded-lg shadow-sm"
                >
                  Wyloguj
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  closeMobile();
                  handleLogin();
                }}
                className="w-full inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl shadow-sm transition-colors"
              >
                Zaloguj do panelu
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

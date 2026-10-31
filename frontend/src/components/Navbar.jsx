import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LogIn, LogOut, Menu, Mountain, User, UserPlus, X } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import NotificationBell from './NotificationBell';

export default function Navbar() {
  const {
    isAuthenticated,
    userProfile,
    roles,
    login,
    logout,
    isLoading,
    hasRole,
    keycloak,
    clearSessionExpiredNotice,
  } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleRegister = () => {
    clearSessionExpiredNotice?.();
    keycloak.register();
  };

  const isAdmin = hasRole('ROLE_ADMIN');
  const isInstructor = hasRole('ROLE_INSTRUCTOR');
  const isClient = hasRole('ROLE_CLIENT') && !isInstructor && !isAdmin;

  const displayName = userProfile?.firstName
    ? `${userProfile.firstName} ${userProfile.lastName || ''}`.trim()
    : userProfile?.username || userProfile?.email || 'Użytkownik';

  const roleLabels = roles
    .filter((r) => r.startsWith('ROLE_'))
    .map((r) => {
      if (r === 'ROLE_ADMIN') return 'Admin';
      if (r === 'ROLE_INSTRUCTOR') return 'Instruktor';
      if (r === 'ROLE_CLIENT') return 'Klient';
      return r.replace('ROLE_', '');
    });

  const navItems = [];
  if (!isAuthenticated) {
    navItems.push({ to: '/', label: 'Start', end: true });
  } else if (isAdmin) {
    navItems.push(
      { to: '/app/admin', label: 'Stan systemu', end: true },
      { to: '/app/admin/users', label: 'Baza użytkowników', end: false },
      { to: '/app/admin/availability', label: 'Godziny instruktorów', end: false }
    );
  } else if (isInstructor) {
    navItems.push(
      { to: '/app/instructor', label: 'Grafik', end: true },
      { to: '/app/instructor/slots/new', label: 'Dodaj dyżur', end: false },
      { to: '/app/instructor/progress', label: 'Dziennik postępów', end: false }
    );
  } else if (isClient) {
    navItems.push(
      { to: '/app/client', label: 'Terminy', end: true },
      { to: '/app/client/reservations', label: 'Moje rezerwacje', end: false },
      { to: '/app/client/progress', label: 'Dziennik postępów', end: false },
      { to: '/instructors', label: 'Instruktorzy', end: false },
      { to: '/app/client/profile', label: 'Mój profil', end: false }
    );
  }

  const desktopLinkClass = ({ isActive }) =>
    `inline-flex items-center min-h-[40px] px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
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

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-[60px] sm:min-h-[68px] flex items-center justify-between gap-3">
        {/* Logo + Desktop Nav w jednej linii */}
        <div className="flex items-center gap-4 lg:gap-5 min-w-0">
          <NavLink
            to="/"
            onClick={closeMobile}
            className="flex items-center gap-2.5 min-h-[44px] shrink-0 group focus:outline-none"
          >
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-emerald-400 flex items-center justify-center shadow-sm group-hover:bg-slate-800 transition-colors">
              <Mountain className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-slate-900 text-base sm:text-lg leading-none">
                CW SPIDER
              </span>
              <span className="text-[11px] text-slate-500 font-medium tracking-wide mt-0.5 hidden xl:inline">
                Centrum Wspinaczkowe Bydgoszcz
              </span>
            </div>
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
                  {roleLabels.length > 0 && (
                    <div className="text-[11px] text-emerald-700 font-medium truncate">
                      {roleLabels.join(' • ')}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => logout()}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 rounded-lg shadow-sm transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden lg:inline">Wyloguj</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => login()}
                className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-950 rounded-lg shadow-sm transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>Zaloguj się</span>
              </button>

              <button
                type="button"
                onClick={handleRegister}
                className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>Zarejestruj się</span>
              </button>
            </div>
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

      {/* Wysuwane menu mobilne (< 768px) */}
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
                      {roleLabels.join(' • ') || 'Zalogowany użytkownik'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    closeMobile();
                    logout();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 text-base font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 active:bg-slate-100 rounded-lg shadow-sm"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Wyloguj</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    closeMobile();
                    login();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 text-base font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-950 rounded-lg shadow-sm"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Zaloguj się</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    closeMobile();
                    handleRegister();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Zarejestruj się</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

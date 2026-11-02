import { useEffect } from 'react';
import { AlertTriangle, LogIn, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import Footer from './Footer';
import Navbar from './Navbar';

export default function Layout({ children }) {
  const { sessionExpiredNotice, clearSessionExpiredNotice, login, isAuthenticated } = useAuth();
  const location = useLocation();

  const isLanding = !isAuthenticated && location.pathname === '/';

  useEffect(() => {
    if (isLanding) {
      document.documentElement.classList.add('no-scrollbar');
      document.body.classList.add('no-scrollbar');
      return () => {
        document.documentElement.classList.remove('no-scrollbar');
        document.body.classList.remove('no-scrollbar');
      };
    }
  }, [isLanding]);

  return (
    <div
      className={`relative flex flex-col min-h-[100dvh] bg-slate-50 text-slate-900 ${
        isLanding ? 'no-scrollbar' : ''
      }`}
    >
      <Navbar />

      {!isAuthenticated && sessionExpiredNotice && (
        <div
          className={
            isLanding
              ? 'fixed bottom-6 inset-x-4 z-50 max-w-2xl mx-auto'
              : 'max-w-6xl w-full mx-auto px-4 sm:px-6 pt-5'
          }
        >
          <div
            role="alert"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-amber-50 border border-amber-300 text-amber-950 rounded-xl px-4 sm:px-5 py-4 shadow-lg"
          >
            <div className="flex items-start sm:items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <span className="text-base font-semibold">{sessionExpiredNotice}</span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => login()}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                <span>Zaloguj się ponownie</span>
              </button>
              <button
                type="button"
                onClick={clearSessionExpiredNotice}
                aria-label="Zamknij komunikat"
                className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-amber-800 hover:bg-amber-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <main
        className={
          isLanding
            ? 'flex-1 w-full flex flex-col'
            : 'flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6'
        }
      >
        {children}
      </main>

      <Footer />
    </div>
  );
}

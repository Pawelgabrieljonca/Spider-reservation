import { LogIn, ShieldAlert } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { BTN_DARK, CARD_CLASS } from '../styles/ui';

export default function ProtectedRoute({ requiredRole, children }) {
  const { isAuthenticated, isLoading, hasRole, roles, login } = useAuth();

  if (isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <div className={`${CARD_CLASS} px-8 py-6 text-center max-w-md w-full`}>
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-base font-medium text-slate-700">Weryfikacja sesji logowania...</p>
          <p className="text-sm text-slate-500 mt-1">Łączenie z serwerem tożsamości Keycloak</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={`${CARD_CLASS} max-w-md mx-auto my-12 p-6 sm:p-8`}>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Wymagane logowanie</h2>
        <p className="text-base text-slate-600 mb-6 leading-relaxed">
          Ten widok jest dostępny wyłącznie dla zalogowanych użytkowników CW Spider. Zaloguj się,
          aby zarządzać rezerwacjami lub grafikiem.
        </p>
        <button
          type="button"
          onClick={() => login({ redirectUri: window.location.href })}
          className={`${BTN_DARK} w-full`}
        >
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
        <p className="text-base text-slate-600 mb-4 leading-relaxed">
          Twoje konto nie posiada wymaganej roli dla tej podstrony:
        </p>
        <div className="font-mono text-sm bg-red-50 border border-red-200 px-3.5 py-2.5 rounded-lg text-red-900 font-semibold mb-4">
          {requiredRole}
        </div>
        <p className="text-sm text-slate-500 mb-2">Twoje przypisane role:</p>
        <div className="flex flex-wrap gap-2">
          {roles.length > 0 ? (
            roles.map((r) => (
              <span
                key={r}
                className="text-xs font-mono bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-md"
              >
                {r}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-400">Brak przypisanych ról</span>
          )}
        </div>
      </div>
    );
  }

  return children;
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Keycloak from 'keycloak-js';

export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'spider-climbing',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'spider-frontend',
});

const AuthContext = createContext(null);
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const IDLE_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'];
const IDLE_KEY = 'spider_idle_expired_notice';
const IDLE_MSG = 'Sesja wygasła z powodu braku aktywności (15 min)';

let keycloakInitPromise = null;
const safeStorage = (fn) => { try { return fn(); } catch { return null; } };

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const isRun = useRef(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [roles, setRoles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(() =>
    safeStorage(() => {
      const msg = window.sessionStorage.getItem(IDLE_KEY);
      if (msg) window.sessionStorage.removeItem(IDLE_KEY);
      return msg;
    })
  );

  const clearSessionExpiredNotice = useCallback(() => {
    setSessionExpiredNotice(null);
    safeStorage(() => window.sessionStorage.removeItem(IDLE_KEY));
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (!isRun.current && !keycloakInitPromise) {
      isRun.current = true;
      keycloakInitPromise = keycloak.init({ onLoad: 'check-sso', pkceMethod: 'S256', checkLoginIframe: false });
    }
    keycloakInitPromise
      .then(async (authenticated) => {
        if (!isMounted) return;
        setAuthError(null);
        if (!authenticated) {
          setIsAuthenticated(false);
          setToken(null);
          setUserProfile(null);
          setRoles([]);
          return;
        }
        setIsAuthenticated(true);
        setToken(keycloak.token);
        setSessionExpiredNotice(null);
        setRoles(keycloak.tokenParsed?.realm_access?.roles || []);
        try {
          const profile = await keycloak.loadUserProfile();
          if (isMounted) setUserProfile(profile);
        } catch {
          const p = keycloak.tokenParsed || {};
          if (isMounted) setUserProfile({ id: p.sub, username: p.preferred_username, email: p.email, firstName: p.given_name, lastName: p.family_name });
        }
      })
      .catch((err) => {
        console.error('Błąd inicjalizacji Keycloak:', err);
        keycloakInitPromise = null;
        if (isMounted) setAuthError('Nie udało się połączyć z serwerem logowania (Keycloak). Odśwież stronę za chwilę.');
      })
      .finally(() => { if (isMounted) setIsLoading(false); });

    const refresh = () => keycloak.updateToken(30).then((refreshed) => { if (refreshed && isMounted) setToken(keycloak.token); });
    keycloak.onTokenExpired = () => refresh().catch(() => { if (isMounted) { setIsAuthenticated(false); setToken(null); } });
    const interval = setInterval(() => { if (keycloak.authenticated) refresh().catch(() => {}); }, 20000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !keycloak.authenticated) return undefined;
    let id = null;
    const reset = () => {
      if (id !== null) clearTimeout(id);
      id = setTimeout(() => {
        if (keycloak.authenticated) {
          safeStorage(() => window.sessionStorage.setItem(IDLE_KEY, IDLE_MSG));
          keycloak.logout({ redirectUri: window.location.origin });
        }
      }, IDLE_TIMEOUT_MS);
    };
    reset();
    IDLE_EVENTS.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    return () => {
      if (id !== null) clearTimeout(id);
      IDLE_EVENTS.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [isAuthenticated]);

  const login = useCallback((opts = {}) => { clearSessionExpiredNotice(); return keycloak.login(opts); }, [clearSessionExpiredNotice]);
  const logout = useCallback((opts = {}) => keycloak.logout({ redirectUri: window.location.origin, ...opts }), []);
  const hasRole = useCallback((role) => roles.includes(role), [roles]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, token, userProfile, roles, isLoading, authError, clearAuthError: () => setAuthError(null), sessionExpiredNotice, clearSessionExpiredNotice, login, logout, hasRole, keycloak }}>
      {children}
    </AuthContext.Provider>
  );
}

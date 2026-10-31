import { useCallback, useEffect, useRef, useState } from 'react';
import keycloak from './keycloak';
import { AuthContext } from './useAuth';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 900 000 ms (15 minut)
const IDLE_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'];
const IDLE_NOTICE_STORAGE_KEY = 'spider_idle_expired_notice';
const IDLE_EXPIRED_MESSAGE = 'Sesja wygasła z powodu braku aktywności (15 min)';

let keycloakInitPromise = null;

function consumeIdleNotice() {
  try {
    const msg = window.sessionStorage.getItem(IDLE_NOTICE_STORAGE_KEY);
    if (msg) {
      window.sessionStorage.removeItem(IDLE_NOTICE_STORAGE_KEY);
      return msg;
    }
  } catch {
    // Ignoruj błędy dostępu do sessionStorage
  }
  return null;
}

export function AuthProvider({ children }) {
  const isRun = useRef(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [roles, setRoles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(() => consumeIdleNotice());

  const clearSessionExpiredNotice = useCallback(() => {
    setSessionExpiredNotice(null);
    try {
      window.sessionStorage.removeItem(IDLE_NOTICE_STORAGE_KEY);
    } catch {
      // Ignoruj
    }
  }, []);

  // 1. Inicjalizacja Keycloak zabezpieczona przed podwójnym wywołaniem w React 19 StrictMode
  useEffect(() => {
    let isMounted = true;

    if (!isRun.current && !keycloakInitPromise) {
      isRun.current = true;
      keycloakInitPromise = keycloak.init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      });
    }

    keycloakInitPromise
      .then(async (authenticated) => {
        if (!isMounted) return;

        if (authenticated) {
          setIsAuthenticated(true);
          setToken(keycloak.token);
          setSessionExpiredNotice(null);

          const tokenRoles = keycloak.tokenParsed?.realm_access?.roles || [];
          setRoles(tokenRoles);

          try {
            const profile = await keycloak.loadUserProfile();
            if (isMounted) setUserProfile(profile);
          } catch {
            if (isMounted) {
              setUserProfile({
                id: keycloak.tokenParsed?.sub,
                username: keycloak.tokenParsed?.preferred_username,
                email: keycloak.tokenParsed?.email,
                firstName: keycloak.tokenParsed?.given_name,
                lastName: keycloak.tokenParsed?.family_name,
              });
            }
          }
        } else {
          setIsAuthenticated(false);
          setToken(null);
          setUserProfile(null);
          setRoles([]);
        }
      })
      .catch((err) => {
        console.error('Błąd inicjalizacji Keycloak:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    keycloak.onTokenExpired = () => {
      keycloak
        .updateToken(30)
        .then((refreshed) => {
          if (refreshed && isMounted) {
            setToken(keycloak.token);
          }
        })
        .catch(() => {
          if (isMounted) {
            setIsAuthenticated(false);
            setToken(null);
          }
        });
    };

    const refreshInterval = setInterval(() => {
      if (keycloak.authenticated) {
        keycloak
          .updateToken(30)
          .then((refreshed) => {
            if (refreshed && isMounted) {
              setToken(keycloak.token);
            }
          })
          .catch((err) => {
            console.warn('Błąd odświeżania tokenu:', err);
          });
      }
    }, 20000);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, []);

  // 2. Idle Timer (15 minut braku aktywności) – aktywny WYŁĄCZNIE dla w pełni zalogowanego użytkownika
  useEffect(() => {
    if (!isAuthenticated || !keycloak.authenticated) {
      return undefined;
    }

    let idleTimeoutId = null;

    const resetIdleTimer = () => {
      if (idleTimeoutId !== null) {
        clearTimeout(idleTimeoutId);
      }
      idleTimeoutId = setTimeout(() => {
        if (keycloak.authenticated) {
          try {
            window.sessionStorage.setItem(IDLE_NOTICE_STORAGE_KEY, IDLE_EXPIRED_MESSAGE);
          } catch {
            // Ignoruj
          }
          keycloak.logout({ redirectUri: window.location.origin });
        }
      }, IDLE_TIMEOUT_MS);
    };

    resetIdleTimer();

    IDLE_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, resetIdleTimer, { passive: true });
    });

    return () => {
      if (idleTimeoutId !== null) {
        clearTimeout(idleTimeoutId);
      }
      IDLE_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, resetIdleTimer);
      });
    };
  }, [isAuthenticated]);

  const login = useCallback(
    (options = {}) => {
      clearSessionExpiredNotice();
      return keycloak.login(options);
    },
    [clearSessionExpiredNotice]
  );

  const logout = useCallback((options = {}) => {
    return keycloak.logout({
      redirectUri: window.location.origin,
      ...options,
    });
  }, []);

  const hasRole = useCallback(
    (role) => {
      return roles.includes(role);
    },
    [roles]
  );

  const value = {
    isAuthenticated,
    token,
    userProfile,
    roles,
    isLoading,
    sessionExpiredNotice,
    clearSessionExpiredNotice,
    login,
    logout,
    hasRole,
    keycloak,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

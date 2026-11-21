import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler, subscribeExternalTokenChange } from './api.js';
import { clearPrivateImages } from './images.js';
import { stopSpeaking } from './speech.js';

const AuthContext = createContext(null);

const ANONYMOUS = { status: 'anonymous', user: null, error: null };

/**
 * Stan logowania całej aplikacji.
 * status: 'loading' (sprawdzanie zapisanego tokenu) | 'authenticated' | 'anonymous' | 'error' (brak połączenia)
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState(() => (getToken() ? { status: 'loading', user: null, error: null } : ANONYMOUS));
  const [notice, setNotice] = useState(null); // komunikat na ekranie logowania, np. o wygaśnięciu sesji
  const [checkCount, setCheckCount] = useState(0);

  const endSession = useCallback(() => {
    setToken(null);
    clearPrivateImages();
    stopSpeaking();
    setState(ANONYMOUS);
  }, []);

  const startSession = useCallback(({ token, user }) => {
    setToken(token);
    setNotice(null);
    setState({ status: 'authenticated', user, error: null });
  }, []);

  // Sprawdzenie zapisanego tokenu: przy starcie aplikacji i po zmianie tokenu w innej karcie.
  useEffect(() => {
    if (!getToken()) return undefined;

    const controller = new AbortController();
    api('/auth/me', { signal: controller.signal }).then(
      ({ user }) => {
        setState((previous) => {
          // Na tym samym koncie nic się nie zmienia; inne konto oznacza zupełnie nowe dane.
          if (previous.user && previous.user.id !== user.id) clearPrivateImages();
          return { status: 'authenticated', user, error: null };
        });
      },
      (error) => {
        if (error?.name === 'AbortError') return;
        if (error.status === 401) {
          // Token wygasł lub został unieważniony — sesję zakończył już „unauthorizedHandler”.
          if (getToken()) endSession();
        } else {
          setState((previous) => (previous.status === 'authenticated' ? previous : { status: 'error', user: null, error }));
        }
      },
    );
    return () => controller.abort();
  }, [checkCount, endSession]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      endSession();
      setNotice('Sesja wygasła. Zaloguj się ponownie.');
    });
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  useEffect(
    () =>
      subscribeExternalTokenChange((token) => {
        stopSpeaking();
        if (!token) {
          // Wylogowanie w innej karcie wylogowuje także tę.
          clearPrivateImages();
          setState(ANONYMOUS);
          return;
        }
        // Logowanie lub zmiana hasła w innej karcie: sprawdzamy, czyje to konto.
        setState((previous) => (previous.status === 'authenticated' ? previous : { status: 'loading', user: null, error: null }));
        setCheckCount((count) => count + 1);
      }),
    [],
  );

  const value = useMemo(
    () => ({
      status: state.status,
      user: state.user,
      error: state.error,
      notice,

      async login(username, password) {
        startSession(await api('/auth/login', { method: 'POST', body: { username, password } }));
      },

      async register(username, password) {
        startSession(await api('/auth/register', { method: 'POST', body: { username, password } }));
      },

      logout() {
        setNotice(null);
        endSession();
      },

      /** Zmienia hasło; serwer unieważnia stare tokeny i zwraca nowy dla tego urządzenia. */
      async changePassword(currentPassword, newPassword) {
        startSession(await api('/auth/password', { method: 'PUT', body: { currentPassword, newPassword } }));
      },

      async deleteAccount(password) {
        await api('/auth/account', { method: 'DELETE', body: { password } });
        setNotice('Konto zostało usunięte.');
        endSession();
      },

      /** Ponawia sprawdzenie sesji po błędzie połączenia. */
      retry() {
        setState({ status: 'loading', user: null, error: null });
        setCheckCount((count) => count + 1);
      },
    }),
    [state, notice, startSession, endSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth wymaga komponentu <AuthProvider>.');
  return context;
}

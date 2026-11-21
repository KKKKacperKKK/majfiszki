// Cienka warstwa nad fetch(): dołącza token JWT i zamienia odpowiedzi błędów na wyjątki ApiError.

const TOKEN_KEY = 'fiszki.token';

/** Token zapisany w przeglądarce; `undefined`, gdy pamięć przeglądarki jest niedostępna. */
function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return undefined;
  }
}

// Token trzymamy w localStorage, a gdy przeglądarka go blokuje (np. tryb prywatny albo
// osadzenie strony w ramce) — tylko w pamięci, do zamknięcia karty.
let currentToken = readStoredToken() ?? null;
const tokenListeners = new Set();

export const getToken = () => currentToken;

export function setToken(token) {
  currentToken = token || null;
  try {
    if (currentToken) localStorage.setItem(TOKEN_KEY, currentToken);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* pamięć przeglądarki niedostępna — token zostaje tylko w pamięci karty */
  }
}

/**
 * Powiadamia, gdy token zmienił się w INNEJ karcie przeglądarki
 * (ktoś się tam zalogował, wylogował albo zmienił hasło).
 */
export function subscribeExternalTokenChange(listener) {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

function adoptStoredToken() {
  const stored = readStoredToken();
  if (stored === undefined || stored === currentToken) return false;
  currentToken = stored;
  tokenListeners.forEach((listener) => listener(stored));
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === TOKEN_KEY) adoptStoredToken();
  });
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'unknown', fields = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

// Wywoływane, gdy serwer odrzuci token (wygasł, zmieniono hasło albo konto usunięto).
let unauthorizedHandler = null;
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

async function request(url, options = {}, isRetry = false) {
  const { method = 'GET', body, signal } = options;
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body instanceof FormData) {
    payload = body; // przeglądarka sama ustawi Content-Type z separatorem multipart
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, { method, headers, body: payload, signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.', { code: 'network' });
  }

  if (response.ok) return response;

  let error = null;
  try {
    error = (await response.json())?.error ?? null;
  } catch {
    /* odpowiedź nie jest JSON-em */
  }

  const apiError = new ApiError(error?.message || `Wystąpił błąd (${response.status}). Spróbuj ponownie.`, {
    status: response.status,
    code: error?.code,
    fields: error?.fields ?? null,
  });

  if (response.status === 401 && token && (apiError.code === 'invalid_token' || apiError.code === 'unauthorized')) {
    // Inna karta mogła w międzyczasie zapisać nowszy token (np. po zmianie hasła) —
    // wtedy ponawiamy żądanie z nim, zamiast wylogowywać użytkownika.
    adoptStoredToken();
    const latest = getToken();
    if (latest && latest !== token) {
      if (!isRetry) return request(url, options, true);
    } else if (latest === token) {
      unauthorizedHandler?.();
    }
  }

  throw apiError;
}

/** Zapytanie do API (`path` bez przedrostka /api). Zwraca zdekodowany JSON albo `null` dla odpowiedzi 204. */
export async function api(path, options) {
  const response = await request(`/api${path}`, options);
  if (response.status === 204) return null;
  return response.json();
}

/** Pobiera plik binarny (np. obrazek fiszki) z nagłówkiem Authorization. */
export async function apiBlob(url, options) {
  const response = await request(url, options);
  return response.blob();
}

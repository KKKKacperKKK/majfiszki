import { validationError } from './errors.js';

export const LIMITS = {
  usernameMin: 3,
  usernameMax: 30,
  passwordMin: 8,
  passwordMaxBytes: 72, // bcrypt bierze pod uwagę tylko pierwsze 72 bajty hasła
  deckName: 80,
  deckDescription: 300,
  cardText: 2000,
  imageUrl: 2000,
};

export const IMAGE_SIDES = ['front', 'back', 'both'];

const USERNAME_RE = /^[\p{L}\p{N}._-]+$/u;
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;
// Znaki sterujące (kategoria Unicode „Cc”) poza tabulatorem i znakiem nowej linii.
const CONTROL_CHARS_RE = /(?![\t\n])\p{Cc}/gu;

const asString = (value) => (typeof value === 'string' ? value : '');
const length = (text) => [...text].length;

/** Tekst jednowierszowy: bez znaków sterujących, z pojedynczymi spacjami. */
function cleanLine(value) {
  return asString(value).replace(CONTROL_CHARS_RE, '').replace(/\s+/g, ' ').trim();
}

/** Tekst wielowierszowy: zachowuje podziały wierszy. */
function cleanText(value) {
  return asString(value).replace(/\r\n?/g, '\n').replace(CONTROL_CHARS_RE, '').trim();
}

function isTruthy(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function throwIfInvalid(fields) {
  if (Object.keys(fields).length > 0) throw validationError(fields);
}

/** Klucz unikalności nazwy użytkownika — „Ania” i „ania” to to samo konto. */
export function usernameKey(username) {
  return username.normalize('NFKC').toLowerCase();
}

export function normalizeUsername(value) {
  return asString(value).normalize('NFKC').trim();
}

/** Zwraca komunikat błędu albo `null`, gdy hasło spełnia wymagania. */
export function passwordProblem(password) {
  if (!password) return 'Podaj hasło.';
  if (length(password) < LIMITS.passwordMin) {
    return `Hasło musi mieć co najmniej ${LIMITS.passwordMin} znaków.`;
  }
  if (Buffer.byteLength(password, 'utf8') > LIMITS.passwordMaxBytes) {
    return `Hasło jest za długie (maksymalnie ${LIMITS.passwordMaxBytes} znaki).`;
  }
  return null;
}

export function parseRegistration(body) {
  const fields = {};
  const username = normalizeUsername(body?.username);
  const password = asString(body?.password);

  if (!username) {
    fields.username = 'Podaj nazwę użytkownika.';
  } else if (length(username) < LIMITS.usernameMin || length(username) > LIMITS.usernameMax) {
    fields.username = `Nazwa użytkownika musi mieć od ${LIMITS.usernameMin} do ${LIMITS.usernameMax} znaków.`;
  } else if (!USERNAME_RE.test(username)) {
    fields.username = 'Nazwa użytkownika może zawierać tylko litery, cyfry oraz znaki . _ -';
  }

  const problem = passwordProblem(password);
  if (problem) fields.password = problem;

  throwIfInvalid(fields);
  return { username, password };
}

export function parseLogin(body) {
  const fields = {};
  const username = normalizeUsername(body?.username);
  const password = asString(body?.password);

  if (!username) fields.username = 'Podaj nazwę użytkownika.';
  if (!password) fields.password = 'Podaj hasło.';

  throwIfInvalid(fields);
  return { username, password };
}

function parseLang(value) {
  const lang = asString(value).trim();
  return lang === 'auto' || LANG_RE.test(lang) ? lang : null;
}

/**
 * Dane zestawu. W trybie `partial` (PATCH) sprawdzane i zwracane są tylko przesłane pola.
 */
export function parseDeck(body, { partial = false } = {}) {
  const fields = {};
  const deck = {};

  if (!partial || body?.name !== undefined) {
    deck.name = cleanLine(body?.name);
    if (!deck.name) fields.name = 'Podaj nazwę zestawu.';
    else if (length(deck.name) > LIMITS.deckName) {
      fields.name = `Nazwa może mieć maksymalnie ${LIMITS.deckName} znaków.`;
    }
  }

  if (!partial || body?.description !== undefined) {
    deck.description = cleanText(body?.description);
    if (length(deck.description) > LIMITS.deckDescription) {
      fields.description = `Opis może mieć maksymalnie ${LIMITS.deckDescription} znaków.`;
    }
  }

  for (const key of ['frontLang', 'backLang']) {
    if (body?.[key] !== undefined) {
      deck[key] = parseLang(body[key]);
      if (!deck[key]) fields[key] = 'Nieprawidłowy kod języka.';
    } else if (!partial) {
      deck[key] = 'auto';
    }
  }

  throwIfInvalid(fields);
  return deck;
}

function parseImageUrl(raw) {
  if (raw.length > LIMITS.imageUrl) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Dane fiszki — z JSON-a albo z pól formularza multipart (wtedy wszystko jest napisem).
 * Zwraca też intencję dotyczącą obrazka: `imageUrl` (ustaw adres) i `removeImage` (usuń obrazek).
 * Sam przesłany plik obsługuje moduł `uploads.js`.
 */
export function parseCard(body, { partial = false } = {}) {
  const fields = {};
  const card = {};

  for (const [key, label] of [
    ['front', 'awersu'],
    ['back', 'rewersu'],
  ]) {
    if (!partial || body?.[key] !== undefined) {
      card[key] = cleanText(body?.[key]);
      if (!card[key]) fields[key] = `Uzupełnij treść ${label}.`;
      else if (length(card[key]) > LIMITS.cardText) {
        fields[key] = `Tekst może mieć maksymalnie ${LIMITS.cardText} znaków.`;
      }
    }
  }

  if (body?.imageSide !== undefined && body.imageSide !== '') {
    if (IMAGE_SIDES.includes(body.imageSide)) card.imageSide = body.imageSide;
    else fields.imageSide = 'Nieprawidłowa strona obrazka.';
  }

  const rawUrl = asString(body?.imageUrl).trim();
  if (rawUrl) {
    card.imageUrl = parseImageUrl(rawUrl);
    if (!card.imageUrl) {
      fields.imageUrl = 'Podaj poprawny adres obrazka zaczynający się od http:// lub https://.';
    }
  }

  card.removeImage = isTruthy(body?.removeImage);

  throwIfInvalid(fields);
  return card;
}

/** Identyfikator z adresu URL (`/decks/12`) → liczba albo `null`. */
export function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value)) return null;
  return Number(value);
}

import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { HttpError } from './errors.js';

/**
 * Sekret do podpisywania tokenów. Kolejność: zmienna JWT_SECRET, a gdy jej brak —
 * losowy sekret generowany przy pierwszym starcie i zapisywany w Netlify Blobs,
 * żeby sesje przetrwały restart serwera i nowe wdrożenia.
 */
export async function resolveJwtSecret({ jwtSecret }) {
  if (jwtSecret) {
    if (jwtSecret.length < 32) {
      console.warn('Uwaga: JWT_SECRET ma mniej niż 32 znaki — ustaw dłuższą, losową wartość.');
    }
    return jwtSecret;
  }

  const store = getStore({ name: 'app-config', consistency: 'strong' });
  const saved = (await store.get('jwt-secret'))?.trim();
  if (saved) return saved;

  // `onlyIfNew` chroni przed wyścigiem dwóch równocześnie startujących instancji.
  await store.set('jwt-secret', crypto.randomBytes(48).toString('base64url'), { onlyIfNew: true });
  return (await store.get('jwt-secret')).trim();
}

export function createAuth({ db, getSecret, expiresIn, bcryptRounds }) {
  // Sekret jest wczytywany przy pierwszym użyciu (w trakcie obsługi żądania), a potem trzymany w pamięci.
  let secretPromise = null;
  const secret = () => {
    secretPromise ??= getSecret().catch((err) => {
      secretPromise = null;
      throw err;
    });
    return secretPromise;
  };

  // Hash „na niby” — porównujemy z nim hasło, gdy użytkownik nie istnieje, żeby czas
  // odpowiedzi nie zdradzał, czy dana nazwa użytkownika jest zarejestrowana.
  const dummyHash = bcrypt.hashSync(crypto.randomBytes(18).toString('base64'), bcryptRounds);

  const sessionExpired = () => new HttpError(401, 'invalid_token', 'Sesja wygasła. Zaloguj się ponownie.');

  return {
    hashPassword(password) {
      return bcrypt.hash(password, bcryptRounds);
    },

    /** Zwraca `true` tylko wtedy, gdy `hash` istnieje i pasuje do hasła. */
    async verifyPassword(password, hash) {
      const matches = await bcrypt.compare(password, hash || dummyHash);
      return Boolean(hash) && matches;
    },

    /** Token JWT (HS256): `sub` = id użytkownika, `ver` = wersja tokenów w chwili wydania. */
    async issueToken(user) {
      return jwt.sign({ ver: user.token_version }, await secret(), {
        algorithm: 'HS256',
        subject: String(user.id),
        expiresIn,
      });
    },

    /** Middleware: wymaga nagłówka `Authorization: Bearer <token>` i ustawia `req.user`. */
    async requireAuth(req, _res, next) {
      const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
      if (!match) {
        throw new HttpError(401, 'unauthorized', 'Zaloguj się, aby kontynuować.');
      }

      const key = await secret();
      let payload;
      try {
        payload = jwt.verify(match[1], key, { algorithms: ['HS256'] });
      } catch {
        throw sessionExpired();
      }

      const userId = Number(payload.sub);
      const user = Number.isSafeInteger(userId) ? await db.get('SELECT * FROM users WHERE id = ?', userId) : null;

      // Konto usunięte albo hasło zmienione po wydaniu tokenu → token przestaje działać.
      if (!user || user.token_version !== payload.ver) throw sessionExpired();

      req.user = user;
      next();
    },
  };
}

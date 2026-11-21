import { Router } from 'express';
import { HttpError, validationError } from '../errors.js';
import { isUniqueViolation } from '../db.js';
import { clientIp, createRateLimiter } from '../rate-limit.js';
import { toUser } from '../serializers.js';
import { parseLogin, parseRegistration, passwordProblem, usernameKey } from '../validation.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export function authRoutes({ db, auth, uploads, limits }) {
  const router = Router();

  const loginFailuresByUser = createRateLimiter({ windowMs: FIFTEEN_MINUTES, max: limits.loginFailuresPerUser });
  const loginFailuresByIp = createRateLimiter({ windowMs: FIFTEEN_MINUTES, max: limits.loginFailuresPerIp });
  const registrationsByIp = createRateLimiter({ windowMs: ONE_HOUR, max: limits.registrationsPerIp });
  // Nieudane próby rejestracji (np. zajęta nazwa) też są liczone — utrudnia to masowe sprawdzanie, jakie konta istnieją.
  const registrationAttemptsByIp = createRateLimiter({ windowMs: ONE_HOUR, max: limits.registrationsPerIp * 4 });
  const passwordChecksByUser = createRateLimiter({ windowMs: FIFTEEN_MINUTES, max: limits.loginFailuresPerUser });

  function assertNotLimited(res, limiter, key, message) {
    const seconds = limiter.retryAfter(key);
    if (seconds > 0) {
      res.set('Retry-After', String(seconds));
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      throw new HttpError(429, 'rate_limited', `${message} Spróbuj ponownie za ${minutes} min.`);
    }
  }

  const usernameTaken = () =>
    new HttpError(409, 'username_taken', 'Ta nazwa użytkownika jest już zajęta.', {
      username: 'Ta nazwa użytkownika jest już zajęta.',
    });

  // Rejestracja: wyłącznie nazwa użytkownika i hasło.
  router.post('/register', async (req, res) => {
    const ip = clientIp(req);
    assertNotLimited(res, registrationsByIp, ip, 'Zbyt wiele nowych kont z tego adresu.');
    assertNotLimited(res, registrationAttemptsByIp, ip, 'Zbyt wiele prób rejestracji z tego adresu.');

    const { username, password } = parseRegistration(req.body);
    const key = usernameKey(username);
    registrationAttemptsByIp.hit(ip);

    if (await db.get('SELECT 1 AS found FROM users WHERE username_key = ?', key)) throw usernameTaken();

    const passwordHash = await auth.hashPassword(password);

    let user;
    try {
      user = await db.get(
        'INSERT INTO users (username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?) RETURNING *',
        username,
        key,
        passwordHash,
        new Date().toISOString(),
      );
    } catch (err) {
      // Dwie równoczesne rejestracje tej samej nazwy — drugą zatrzymuje ograniczenie UNIQUE.
      if (isUniqueViolation(err)) throw usernameTaken();
      throw err;
    }

    registrationsByIp.hit(ip);

    res.status(201).json({ token: await auth.issueToken(user), user: toUser(user) });
  });

  // Logowanie. Komunikat błędu jest taki sam dla nieistniejącego konta i złego hasła.
  router.post('/login', async (req, res) => {
    const { username, password } = parseLogin(req.body);
    const key = usernameKey(username).slice(0, 64);
    const ip = clientIp(req);
    const userBucket = `${ip}|${key}`;

    const tooMany = 'Zbyt wiele nieudanych prób logowania.';
    assertNotLimited(res, loginFailuresByIp, ip, tooMany);
    assertNotLimited(res, loginFailuresByUser, userBucket, tooMany);

    const user = await db.get('SELECT * FROM users WHERE username_key = ?', key);
    const passwordOk = await auth.verifyPassword(password, user?.password_hash);

    if (!user || !passwordOk) {
      loginFailuresByIp.hit(ip);
      loginFailuresByUser.hit(userBucket);
      throw new HttpError(401, 'invalid_credentials', 'Nieprawidłowa nazwa użytkownika lub hasło.');
    }

    loginFailuresByUser.reset(userBucket);
    res.json({ token: await auth.issueToken(user), user: toUser(user) });
  });

  router.get('/me', auth.requireAuth, (req, res) => {
    res.json({ user: toUser(req.user) });
  });

  /** Sprawdza bieżące hasło zalogowanego użytkownika (z limitem prób). */
  async function confirmPassword(req, res, password, field) {
    const bucket = `user:${req.user.id}`;
    assertNotLimited(res, passwordChecksByUser, bucket, 'Zbyt wiele nieudanych prób.');

    if (typeof password !== 'string' || !password) {
      throw validationError({ [field]: 'Podaj obecne hasło.' });
    }
    if (!(await auth.verifyPassword(password, req.user.password_hash))) {
      passwordChecksByUser.hit(bucket);
      throw new HttpError(403, 'wrong_password', 'Obecne hasło jest nieprawidłowe.', {
        [field]: 'Obecne hasło jest nieprawidłowe.',
      });
    }
    passwordChecksByUser.reset(bucket);
  }

  // Zmiana hasła. Zwiększenie token_version wylogowuje wszystkie pozostałe urządzenia.
  router.put('/password', auth.requireAuth, async (req, res) => {
    await confirmPassword(req, res, req.body?.currentPassword, 'currentPassword');

    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const problem = passwordProblem(newPassword);
    if (problem) throw validationError({ newPassword: problem });

    const passwordHash = await auth.hashPassword(newPassword);
    const user = await db.get(
      'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ? RETURNING *',
      passwordHash,
      req.user.id,
    );
    res.json({ token: await auth.issueToken(user), user: toUser(user) });
  });

  // Usunięcie konta razem ze wszystkimi zestawami, fiszkami i przesłanymi obrazkami.
  router.delete('/account', auth.requireAuth, async (req, res) => {
    await confirmPassword(req, res, req.body?.password, 'password');

    const files = await db.transaction(async (tx) => {
      const rows = await tx.all(
        `SELECT c.image_file FROM cards c
           JOIN decks d ON d.id = c.deck_id
          WHERE d.user_id = ? AND c.image_file IS NOT NULL`,
        req.user.id,
      );
      await tx.run('DELETE FROM users WHERE id = ?', req.user.id); // kaskadowo usuwa zestawy i fiszki
      return rows.map((row) => row.image_file);
    });

    await uploads.remove(...files);
    res.status(204).end();
  });

  return router;
}

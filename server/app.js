import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import multer from 'multer';
import { createAuth, resolveJwtSecret } from './auth.js';
import { openDatabase } from './db.js';
import { HttpError } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { cardRoutes } from './routes/cards.js';
import { deckRoutes } from './routes/decks.js';
import { createUploads } from './uploads.js';

/** Nagłówki bezpieczeństwa dołączane do każdej odpowiedzi. */
function securityHeaders({ allowEmbedding }) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob: https: http:", // obrazki fiszek mogą pochodzić z dowolnego adresu URL
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Domyślnie aplikacji nie da się osadzić w ramce na obcej stronie (ochrona przed clickjackingiem).
    ...(allowEmbedding ? [] : ["frame-ancestors 'self'"]),
  ].join('; ');

  return (_req, res, next) => {
    res.set({
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (!allowEmbedding) res.set('X-Frame-Options', 'SAMEORIGIN');
    next();
  };
}

/** Zamienia każdy błąd na odpowiedź JSON: `{ error: { code, message, fields? } }`. */
function errorHandler({ maxUploadBytes }) {
  // Express rozpoznaje funkcję obsługi błędów po czterech argumentach.
  return (err, _req, res, next) => {
    if (res.headersSent) return next(err);

    const send = (status, code, message, fields) => {
      res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });
    };

    if (err instanceof HttpError) {
      return send(err.status, err.code, err.message, err.fields);
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        const message = `Obraz jest za duży — maksymalny rozmiar to ${Math.round(maxUploadBytes / 1024 / 1024)} MB.`;
        return send(413, 'file_too_large', message, { image: message });
      }
      return send(400, 'invalid_upload', 'Nie udało się odczytać przesłanego formularza.');
    }

    if (err?.type === 'entity.parse.failed') return send(400, 'invalid_json', 'Nieprawidłowy format danych (JSON).');
    if (err?.type === 'entity.too.large') return send(413, 'payload_too_large', 'Przesłane dane są za duże.');
    if (err?.status >= 400 && err?.status < 500) return send(err.status, 'bad_request', 'Nieprawidłowe żądanie.');

    console.error(err);
    return send(500, 'internal_error', 'Wystąpił nieoczekiwany błąd serwera. Spróbuj ponownie.');
  };
}

/**
 * Składa całą aplikację: baza danych, uwierzytelnianie, API oraz serwowanie zbudowanego frontendu.
 * Zwraca `{ app, db, close }` — dzięki temu testy mogą uruchomić własną, odizolowaną instancję.
 */
export async function createApp(config) {
  const db = await openDatabase(config);
  const auth = createAuth({
    db,
    getSecret: () => resolveJwtSecret(config),
    expiresIn: config.jwtExpiresIn,
    bcryptRounds: config.bcryptRounds,
  });
  const uploads = createUploads(config);
  const services = { db, auth, uploads, limits: config.limits };

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(securityHeaders(config));
  app.use(compression());

  // ── API ────────────────────────────────────────────────────────────────
  const api = express.Router();
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store'); // odpowiedzi API zawierają prywatne dane
    next();
  });
  api.use(express.json({ limit: '100kb' }));
  api.use((req, _res, next) => {
    req.body ??= {};
    next();
  });

  api.get('/health', (_req, res) => res.json({ status: 'ok' }));
  api.use('/auth', authRoutes(services));
  api.use('/decks', deckRoutes(services));
  api.use('/cards', cardRoutes(services));
  api.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'Nie znaleziono takiego adresu API.')));

  app.use('/api', api);

  // ── Frontend (wynik `npm run build`) ───────────────────────────────────
  const hasClient = fs.existsSync(path.join(config.clientDir, 'index.html'));

  if (hasClient) {
    app.use(
      express.static(config.clientDir, {
        index: false,
        setHeaders(res, filePath) {
          // Pliki w /assets mają skrót zawartości w nazwie, więc mogą być buforowane „na zawsze”.
          const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
          res.set('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
  }

  // Aplikacja jednostronicowa: każdy inny adres (np. /decks/3/study) zwraca index.html,
  // a trasę obsługuje React Router w przeglądarce.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next(new HttpError(404, 'not_found', 'Nie znaleziono strony.'));
    }
    if (path.extname(req.path)) {
      return res.status(404).type('text/plain; charset=utf-8').send('Nie znaleziono pliku.');
    }
    if (!hasClient) {
      return res
        .status(503)
        .type('text/plain; charset=utf-8')
        .send('Frontend nie został jeszcze zbudowany. Uruchom polecenie: npm run build');
    }
    res.set('Cache-Control', 'no-cache');
    return res.sendFile('index.html', { root: config.clientDir, cacheControl: false });
  });

  app.use(errorHandler(config));

  return {
    app,
    db,
    hasClient,
    close: () => db.close(),
  };
}

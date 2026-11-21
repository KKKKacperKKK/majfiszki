import path from 'node:path';
import { createApp } from './app.js';
import { loadConfig, rootDir } from './config.js';

// Wczytuje plik .env, jeśli istnieje (zmienne ustawione w systemie mają pierwszeństwo).
try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const config = loadConfig();

let application;
try {
  application = await createApp(config);
} catch (err) {
  // Błąd startu (np. brak sterownika bazy, brak uprawnień do katalogu danych) — sam komunikat, bez śladu stosu.
  console.error(`Nie udało się uruchomić aplikacji.\n${err.message}`);
  process.exit(1);
}
const { app, db, hasClient, close } = application;

const devMode = Boolean(process.env.FISZKI_DEV); // ustawiane przez `npm run dev`

const server = app.listen(config.port, config.host, () => {
  if (devMode) {
    console.log(`Serwer API:       http://localhost:${config.port}  (aplikację otwórz pod adresem serwera Vite: http://localhost:5173)`);
  } else {
    console.log(`Fiszki działają:  http://localhost:${config.port}`);
  }
  console.log(`Baza danych:      ${db.driver}`);
  if (!hasClient && !devMode) {
    console.log('\nUwaga: brak zbudowanego frontendu (katalog dist/).');
    console.log('Uruchom `npm run build`, a w trakcie pracy nad kodem — `npm run dev`.');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} jest zajęty. Ustaw inny, np.: PORT=3001 npm start`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

function shutdown() {
  server.close(() => {
    close().finally(() => process.exit(0));
  });
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

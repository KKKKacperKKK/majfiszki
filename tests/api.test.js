// Testy API: uruchamiają prawdziwy serwer na losowym porcie z tymczasową bazą danych.
// Uruchomienie: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';

const JWT_SECRET = 'sekret-tylko-do-testow-0123456789-abcdefghij';

// Najmniejszy poprawny plik PNG (1×1 piksel).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Uruchamia odizolowaną instancję aplikacji i zwraca wygodnego klienta HTTP. */
async function startServer({ limits, ...overrides } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fiszki-test-'));
  // SQLITE_DRIVER=node npm test — uruchamia testy na wbudowanym module node:sqlite.
  const base = loadConfig({ DATA_DIR: dataDir, JWT_SECRET, BCRYPT_ROUNDS: '4', SQLITE_DRIVER: process.env.SQLITE_DRIVER });
  const config = {
    ...base,
    ...overrides,
    limits: { loginFailuresPerUser: 1000, loginFailuresPerIp: 1000, registrationsPerIp: 1000, ...limits },
  };

  const { app, db, close } = await createApp(config);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;

  /** @returns {Promise<{ status: number, headers: Headers, body: any, raw: Buffer }>} */
  async function request(method, url, { token, json, form, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (json !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = typeof json === 'string' ? json : JSON.stringify(json);
    } else if (form) {
      init.body = form;
    }

    const response = await fetch(origin + url, init);
    const raw = Buffer.from(await response.arrayBuffer());
    let body = null;
    if ((response.headers.get('content-type') || '').includes('application/json')) body = JSON.parse(raw.toString('utf8'));
    return { status: response.status, headers: response.headers, body, raw };
  }

  async function register(username, password = 'tajne-haslo-123') {
    const response = await request('POST', '/api/auth/register', { json: { username, password } });
    assert.equal(response.status, 201, `rejestracja ${username}: ${JSON.stringify(response.body)}`);
    return response.body;
  }

  return {
    config,
    db,
    request,
    register,
    uploadedFiles: () => (fs.existsSync(config.uploadsDir) ? fs.readdirSync(config.uploadsDir) : []),
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

function cardForm(fields, file) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) form.set('image', new Blob([file.data], { type: file.type }), file.name);
  return form;
}

describe('konta: tylko nazwa użytkownika i hasło', () => {
  let app;
  before(async () => {
    app = await startServer();
  });
  after(() => app.stop());

  test('tabela users nie ma kolumn na e-mail, telefon ani logowanie zewnętrzne', () => {
    const columns = app.db.all('PRAGMA table_info(users)').map((column) => column.name);
    assert.deepEqual(columns, ['id', 'username', 'username_key', 'password_hash', 'token_version', 'created_at']);
  });

  test('rejestracja wymaga wyłącznie nazwy użytkownika i hasła, a dodatkowe pola są ignorowane', async () => {
    const response = await app.request('POST', '/api/auth/register', {
      json: { username: 'Ania', password: 'bardzo-tajne-haslo', email: 'ania@example.com', phone: '+48123456789' },
    });
    assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(response.body.user).sort(), ['createdAt', 'id', 'username']);
    assert.equal(response.body.user.username, 'Ania');
    assert.ok(response.body.token);

    const row = app.db.get('SELECT * FROM users WHERE id = ?', response.body.user.id);
    assert.ok(!JSON.stringify(row).includes('example.com'));
    assert.ok(!JSON.stringify(row).includes('48123456789'));
  });

  test('hasło jest przechowywane jako hash bcrypt, nigdy jawnie', async () => {
    await app.register('hash.test', 'moje-haslo-jawne');
    const row = app.db.get("SELECT password_hash FROM users WHERE username_key = 'hash.test'");
    assert.match(row.password_hash, /^\$2[aby]\$\d{2}\$.{53}$/);
    assert.ok(!row.password_hash.includes('moje-haslo-jawne'));
  });

  test('nazwa użytkownika jest unikalna bez względu na wielkość liter', async () => {
    await app.register('Bartek');
    for (const username of ['Bartek', 'bartek', 'BARTEK']) {
      const response = await app.request('POST', '/api/auth/register', { json: { username, password: 'inne-haslo-456' } });
      assert.equal(response.status, 409);
      assert.equal(response.body.error.code, 'username_taken');
      assert.ok(response.body.error.fields.username);
    }
  });

  test('walidacja danych rejestracji', async () => {
    const cases = [
      [{ username: 'ab', password: 'poprawne-haslo' }, 'username'],
      [{ username: 'a'.repeat(31), password: 'poprawne-haslo' }, 'username'],
      [{ username: 'jan kowalski', password: 'poprawne-haslo' }, 'username'],
      [{ username: 'jan@kowalski', password: 'poprawne-haslo' }, 'username'],
      [{ username: '<script>', password: 'poprawne-haslo' }, 'username'],
      [{ username: 'poprawny', password: 'krotkie' }, 'password'],
      [{ username: 'poprawny', password: 'x'.repeat(73) }, 'password'],
      [{ username: 'poprawny' }, 'password'],
      [{ password: 'poprawne-haslo' }, 'username'],
      [{ username: { $ne: null }, password: 'poprawne-haslo' }, 'username'],
    ];
    for (const [json, field] of cases) {
      const response = await app.request('POST', '/api/auth/register', { json });
      assert.equal(response.status, 422, JSON.stringify(json));
      assert.ok(response.body.error.fields[field], `oczekiwano błędu pola ${field} dla ${JSON.stringify(json)}`);
    }
  });

  test('polskie znaki w nazwie użytkownika są dozwolone', async () => {
    const { user } = await app.register('Żaneta_Łoś');
    assert.equal(user.username, 'Żaneta_Łoś');
    const login = await app.request('POST', '/api/auth/login', { json: { username: 'żaneta_łoś', password: 'tajne-haslo-123' } });
    assert.equal(login.status, 200);
  });

  test('logowanie: poprawne dane, złe hasło i nieistniejące konto', async () => {
    await app.register('Celina', 'haslo-celiny-1');

    const ok = await app.request('POST', '/api/auth/login', { json: { username: 'celina', password: 'haslo-celiny-1' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.username, 'Celina');
    assert.equal(ok.body.user.password_hash, undefined);

    const wrongPassword = await app.request('POST', '/api/auth/login', { json: { username: 'Celina', password: 'zle-haslo' } });
    const unknownUser = await app.request('POST', '/api/auth/login', { json: { username: 'nikt-taki', password: 'zle-haslo' } });
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownUser.status, 401);
    // Odpowiedź nie zdradza, czy konto istnieje.
    assert.deepEqual(wrongPassword.body, unknownUser.body);
  });

  test('zasoby wymagają ważnego tokenu', async () => {
    const { token, user } = await app.register('Daria');

    assert.equal((await app.request('GET', '/api/auth/me', { token })).body.user.id, user.id);

    for (const url of ['/api/auth/me', '/api/decks', '/api/decks/1', '/api/cards/1/image']) {
      assert.equal((await app.request('GET', url)).status, 401, url);
    }

    const forged = [
      `${token.slice(0, -4)}AAAA`, // zmieniony podpis
      jwt.sign({ ver: 0 }, 'inny-sekret', { subject: String(user.id) }), // podpisany cudzym sekretem
      jwt.sign({ ver: 0 }, JWT_SECRET, { subject: String(user.id), expiresIn: -10 }), // przeterminowany
      jwt.sign({ ver: 0 }, JWT_SECRET, { subject: '999999' }), // nieistniejący użytkownik
      `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(`{"sub":"${user.id}","ver":0}`).toString('base64url')}.`,
      'byle-co',
    ];
    for (const badToken of forged) {
      const response = await app.request('GET', '/api/decks', { token: badToken });
      assert.equal(response.status, 401, badToken);
    }
  });

  test('zmiana hasła unieważnia wcześniej wydane tokeny', async () => {
    const { token: oldToken } = await app.register('Edyta', 'stare-haslo-1');

    const wrong = await app.request('PUT', '/api/auth/password', { token: oldToken, json: { currentPassword: 'nie-to', newPassword: 'nowe-haslo-22' } });
    assert.equal(wrong.status, 403);

    const tooShort = await app.request('PUT', '/api/auth/password', { token: oldToken, json: { currentPassword: 'stare-haslo-1', newPassword: 'abc' } });
    assert.equal(tooShort.status, 422);

    const changed = await app.request('PUT', '/api/auth/password', { token: oldToken, json: { currentPassword: 'stare-haslo-1', newPassword: 'nowe-haslo-22' } });
    assert.equal(changed.status, 200);

    assert.equal((await app.request('GET', '/api/auth/me', { token: oldToken })).status, 401);
    assert.equal((await app.request('GET', '/api/auth/me', { token: changed.body.token })).status, 200);
    assert.equal((await app.request('POST', '/api/auth/login', { json: { username: 'Edyta', password: 'stare-haslo-1' } })).status, 401);
    assert.equal((await app.request('POST', '/api/auth/login', { json: { username: 'Edyta', password: 'nowe-haslo-22' } })).status, 200);
  });

  test('usunięcie konta kasuje zestawy, fiszki i pliki oraz zwalnia nazwę', async () => {
    const { token, user } = await app.register('Filip', 'haslo-filipa-1');
    const deck = (await app.request('POST', '/api/decks', { token, json: { name: 'Do usunięcia' } })).body.deck;
    const card = (
      await app.request('POST', `/api/decks/${deck.id}/cards`, {
        token,
        form: cardForm({ front: 'a', back: 'b' }, { data: PNG, type: 'image/png', name: 'a.png' }),
      })
    ).body.card;
    const file = app.db.get('SELECT image_file FROM cards WHERE id = ?', card.id).image_file;
    assert.ok(app.uploadedFiles().includes(file));

    assert.equal((await app.request('DELETE', '/api/auth/account', { token, json: { password: 'zle' } })).status, 403);
    assert.equal((await app.request('DELETE', '/api/auth/account', { token, json: {} })).status, 422);
    assert.equal((await app.request('DELETE', '/api/auth/account', { token, json: { password: 'haslo-filipa-1' } })).status, 204);

    assert.equal(app.db.get('SELECT COUNT(*) AS n FROM users WHERE id = ?', user.id).n, 0);
    assert.equal(app.db.get('SELECT COUNT(*) AS n FROM decks WHERE id = ?', deck.id).n, 0);
    assert.equal(app.db.get('SELECT COUNT(*) AS n FROM cards WHERE id = ?', card.id).n, 0);
    assert.ok(!app.uploadedFiles().includes(file));
    assert.equal((await app.request('GET', '/api/auth/me', { token })).status, 401);

    await app.register('filip', 'zupelnie-nowe-haslo');
  });
});

describe('zestawy i fiszki', () => {
  let app;
  let token;
  before(async () => {
    app = await startServer();
    ({ token } = await app.register('wlasciciel'));
  });
  after(() => app.stop());

  test('tworzenie, lista, edycja i usuwanie zestawu', async () => {
    const created = await app.request('POST', '/api/decks', { token, json: { name: '  Hiszpański   A1 ', description: 'Podstawy\njęzyka' } });
    assert.equal(created.status, 201);
    const { deck } = created.body;
    assert.equal(deck.name, 'Hiszpański A1');
    assert.equal(deck.description, 'Podstawy\njęzyka');
    assert.equal(deck.frontLang, 'auto');
    assert.equal(deck.backLang, 'auto');
    assert.equal(deck.cardCount, 0);

    const list = await app.request('GET', '/api/decks', { token });
    assert.ok(list.body.decks.some((item) => item.id === deck.id));

    const patched = await app.request('PATCH', `/api/decks/${deck.id}`, { token, json: { frontLang: 'es-ES', backLang: 'pl-PL' } });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.deck.name, 'Hiszpański A1', 'pola nieprzesłane w PATCH pozostają bez zmian');
    assert.equal(patched.body.deck.frontLang, 'es-ES');

    assert.equal((await app.request('PATCH', `/api/decks/${deck.id}`, { token, json: { name: '   ' } })).status, 422);
    assert.equal((await app.request('PATCH', `/api/decks/${deck.id}`, { token, json: { frontLang: 'x"><script>' } })).status, 422);
    assert.equal((await app.request('POST', '/api/decks', { token, json: { name: 'x'.repeat(81) } })).status, 422);

    assert.equal((await app.request('DELETE', `/api/decks/${deck.id}`, { token })).status, 204);
    assert.equal((await app.request('GET', `/api/decks/${deck.id}`, { token })).status, 404);
  });

  test('fiszki: dodawanie, kolejność, edycja i usuwanie', async () => {
    const deck = (await app.request('POST', '/api/decks', { token, json: { name: 'Kolejność' } })).body.deck;

    for (const [front, back] of [['jeden', 'one'], ['dwa', 'two'], ['trzy', 'three']]) {
      const response = await app.request('POST', `/api/decks/${deck.id}/cards`, { token, json: { front, back } });
      assert.equal(response.status, 201);
      assert.equal(response.body.card.image, null);
      assert.equal(response.body.card.imageSide, 'both');
    }

    const loaded = await app.request('GET', `/api/decks/${deck.id}`, { token });
    assert.deepEqual(loaded.body.cards.map((card) => card.front), ['jeden', 'dwa', 'trzy']);
    assert.equal(loaded.body.deck.cardCount, 3);

    const [first, second] = loaded.body.cards;
    const edited = await app.request('PATCH', `/api/cards/${first.id}`, { token, json: { back: 'uno\r\ndos' } });
    assert.equal(edited.body.card.front, 'jeden');
    assert.equal(edited.body.card.back, 'uno\ndos');

    assert.equal((await app.request('PATCH', `/api/cards/${first.id}`, { token, json: { front: '' } })).status, 422);
    assert.equal((await app.request('POST', `/api/decks/${deck.id}/cards`, { token, json: { front: 'tylko awers' } })).status, 422);
    assert.equal((await app.request('POST', `/api/decks/${deck.id}/cards`, { token, json: { front: 'a', back: 'x'.repeat(2001) } })).status, 422);

    assert.equal((await app.request('DELETE', `/api/cards/${second.id}`, { token })).status, 204);
    assert.equal((await app.request('DELETE', `/api/cards/${second.id}`, { token })).status, 404);
    const after = await app.request('GET', `/api/decks/${deck.id}`, { token });
    assert.deepEqual(after.body.cards.map((card) => card.front), ['jeden', 'trzy']);
  });

  test('treść jest zapisywana dosłownie (zapytania parametryzowane, brak interpretacji HTML/SQL)', async () => {
    const nasty = `Robert'); DROP TABLE cards;-- <img src=x onerror=alert(1)>`;
    const deck = (await app.request('POST', '/api/decks', { token, json: { name: nasty } })).body.deck;
    assert.equal(deck.name, nasty);
    const card = (await app.request('POST', `/api/decks/${deck.id}/cards`, { token, json: { front: nasty, back: nasty } })).body.card;
    assert.equal(card.front, nasty);
    assert.ok(app.db.get('SELECT COUNT(*) AS n FROM cards').n > 0);
  });

  test('obrazek z adresu URL: tylko http(s)', async () => {
    const deck = (await app.request('POST', '/api/decks', { token, json: { name: 'Adresy' } })).body.deck;

    const ok = await app.request('POST', `/api/decks/${deck.id}/cards`, {
      token,
      json: { front: 'a', back: 'b', imageUrl: ' https://example.com/kot.jpg ', imageSide: 'back' },
    });
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.body.card.image, { kind: 'url', src: 'https://example.com/kot.jpg' });
    assert.equal(ok.body.card.imageSide, 'back');

    for (const imageUrl of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'file:///etc/passwd', 'kot.jpg', 'ftp://example.com/a.png']) {
      const response = await app.request('POST', `/api/decks/${deck.id}/cards`, { token, json: { front: 'a', back: 'b', imageUrl } });
      assert.equal(response.status, 422, imageUrl);
      assert.ok(response.body.error.fields.imageUrl);
    }

    const badSide = await app.request('POST', `/api/decks/${deck.id}/cards`, { token, json: { front: 'a', back: 'b', imageSide: 'middle' } });
    assert.equal(badSide.status, 422);
  });

  test('obrazek z dysku: zapis, odczyt tylko z tokenem, podmiana i usuwanie pliku', async () => {
    const deck = (await app.request('POST', '/api/decks', { token, json: { name: 'Pliki' } })).body.deck;

    const created = await app.request('POST', `/api/decks/${deck.id}/cards`, {
      token,
      form: cardForm({ front: 'kot', back: 'cat', imageSide: 'front' }, { data: PNG, type: 'image/png', name: '../../zdjecie.png' }),
    });
    assert.equal(created.status, 201);
    const { card } = created.body;
    assert.equal(card.image.kind, 'upload');
    assert.match(card.image.src, new RegExp(`^/api/cards/${card.id}/image\\?v=[a-f0-9]{12}$`));

    const fileName = app.db.get('SELECT image_file FROM cards WHERE id = ?', card.id).image_file;
    assert.match(fileName, /^[a-f0-9]{32}\.png$/, 'nazwa pliku jest losowa, a nie wzięta od użytkownika');
    assert.deepEqual(app.uploadedFiles(), [fileName]);

    const image = await app.request('GET', card.image.src, { token });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    assert.match(image.headers.get('cache-control'), /private/);
    assert.ok(image.raw.equals(PNG));

    assert.equal((await app.request('GET', card.image.src)).status, 401, 'bez tokenu obrazek jest niedostępny');
    assert.equal((await app.request('GET', `/uploads/${fileName}`)).status, 404, 'pliki nie są serwowane publicznie');
    assert.equal((await app.request('GET', `/data/uploads/${fileName}`)).status, 404);

    // Edycja samego tekstu nie rusza obrazka.
    const textOnly = await app.request('PATCH', `/api/cards/${card.id}`, { token, json: { back: 'the cat' } });
    assert.deepEqual(textOnly.body.card.image, card.image);

    // Nowy plik zastępuje stary, a stary znika z dysku.
    const replaced = await app.request('PATCH', `/api/cards/${card.id}`, {
      token,
      form: cardForm({ front: 'kot' }, { data: PNG, type: 'image/png', name: 'nowy.png' }),
    });
    assert.equal(replaced.status, 200);
    assert.notEqual(replaced.body.card.image.src, card.image.src);
    assert.equal(app.uploadedFiles().length, 1);
    assert.ok(!app.uploadedFiles().includes(fileName));

    // Zamiana na adres URL usuwa plik.
    const toUrl = await app.request('PATCH', `/api/cards/${card.id}`, { token, json: { imageUrl: 'https://example.com/a.png' } });
    assert.equal(toUrl.body.card.image.kind, 'url');
    assert.deepEqual(app.uploadedFiles(), []);
    assert.equal((await app.request('GET', `/api/cards/${card.id}/image`, { token })).status, 404);

    // removeImage usuwa obrazek całkowicie.
    const removed = await app.request('PATCH', `/api/cards/${card.id}`, { token, json: { removeImage: true } });
    assert.equal(removed.body.card.image, null);
  });

  test('usunięcie fiszki i zestawu usuwa pliki obrazków', async () => {
    const deck = (await app.request('POST', '/api/decks', { token, json: { name: 'Sprzątanie' } })).body.deck;
    const upload = () =>
      app.request('POST', `/api/decks/${deck.id}/cards`, { token, form: cardForm({ front: 'a', back: 'b' }, { data: PNG, type: 'image/png', name: 'a.png' }) });

    const first = (await upload()).body.card;
    await upload();
    await upload();
    assert.equal(app.uploadedFiles().length, 3);

    await app.request('DELETE', `/api/cards/${first.id}`, { token });
    assert.equal(app.uploadedFiles().length, 2);

    await app.request('DELETE', `/api/decks/${deck.id}`, { token });
    assert.equal(app.uploadedFiles().length, 0);
    assert.equal(app.db.get('SELECT COUNT(*) AS n FROM cards WHERE deck_id = ?', deck.id).n, 0, 'fiszki usunięte kaskadowo');
  });

  test('odrzuca pliki, które nie są obrazami (liczy się zawartość, nie nazwa)', async () => {
    const deck = (await app.request('POST', '/api/decks', { token, json: { name: 'Złe pliki' } })).body.deck;
    const filesBefore = app.uploadedFiles().length;

    const attempts = [
      { data: Buffer.from('<html><script>alert(1)</script></html>'), type: 'image/png', name: 'udaje.png' },
      { data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), type: 'image/svg+xml', name: 'wektor.svg' },
      { data: Buffer.from('MZ' + 'x'.repeat(64)), type: 'image/jpeg', name: 'program.jpg' },
      { data: Buffer.alloc(0), type: 'image/png', name: 'pusty.png' },
    ];
    for (const file of attempts) {
      const response = await app.request('POST', `/api/decks/${deck.id}/cards`, { token, form: cardForm({ front: 'a', back: 'b' }, file) });
      assert.equal(response.status, 415, file.name);
      assert.equal(response.body.error.code, 'unsupported_image');
    }

    assert.equal(app.uploadedFiles().length, filesBefore, 'odrzucone pliki nie zostają na dysku');
    assert.equal((await app.request('GET', `/api/decks/${deck.id}`, { token })).body.cards.length, 0);
  });

  test('nieudany zapis fiszki nie zostawia osieroconego pliku', async (t) => {
    const deck = (await app.request('POST', '/api/decks', { token, json: { name: 'Sieroty' } })).body.deck;
    const card = (await app.request('POST', `/api/decks/${deck.id}/cards`, { token, json: { front: 'a', back: 'b' } })).body.card;
    const filesBefore = app.uploadedFiles().length;
    const file = { data: PNG, type: 'image/png', name: 'a.png' };

    // Błąd walidacji: plik w ogóle nie trafia na dysk.
    const invalid = await app.request('POST', `/api/decks/${deck.id}/cards`, { token, form: cardForm({ front: 'tylko awers', back: '' }, file) });
    assert.equal(invalid.status, 422);
    assert.equal(app.uploadedFiles().length, filesBefore);

    // Awaria bazy już po zapisaniu pliku: plik musi zostać posprzątany, a klient nie poznaje szczegółów błędu.
    t.mock.method(console, 'error', () => {});
    t.mock.method(app.db, 'transaction', () => {
      throw new Error('symulowana awaria bazy danych');
    });

    const attempts = [
      ['POST', `/api/decks/${deck.id}/cards`, cardForm({ front: 'a', back: 'b' }, file)],
      ['PATCH', `/api/cards/${card.id}`, cardForm({ front: 'zmiana' }, file)],
    ];
    for (const [method, url, form] of attempts) {
      const failed = await app.request(method, url, { token, form });
      assert.equal(failed.status, 500, `${method} ${url}`);
      assert.equal(failed.body.error.code, 'internal_error');
      assert.ok(!JSON.stringify(failed.body).includes('symulowana'), 'szczegóły błędu nie wyciekają do klienta');
      assert.equal(app.uploadedFiles().length, filesBefore, `${method}: plik został posprzątany`);
    }

    t.mock.restoreAll();
    assert.equal((await app.request('GET', `/api/decks/${deck.id}`, { token })).body.cards.length, 1);
  });

  test('przykładowy zestaw zawiera fiszki z obrazkami', async () => {
    const created = await app.request('POST', '/api/decks/sample', { token });
    assert.equal(created.status, 201);
    const loaded = await app.request('GET', `/api/decks/${created.body.deck.id}`, { token });
    assert.equal(loaded.body.cards.length, 10);
    assert.equal(loaded.body.deck.frontLang, 'auto');

    const withImages = loaded.body.cards.filter((card) => card.image);
    assert.equal(withImages.length, 3);
    for (const card of withImages) {
      const image = await app.request('GET', card.image.src, { token });
      assert.equal(image.status, 200);
      assert.equal(image.headers.get('content-type'), 'image/webp');
    }
  });

  test('błędne żądania dostają czytelną odpowiedź JSON', async () => {
    const malformed = await app.request('POST', '/api/decks', { token, json: '{"name": ' });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, 'invalid_json');

    const unknown = await app.request('GET', '/api/nie-ma-takiego', { token });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, 'not_found');

    for (const id of ['abc', '0', '-1', '1.5', '1e3', '99999999999999999999', '1 OR 1=1']) {
      assert.equal((await app.request('GET', `/api/decks/${encodeURIComponent(id)}`, { token })).status, 404, id);
    }
  });
});

describe('izolacja danych między użytkownikami', () => {
  let app;
  let alice;
  let bob;
  let deck;
  let card;

  before(async () => {
    app = await startServer();
    alice = (await app.register('alicja')).token;
    bob = (await app.register('bogdan')).token;

    deck = (await app.request('POST', '/api/decks', { token: alice, json: { name: 'Prywatny zestaw Alicji', description: 'sekret' } })).body.deck;
    card = (
      await app.request('POST', `/api/decks/${deck.id}/cards`, {
        token: alice,
        form: cardForm({ front: 'tajne pytanie', back: 'tajna odpowiedź' }, { data: PNG, type: 'image/png', name: 'a.png' }),
      })
    ).body.card;
  });
  after(() => app.stop());

  test('lista zestawów zawiera wyłącznie własne zestawy', async () => {
    assert.deepEqual((await app.request('GET', '/api/decks', { token: bob })).body.decks, []);
    assert.equal((await app.request('GET', '/api/decks', { token: alice })).body.decks.length, 1);
  });

  test('cudzy zestaw i cudza fiszka są nieodróżnialne od nieistniejących (404)', async () => {
    const attempts = [
      ['GET', `/api/decks/${deck.id}`],
      ['PATCH', `/api/decks/${deck.id}`, { json: { name: 'Przejęty' } }],
      ['DELETE', `/api/decks/${deck.id}`],
      ['POST', `/api/decks/${deck.id}/cards`, { json: { front: 'wstrzyknięta', back: 'fiszka' } }],
      ['POST', `/api/decks/${deck.id}/cards`, { form: cardForm({ front: 'a', back: 'b' }, { data: PNG, type: 'image/png', name: 'a.png' }) }],
      ['GET', `/api/cards/${card.id}/image`],
      ['PATCH', `/api/cards/${card.id}`, { json: { front: 'zmienione' } }],
      ['PATCH', `/api/cards/${card.id}`, { json: { removeImage: true } }],
      ['DELETE', `/api/cards/${card.id}`],
    ];

    for (const [method, url, options] of attempts) {
      const asBob = await app.request(method, url, { token: bob, ...options });
      assert.equal(asBob.status, 404, `${method} ${url}`);
      assert.equal(asBob.body.error.code, 'not_found');
      assert.ok(!JSON.stringify(asBob.body).includes('Alicj'), 'odpowiedź nie ujawnia cudzych danych');
    }

    // Odpowiedź dla cudzego zasobu jest identyczna jak dla nieistniejącego.
    const foreign = await app.request('GET', `/api/decks/${deck.id}`, { token: bob });
    const missing = await app.request('GET', '/api/decks/987654', { token: bob });
    assert.deepEqual(foreign.body, missing.body);
  });

  test('po próbach dostępu dane właścicielki są nienaruszone', async () => {
    const loaded = await app.request('GET', `/api/decks/${deck.id}`, { token: alice });
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.deck.name, 'Prywatny zestaw Alicji');
    assert.equal(loaded.body.cards.length, 1);
    assert.equal(loaded.body.cards[0].front, 'tajne pytanie');
    assert.equal(loaded.body.cards[0].image.kind, 'upload');
    assert.equal(app.uploadedFiles().length, 1, 'odrzucone przesłania Bogdana nie zostawiły plików');
    assert.equal((await app.request('GET', card.image.src, { token: alice })).status, 200);
  });
});

describe('limity i nagłówki bezpieczeństwa', () => {
  test('blokada po serii nieudanych logowań', async () => {
    const app = await startServer({ limits: { loginFailuresPerUser: 3 } });
    try {
      await app.register('gosia', 'haslo-gosi-123');
      const attempt = (password) => app.request('POST', '/api/auth/login', { json: { username: 'Gosia', password } });

      for (let i = 0; i < 3; i += 1) assert.equal((await attempt('zle-haslo')).status, 401);

      const blocked = await attempt('zle-haslo');
      assert.equal(blocked.status, 429);
      assert.ok(Number(blocked.headers.get('retry-after')) > 0);
      assert.equal((await attempt('haslo-gosi-123')).status, 429, 'w czasie blokady nawet poprawne hasło nie przechodzi');

      // Blokada dotyczy konkretnej nazwy — inne konta logują się normalnie.
      await app.register('henryk', 'haslo-henryka-1');
      assert.equal((await app.request('POST', '/api/auth/login', { json: { username: 'henryk', password: 'haslo-henryka-1' } })).status, 200);
    } finally {
      await app.stop();
    }
  });

  test('limit zakładania kont z jednego adresu', async () => {
    const app = await startServer({ limits: { registrationsPerIp: 2 } });
    try {
      await app.register('konto1');
      await app.register('konto2');
      const third = await app.request('POST', '/api/auth/register', { json: { username: 'konto3', password: 'tajne-haslo-123' } });
      assert.equal(third.status, 429);
    } finally {
      await app.stop();
    }
  });

  test('limit rozmiaru przesyłanego obrazka', async () => {
    const app = await startServer({ maxUploadBytes: 1024 });
    try {
      const { token } = await app.register('duzy.plik');
      const deck = (await app.request('POST', '/api/decks', { token, json: { name: 'Limit' } })).body.deck;
      const big = Buffer.concat([PNG, Buffer.alloc(4096)]);
      const response = await app.request('POST', `/api/decks/${deck.id}/cards`, {
        token,
        form: cardForm({ front: 'a', back: 'b' }, { data: big, type: 'image/png', name: 'duzy.png' }),
      });
      assert.equal(response.status, 413);
      assert.equal(response.body.error.code, 'file_too_large');
      assert.deepEqual(app.uploadedFiles(), []);
    } finally {
      await app.stop();
    }
  });

  test('nagłówki bezpieczeństwa i brak buforowania odpowiedzi API', async () => {
    const app = await startServer();
    try {
      const response = await app.request('GET', '/api/health');
      assert.equal(response.status, 200);
      const csp = response.headers.get('content-security-policy');
      assert.match(csp, /default-src 'self'/);
      assert.match(csp, /script-src 'self'(;|$)/, "skrypty tylko z własnej domeny, bez 'unsafe-inline'");
      assert.match(csp, /frame-ancestors 'self'/);
      assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-powered-by'), null);
    } finally {
      await app.stop();
    }
  });

  test('ALLOW_EMBEDDING wyłącza blokadę osadzania w ramce', async () => {
    const app = await startServer({ allowEmbedding: true });
    try {
      const response = await app.request('GET', '/api/health');
      assert.equal(response.headers.get('x-frame-options'), null);
      assert.doesNotMatch(response.headers.get('content-security-policy'), /frame-ancestors/);
    } finally {
      await app.stop();
    }
  });
});

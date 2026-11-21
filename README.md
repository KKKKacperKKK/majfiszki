# Fiszki

Aplikacja internetowa do nauki z fiszek: własne zestawy, fiszki z obrazkami, odczyt na głos i tryb nauki z kartą obracaną w 3D.

| Warstwa | Technologia |
| --- | --- |
| Frontend | React 19, React Router, Tailwind CSS 4, Vite |
| Backend | Node.js, Express 5 (REST API) |
| Baza danych | Netlify Database (Postgres) |
| Obrazki | Netlify Blobs albo zewnętrzny adres URL |

## Co potrafi

- **Konta wyłącznie na nazwę użytkownika i hasło.** Bez adresu e-mail, numeru telefonu, kodów weryfikacyjnych i logowania przez zewnętrzne serwisy. Hasła są haszowane algorytmem bcrypt, a sesja to token JWT.
- **Prywatne dane.** Każdy użytkownik widzi tylko własne zestawy, fiszki i obrazki.
- **Zestawy i fiszki.** Tworzenie, edycja i usuwanie (zawsze z potwierdzeniem). Fiszka ma awers, rewers i opcjonalny obrazek — wgrany z dysku, przeciągnięty, wklejony ze schowka albo podany jako adres URL.
- **Odczyt na głos.** Ikona głośnika po obu stronach każdej fiszki (Web Speech API przeglądarki). Język jest rozpoznawany automatycznie albo wybierany ręcznie — osobno dla awersu i rewersu.
- **Tryby nauki.** Klasyczny przegląd fiszek oraz „Lekcja” z partią 5–50 kart, samooceną, czterema ocenami i 5 przegródkami Leitnera. Postęp jest zapisywany osobno dla użytkownika; trudne fiszki można od razu edytować.
- **Wygląd.** Motyw jasny i ciemny, układ dopasowany do telefonu i komputera.

## Uruchomienie lokalne

### 1. Wymagania

**Node.js 22.13 lub nowszy** oraz [Netlify CLI](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/):

```bash
node -v
npm install -g netlify-cli
```

### 2. Zainstaluj zależności

W katalogu projektu:

```bash
npm ci
```

### 3. Uruchom lokalne środowisko Netlify

```bash
netlify link
npm run dev
```

`npm run dev` uruchamia Netlify CLI, które udostępnia Vite i lokalne integracje Netlify Database oraz Blobs.

## Konfiguracja (opcjonalna)

W środowisku Netlify `NETLIFY_DB_URL` i konfiguracja Blobs są dostarczane przez platformę. Ustaw `JWT_SECRET` jako poufną zmienną środowiskową witryny (minimum 32 losowe znaki); bez niej aplikacja zapisze wygenerowany sekret w Netlify Blobs.

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `PORT` | `3000` | port serwera |
| `HOST` | `0.0.0.0` | adres, na którym serwer nasłuchuje |
| `JWT_SECRET` | losowy, zapisany w Netlify Blobs | sekret do podpisywania tokenów (min. 32 znaki) |
| `JWT_EXPIRES_IN` | `7d` | czas ważności sesji |
| `BCRYPT_ROUNDS` | `12` | koszt haszowania haseł |
| `MAX_UPLOAD_MB` | `5` | maksymalny rozmiar obrazka |
| `TRUST_PROXY` | — | liczba serwerów pośredniczących (zwykle `1`), gdy aplikacja działa za nginx, Caddy itp. |
| `ALLOW_EMBEDDING` | — | `1` pozwala osadzić aplikację poza Netlify; na Netlify polityka CSP i `X-Frame-Options` w `netlify.toml` domyślnie zezwalają tylko na tę samą domenę |

## Wdrożenie na Netlify

1. Wypchnij repozytorium do GitHub, GitLab lub Bitbucket i zaimportuj je jako nową witrynę Netlify. Katalog bazowy pozostaw jako katalog główny repozytorium.
2. `netlify.toml` ustawia polecenie builda (`npm run build`), katalog publikacji (`dist`) i Node.js 22. Nie nadpisuj tych ustawień w panelu.
3. Włącz **Netlify Server**. Ta funkcja jest Early Access i wymaga planu z kredytami lub Enterprise.
4. Utwórz/włącz **Netlify Database** (dostępna w planach z kredytami). Netlify automatycznie stosuje migracje z `netlify/database/migrations/` podczas wdrożeń.
5. Dodaj `JWT_SECRET` w ustawieniach zmiennych środowiskowych witryny. Nie zapisuj sekretów w repozytorium ani `netlify.toml`.
6. Wypchnij zmiany i po wdrożeniu sprawdź `/api/health`, a następnie zarejestruj konto i utwórz talię.

Backend jest obsługiwany przez Netlify Server pod `/api/*`; frontend jest publikowany jako statyczny build. Plik `data/fiszki.db` jest lokalnym, starszym plikiem i nie zostanie automatycznie zaimportowany do Netlify Database.

## Tryb deweloperski

```bash
npm run dev
```

Serwer jest dostępny pod adresem wyświetlonym przez CLI.

## Testy

```bash
npm test
```

`node --test tests/leitner.test.js` uruchamia niezależne testy algorytmu Leitnera. Testy API w `tests/api.test.js` pochodzą ze starszej konfiguracji SQLite i wymagają dostosowania do obecnego backendu Netlify Database przed użyciem jako bramki CI.

## Struktura projektu

```
fiszki/
├── server/                  backend (Express)
│   ├── index.js             start serwera
│   ├── app.js               składanie aplikacji: API, pliki frontendu, nagłówki, obsługa błędów
│   ├── db.js                połączenie z Netlify Database (Postgres)
│   ├── auth.js              bcrypt, JWT, middleware wymagające logowania
│   ├── validation.js        sprawdzanie danych wejściowych
│   ├── uploads.js           zapis i weryfikacja przesłanych obrazków
│   ├── rate-limit.js        limity prób logowania i rejestracji
│   ├── routes/              auth.js, decks.js, cards.js — punkty końcowe API
│   └── sample-deck.js       przykładowy zestaw (+ sample-images/)
├── client/                  frontend (React)
│   ├── index.html
│   ├── public/              favicon, wczesne ustawienie motywu
│   └── src/
│       ├── pages/           AuthPage, DecksPage, DeckPage, StudyPage, AccountPage
│       ├── components/      FlipCard, SpeakButton, okna dialogowe, formularze, elementy interfejsu
│       ├── lib/             api.js, auth.jsx, speech.js (TTS), lang.js (wykrywanie języka), images.js
│       └── index.css        Tailwind, kolory obu motywów, animacja obrotu karty
├── tests/api.test.js        testy API
├── db/schema.ts             schemat bazy danych
├── netlify/database/        migracje Postgresa
├── netlify/server/          backend Express dla Netlify Server
├── netlify.toml             konfiguracja builda, routingu i nagłówków
└── dist/                    zbudowany frontend (wynik `npm run build`)
```

## Baza danych

Schemat Drizzle znajduje się w `db/schema.ts`; wersjonowane migracje są w `netlify/database/migrations/` i Netlify stosuje je automatycznie podczas wdrożeń.

| Tabela | Najważniejsze kolumny |
| --- | --- |
| `users` | `username`, `username_key` (nazwa małymi literami, unikalna), `password_hash` (bcrypt), `token_version` |
| `decks` | `user_id` → `users`, `name`, `description`, `front_lang`, `back_lang` (język odczytu: `auto` albo np. `en-US`) |
| `cards` | `deck_id` → `decks`, `front`, `back`, `image_file` (plik w Netlify Blobs) albo `image_url`, `image_side`, `position` |
| `learning_progress` | para `user_id` + `card_id`, `box` (1–5), `next_review_at`, `consecutive_fails` |

Usunięcie użytkownika usuwa jego zestawy, a usunięcie zestawu — jego fiszki (`ON DELETE CASCADE`); serwer kasuje przy tym pliki obrazków.

Kopie zapasowe i zarządzanie danymi produkcyjnymi wykonuj w Netlify Database. Lokalny `data/fiszki.db` nie jest bazą używaną przez wdrożenie Netlify.

## API

Wszystkie adresy poza rejestracją, logowaniem i `/api/health` wymagają nagłówka `Authorization: Bearer <token>`.

| Metoda | Adres | Opis |
| --- | --- | --- |
| `POST` | `/api/auth/register` | rejestracja: `{ username, password }` → `{ token, user }` |
| `POST` | `/api/auth/login` | logowanie: `{ username, password }` → `{ token, user }` |
| `GET` | `/api/auth/me` | zalogowany użytkownik |
| `PUT` | `/api/auth/password` | zmiana hasła: `{ currentPassword, newPassword }` |
| `DELETE` | `/api/auth/account` | usunięcie konta: `{ password }` |
| `GET` | `/api/decks` | lista zestawów |
| `POST` | `/api/decks` | nowy zestaw: `{ name, description?, frontLang?, backLang? }` |
| `POST` | `/api/decks/sample` | przykładowy zestaw |
| `GET` | `/api/decks/:id` | zestaw z fiszkami |
| `GET` | `/api/decks/:id/lesson?limit=15` | wybór zaległych i nowych fiszek do lekcji (limit 1–50) |
| `POST` | `/api/decks/:id/lesson/:cardId/rate` | zapis oceny `{ rating: "again" | "hard" | "medium" | "easy" }` |
| `PATCH` | `/api/decks/:id` | edycja zestawu |
| `DELETE` | `/api/decks/:id` | usunięcie zestawu z fiszkami i obrazkami |
| `POST` | `/api/decks/:id/cards` | nowa fiszka: JSON `{ front, back, imageUrl?, imageSide? }` albo `multipart/form-data` z plikiem `image` |
| `PATCH` | `/api/cards/:id` | edycja fiszki (`removeImage: true` usuwa obrazek) |
| `DELETE` | `/api/cards/:id` | usunięcie fiszki |
| `GET` | `/api/cards/:id/image` | obrazek wgrany do fiszki |
| `GET` | `/api/health` | kontrola działania serwera |

Błędy mają postać `{ "error": { "code", "message", "fields"? } }`.

## Bezpieczeństwo

- **Hasła:** bcrypt (koszt 12), od 8 znaków do 72 bajtów. Hasło w postaci jawnej nie jest nigdzie zapisywane.
- **Sesja:** token JWT (HS256, ważny 7 dni) przesyłany w nagłówku `Authorization`. Sekret jest losowany przy pierwszym starcie. Zmiana hasła unieważnia wszystkie wcześniej wydane tokeny.
- **Izolacja danych:** każde zapytanie o zestaw, fiszkę lub obrazek zawiera warunek na właściciela. Cudzy zasób zwraca `404` — tak samo jak nieistniejący.
- **Limity:** 8 nieudanych logowań na 15 minut dla pary adres IP + nazwa użytkownika, 60 dla adresu IP, 30 nowych kont na godzinę z jednego adresu IP.
- **Obrazki:** typ pliku jest sprawdzany po zawartości (JPG, PNG, WebP, GIF, AVIF; SVG jest odrzucany), pliki dostają losowe nazwy i są wydawane tylko właścicielowi.
- **Przeglądarka:** polityka CSP bez skryptów i stylów wpisanych w HTML, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.

Świadome kompromisy:

- Token jest przechowywany w `localStorage`. Dzięki temu aplikacja nie jest podatna na ataki CSRF i działa także osadzona w ramce; przed kradzieżą tokenu chroni ścisła polityka CSP i to, że treść użytkowników jest zawsze wyświetlana jako tekst.
- Zapomnianego hasła nie da się odzyskać — to bezpośredni skutek braku adresu e-mail. Hasło można zmienić po zalogowaniu (menu konta).
- Wylogowanie usuwa token z przeglądarki. Wylogowanie ze wszystkich urządzeń naraz zapewnia zmiana hasła.
- Obrazek podany jako adres URL przeglądarka pobiera bezpośrednio z zewnętrznego serwera (bez nagłówka `Referer`); serwer aplikacji go nie kopiuje.
- Liczniki limitów są trzymane w pamięci procesu, więc aplikacja jest przewidziana do pracy w jednej instancji.

## Odczyt na głos

Aplikacja korzysta z syntezatora mowy wbudowanego w przeglądarkę (`speechSynthesis`), więc lista dostępnych głosów zależy od systemu i przeglądarki. Jeśli dla wybranego języka nie ma głosu, aplikacja o tym informuje. Głosy można doinstalować w ustawieniach systemu (Windows: *Czas i język → Mowa*, macOS: *Dostępność → Zawartość mówiona*, Android: *Zamiana tekstu na mowę*).

Język odczytu ustawia się dla zestawu, osobno dla awersu i rewersu: w oknie **Edytuj zestaw** albo ikoną języka w trybie nauki. W trybie **Automatycznie** język jest rozpoznawany na podstawie treści wszystkich fiszek w zestawie. Jest to heurystyka: pewnie rozpoznaje teksty ze znakami diakrytycznymi i całe zdania, a przy kilku krótkich słowach może się pomylić — wtedy wystarczy wybrać język ręcznie.

## Skróty w trybie nauki

| Działanie | Klawiatura | Mysz / dotyk |
| --- | --- | --- |
| Odwrócenie fiszki | `Spacja` lub `Enter` | kliknięcie lub dotknięcie karty |
| Następna fiszka | `→` | przycisk „Następna”, przesunięcie palcem w lewo |
| Poprzednia fiszka | `←` | przycisk „Poprzednia”, przesunięcie palcem w prawo |

## Rozwiązywanie problemów

| Objaw | Rozwiązanie |
| --- | --- |
| Backend nie łączy się z bazą | Sprawdź, czy witryna Netlify ma włączoną Netlify Database i czy lokalnie uruchamiasz aplikację przez `netlify dev`. |
| Netlify nie uruchamia backendu | Sprawdź dostęp do Netlify Server (Early Access) i czy plik `netlify/server/index.mjs` jest w repozytorium. |
| „Frontend nie został jeszcze zbudowany” | Uruchom `npm run build`. |
| Głośnik nie czyta albo czyta ze złym akcentem | Sprawdź, czy system ma głos dla danego języka, i wybierz język ręcznie w ustawieniach zestawu. |
| Obrazek z adresu URL się nie wyświetla | Adres musi prowadzić bezpośrednio do pliku graficznego, a serwer, z którego pochodzi, musi pozwalać na jego wyświetlanie na innych stronach. |

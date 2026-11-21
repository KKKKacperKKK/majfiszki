# Fiszki

Aplikacja internetowa do nauki z fiszek: własne zestawy, fiszki z obrazkami, odczyt na głos i tryb nauki z kartą obracaną w 3D.

| Warstwa | Technologia |
| --- | --- |
| Frontend | React 19, React Router, Tailwind CSS 4, Vite |
| Backend | Node.js, Express 5 (REST API) |
| Baza danych | SQLite — jeden plik, obsługiwany przez wbudowany moduł `node:sqlite` |
| Obrazki | pliki na dysku serwera (`data/uploads`) albo zewnętrzny adres URL |

## Co potrafi

- **Konta wyłącznie na nazwę użytkownika i hasło.** Bez adresu e-mail, numeru telefonu, kodów weryfikacyjnych i logowania przez zewnętrzne serwisy. Hasła są haszowane algorytmem bcrypt, a sesja to token JWT.
- **Prywatne dane.** Każdy użytkownik widzi tylko własne zestawy, fiszki i obrazki.
- **Zestawy i fiszki.** Tworzenie, edycja i usuwanie (zawsze z potwierdzeniem). Fiszka ma awers, rewers i opcjonalny obrazek — wgrany z dysku, przeciągnięty, wklejony ze schowka albo podany jako adres URL.
- **Odczyt na głos.** Ikona głośnika po obu stronach każdej fiszki (Web Speech API przeglądarki). Język jest rozpoznawany automatycznie albo wybierany ręcznie — osobno dla awersu i rewersu.
- **Tryb nauki.** Duża karta obracana w 3D kliknięciem lub spacją, przyciski „Poprzednia” / „Następna”, strzałki na klawiaturze, przesunięcia palcem na telefonie, licznik postępu („3 / 15”) i przycisk „Tasuj”.
- **Wygląd.** Motyw jasny i ciemny, układ dopasowany do telefonu i komputera.

## Uruchomienie krok po kroku

### 1. Wymagania

**Node.js 22.13 lub nowszy** (najlepiej aktualna wersja LTS z [nodejs.org](https://nodejs.org)). Sprawdzenie wersji:

```bash
node -v
```

Niczego więcej nie trzeba instalować — baza danych to plik tworzony automatycznie przy pierwszym uruchomieniu.

### 2. Zainstaluj zależności

W katalogu projektu:

```bash
npm install
```

### 3. Zbuduj frontend

```bash
npm run build
```

### 4. Uruchom serwer

```bash
npm start
```

W konsoli pojawi się:

```
Fiszki działają:  http://localhost:3000
Baza danych:      …/data/fiszki.db (node:sqlite)
Obrazki:          …/data/uploads
```

### 5. Otwórz aplikację

1. Wejdź na <http://localhost:3000>.
2. Kliknij **Załóż konto**, podaj nazwę użytkownika i hasło (co najmniej 8 znaków).
3. Wybierz **Dodaj przykładowy zestaw** albo **Utwórz zestaw** i dodaj własne fiszki.
4. Kliknij **Ucz się**.

Serwer zatrzymuje `Ctrl + C`. Wszystkie dane (baza, obrazki, sekret JWT) zostają w katalogu `data/`.

## Konfiguracja (opcjonalna)

Aplikacja działa bez żadnej konfiguracji. Aby coś zmienić, skopiuj `.env.example` jako `.env` i ustaw wybrane zmienne:

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `PORT` | `3000` | port serwera |
| `HOST` | `0.0.0.0` | adres, na którym serwer nasłuchuje |
| `JWT_SECRET` | losowy, zapisany w `data/.jwt-secret` | sekret do podpisywania tokenów (min. 32 znaki) |
| `JWT_EXPIRES_IN` | `7d` | czas ważności sesji |
| `BCRYPT_ROUNDS` | `12` | koszt haszowania haseł |
| `DATA_DIR` | `data` | katalog z bazą i obrazkami |
| `MAX_UPLOAD_MB` | `5` | maksymalny rozmiar obrazka |
| `TRUST_PROXY` | — | liczba serwerów pośredniczących (zwykle `1`), gdy aplikacja działa za nginx, Caddy itp. |
| `ALLOW_EMBEDDING` | — | `1` pozwala osadzić aplikację w ramce `<iframe>` na innej stronie |
| `SQLITE_DRIVER` | `auto` | `node` albo `better-sqlite3` (patrz „Rozwiązywanie problemów”) |

## Tryb deweloperski

```bash
npm run dev
```

Uruchamia serwer API (z automatycznym restartem po zmianie plików) oraz serwer Vite z odświeżaniem na żywo. Aplikacja jest wtedy dostępna pod adresem <http://localhost:5173>.

## Testy

```bash
npm test
```

28 testów uruchamia prawdziwy serwer z tymczasową bazą i sprawdza między innymi: rejestrację i logowanie, haszowanie haseł, brak pól na e-mail i telefon w bazie, odrzucanie podrobionych tokenów, izolację danych między użytkownikami, wgrywanie i usuwanie obrazków, limity prób logowania i nagłówki bezpieczeństwa.

## Struktura projektu

```
fiszki/
├── server/                  backend (Express)
│   ├── index.js             start serwera
│   ├── app.js               składanie aplikacji: API, pliki frontendu, nagłówki, obsługa błędów
│   ├── schema.sql           schemat bazy danych
│   ├── db.js                połączenie z SQLite
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
├── scripts/dev.js           tryb deweloperski
├── data/                    baza, obrazki i sekret JWT (tworzone przy starcie, poza repozytorium)
└── dist/                    zbudowany frontend (wynik `npm run build`)
```

## Baza danych

Pełny schemat: [`server/schema.sql`](server/schema.sql). Jest zakładany automatycznie przy starcie serwera.

| Tabela | Najważniejsze kolumny |
| --- | --- |
| `users` | `username`, `username_key` (nazwa małymi literami, unikalna), `password_hash` (bcrypt), `token_version` |
| `decks` | `user_id` → `users`, `name`, `description`, `front_lang`, `back_lang` (język odczytu: `auto` albo np. `en-US`) |
| `cards` | `deck_id` → `decks`, `front`, `back`, `image_file` (plik w `data/uploads`) albo `image_url`, `image_side`, `position` |

Usunięcie użytkownika usuwa jego zestawy, a usunięcie zestawu — jego fiszki (`ON DELETE CASCADE`); serwer kasuje przy tym pliki obrazków.

**Kopia zapasowa** to kopia katalogu `data/` wykonana przy zatrzymanym serwerze. **Wyczyszczenie danych:** zatrzymaj serwer i usuń katalog `data/`.

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

## Wdrożenie na serwerze

1. Skopiuj projekt na serwer i wykonaj `npm install`, `npm run build`, `npm start` (najlepiej pod nadzorem menedżera procesów, np. systemd lub pm2).
2. Wystaw aplikację przez serwer pośredniczący z HTTPS (np. Caddy lub nginx) i ustaw `TRUST_PROXY=1`, żeby limity prób liczyły prawdziwe adresy IP.
3. Rób kopie zapasowe katalogu `data/`.

Jeśli hosting instaluje zależności z `NODE_ENV=production`, narzędzia do budowania zostaną pominięte — użyj wtedy `npm install --include=dev` przed `npm run build`.

## Rozwiązywanie problemów

| Objaw | Rozwiązanie |
| --- | --- |
| „Nie udało się uruchomić bazy danych SQLite” | Zaktualizuj Node.js do wersji 22.13 lub nowszej. Na Node.js 20 wykonaj dodatkowo `npm install better-sqlite3`. |
| „Port 3000 jest zajęty” | Ustaw inny port w pliku `.env`, np. `PORT=3001`. |
| „Frontend nie został jeszcze zbudowany” | Uruchom `npm run build`. |
| Głośnik nie czyta albo czyta ze złym akcentem | Sprawdź, czy system ma głos dla danego języka, i wybierz język ręcznie w ustawieniach zestawu. |
| Obrazek z adresu URL się nie wyświetla | Adres musi prowadzić bezpośrednio do pliku graficznego, a serwer, z którego pochodzi, musi pozwalać na jego wyświetlanie na innych stronach. |

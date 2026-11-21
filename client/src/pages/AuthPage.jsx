import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { PasswordField } from '../components/PasswordField.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { Alert, Button, Logo, TextField } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useDocumentTitle } from '../lib/hooks.js';

const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u;

// Te same reguły sprawdza serwer; tutaj służą wyłącznie natychmiastowej informacji zwrotnej.
function validate({ username, password, isRegister }) {
  const errors = {};

  if (!username) {
    errors.username = 'Podaj nazwę użytkownika.';
  } else if (isRegister) {
    const length = [...username].length;
    if (length < 3 || length > 30) errors.username = 'Nazwa użytkownika musi mieć od 3 do 30 znaków.';
    else if (!USERNAME_PATTERN.test(username)) errors.username = 'Nazwa użytkownika może zawierać tylko litery, cyfry oraz znaki . _ -';
  }

  if (!password) {
    errors.password = 'Podaj hasło.';
  } else if (isRegister) {
    if ([...password].length < 8) errors.password = 'Hasło musi mieć co najmniej 8 znaków.';
    else if (new TextEncoder().encode(password).length > 72) errors.password = 'Hasło jest za długie (maksymalnie 72 znaki).';
  }

  return errors;
}

/**
 * Ekran logowania i rejestracji. Konto to wyłącznie nazwa użytkownika i hasło —
 * bez adresu e-mail, numeru telefonu, kodów weryfikacyjnych i logowania przez zewnętrzne serwisy.
 */
export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  useDocumentTitle(isRegister ? 'Załóż konto' : 'Zaloguj się');

  const { login, register, notice } = useAuth();
  const location = useLocation();
  const usernameRef = useRef(null);
  const passwordRef = useRef(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Komunikaty pamiętają, którego trybu dotyczą: przejście między logowaniem a rejestracją
  // zachowuje wpisane dane, ale nie przenosi błędów z poprzedniego formularza.
  const [feedback, setFeedback] = useState({ mode, errors: {}, formError: null });
  const { errors, formError } = feedback.mode === mode ? feedback : { errors: {}, formError: null };
  const showProblems = (nextErrors, nextFormError = null) => setFeedback({ mode, errors: nextErrors, formError: nextFormError });

  // Na komputerze od razu ustawiamy kursor w pierwszym polu; na telefonie nie wysuwamy klawiatury bez pytania.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) usernameRef.current?.focus();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;

    const name = username.trim();
    const problems = validate({ username: name, password, isRegister });
    if (Object.keys(problems).length > 0) {
      showProblems(problems);
      (problems.username ? usernameRef : passwordRef).current?.focus();
      return;
    }

    setBusy(true);
    showProblems({});
    try {
      await (isRegister ? register(name, password) : login(name, password));
      // Po sukcesie aplikacja sama przełącza się na widok zalogowanego użytkownika.
    } catch (err) {
      setBusy(false);
      const fields = err.fields ?? {};
      showProblems(fields, fields.username || fields.password ? null : err.message);
      (fields.username ? usernameRef : passwordRef).current?.focus();
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex justify-end p-3 sm:p-4">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 flex-col items-center px-4 pb-20 pt-2 sm:justify-center sm:pt-0">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo className="size-14" />
            <p className="mt-4 font-serif text-4xl font-semibold tracking-tight">Fiszki</p>
            <p className="mt-2 text-[15px] text-muted">Twórz własne zestawy i ucz się w swoim tempie.</p>
          </div>

          <div className="rounded-3xl border border-line bg-surface p-6 shadow-pop sm:p-8">
            <h1 className="font-serif text-2xl font-semibold tracking-tight">{isRegister ? 'Załóż konto' : 'Zaloguj się'}</h1>

            {notice ? (
              <Alert tone="info" className="mt-4">
                {notice}
              </Alert>
            ) : null}

            <form onSubmit={handleSubmit} noValidate className="mt-5 grid gap-4">
              <TextField
                ref={usernameRef}
                label="Nazwa użytkownika"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                error={errors.username}
                hint={isRegister ? 'Od 3 do 30 znaków: litery, cyfry oraz . _ -' : undefined}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={64}
                required
              />
              <PasswordField
                ref={passwordRef}
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={errors.password}
                hint={isRegister ? 'Co najmniej 8 znaków.' : undefined}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
              />

              {formError ? <Alert>{formError}</Alert> : null}

              <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-1 w-full">
                {isRegister ? 'Załóż konto' : 'Zaloguj się'}
              </Button>
            </form>

            {isRegister ? (
              <p className="mt-5 text-sm leading-relaxed text-muted text-pretty">
                Zapamiętaj hasło. Konto nie jest powiązane z adresem e-mail ani numerem telefonu, więc zapomnianego hasła nie da się odzyskać.
              </p>
            ) : null}
          </div>

          <p className="mt-6 text-center text-[15px] text-muted">
            {isRegister ? 'Masz już konto?' : 'Nie masz jeszcze konta?'}{' '}
            <Link
              to={isRegister ? '/login' : '/register'}
              state={location.state}
              className="rounded font-semibold text-accent underline-offset-4 hover:underline"
            >
              {isRegister ? 'Zaloguj się' : 'Załóż konto'}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

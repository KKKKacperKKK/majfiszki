import { WifiOff } from 'lucide-react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Layout } from './components/Layout.jsx';
import { Button, Logo, Spinner, StatePanel } from './components/ui.jsx';
import { useAuth } from './lib/auth.jsx';
import AccountPage from './pages/AccountPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import DeckPage from './pages/DeckPage.jsx';
import DecksPage from './pages/DecksPage.jsx';
import LessonPage from './pages/LessonPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import StudyPage from './pages/StudyPage.jsx';

/** Niezalogowany użytkownik trafia na ekran logowania; po zalogowaniu wraca tam, dokąd zmierzał. */
function RedirectToLogin() {
  const location = useLocation();
  return <Navigate to="/login" replace state={{ from: location }} />;
}

/** Zalogowany użytkownik nie ma czego szukać na ekranie logowania. */
function RedirectAfterLogin() {
  const location = useLocation();
  const from = location.state?.from;
  return <Navigate to={from ? { pathname: from.pathname, search: from.search } : '/'} replace />;
}

export default function App() {
  const { status, user, error, retry } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5" role="status" aria-label="Wczytywanie">
        <Logo className="size-12" />
        <Spinner className="size-5 text-muted" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <StatePanel icon={WifiOff} title="Nie udało się połączyć z serwerem" actions={<Button variant="primary" onClick={retry}>Spróbuj ponownie</Button>}>
          {error?.message}
        </StatePanel>
      </div>
    );
  }

  if (status === 'anonymous') {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="*" element={<RedirectToLogin />} />
      </Routes>
    );
  }

  // Klucz z identyfikatorem użytkownika: po zmianie konta wszystkie strony wczytują dane od nowa.
  return (
    <Routes key={user.id}>
      <Route element={<Layout />}>
        <Route index element={<DecksPage />} />
        <Route path="decks/:deckId" element={<DeckPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="decks/:deckId/study" element={<StudyPage />} />
      <Route path="decks/:deckId/lesson" element={<LessonPage />} />
      <Route path="login" element={<RedirectAfterLogin />} />
      <Route path="register" element={<RedirectAfterLogin />} />
    </Routes>
  );
}

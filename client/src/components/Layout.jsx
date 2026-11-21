import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { Link, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth.jsx';
import { Menu, MenuItem } from './Menu.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { Logo } from './ui.jsx';

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <Menu
      label="Konto"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="flex h-10 items-center gap-2 rounded-xl pl-1.5 pr-2 text-sm font-medium text-ink transition-colors hover:bg-subtle"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold uppercase text-accent" aria-hidden="true">
            {[...user.username][0]}
          </span>
          <span className="hidden max-w-40 truncate sm:block">{user.username}</span>
          <span className="sr-only sm:hidden">Konto: {user.username}</span>
          <ChevronDown className="size-4 text-muted" aria-hidden="true" />
        </button>
      )}
    >
      <p className="truncate px-3 pb-2 pt-1.5 text-xs text-muted sm:hidden">
        Zalogowano jako <span className="font-semibold text-ink">{user.username}</span>
      </p>
      <MenuItem icon={UserRound} to="/account">
        Konto
      </MenuItem>
      <MenuItem
        icon={LogOut}
        onSelect={() => {
          logout();
          navigate('/login', { replace: true });
        }}
      >
        Wyloguj się
      </MenuItem>
    </Menu>
  );
}

/** Wspólny układ stron po zalogowaniu: nagłówek z logo, przełącznikiem motywu i menu konta. */
export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-canvas"
      >
        Przejdź do treści
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="-ml-1.5 flex items-center gap-2.5 rounded-lg px-1.5 py-1" aria-label="Fiszki — strona główna">
            <Logo className="size-8" />
            <span className="font-serif text-[22px] font-semibold tracking-tight">Fiszki</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        <Outlet />
      </main>
    </div>
  );
}

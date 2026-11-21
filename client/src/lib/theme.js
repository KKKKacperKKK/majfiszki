import { useSyncExternalStore } from 'react';

const THEME_KEY = 'fiszki.theme';
const THEME_COLORS = { light: '#f8f6f2', dark: '#12100e' };
const listeners = new Set();

function readStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function currentTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function applyTheme(theme, { persist }) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* pamięć przeglądarki niedostępna — motyw obowiązuje do przeładowania strony */
    }
  }
  listeners.forEach((listener) => listener());
}

// Dopóki użytkownik sam nie wybierze motywu, aplikacja podąża za ustawieniem systemu.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (event) => {
  if (!readStoredTheme()) applyTheme(event.matches ? 'dark' : 'light', { persist: false });
});

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Zwraca bieżący motyw ('light' | 'dark') i funkcję przełączającą. Klasę .dark ustawia wcześniej theme-init.js. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme);
  const toggle = () => applyTheme(theme === 'dark' ? 'light' : 'dark', { persist: true });
  return [theme, toggle];
}

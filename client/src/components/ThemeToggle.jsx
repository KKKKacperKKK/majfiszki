import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme.js';
import { IconButton } from './ui.jsx';

/** Przełącznik jasnego i ciemnego motywu. Wybór jest zapamiętywany w przeglądarce. */
export function ThemeToggle({ className }) {
  const [theme, toggleTheme] = useTheme();
  const isDark = theme === 'dark';

  return (
    <IconButton
      label={isDark ? 'Włącz jasny motyw' : 'Włącz ciemny motyw'}
      icon={isDark ? Sun : Moon}
      onClick={toggleTheme}
      className={className}
    />
  );
}

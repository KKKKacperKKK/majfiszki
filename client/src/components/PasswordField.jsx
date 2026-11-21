import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { TextField } from './ui.jsx';

/** Pole hasła z przyciskiem „pokaż / ukryj” — pozwala sprawdzić wpisane hasło bez pola „powtórz hasło”. */
export function PasswordField({ label = 'Hasło', ...props }) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <TextField
      label={label}
      type={visible ? 'text' : 'password'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Ukryj hasło' : 'Pokaż hasło'}
          aria-pressed={visible}
          title={visible ? 'Ukryj hasło' : 'Pokaż hasło'}
          className="flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:text-ink"
        >
          <Icon className="size-[18px]" aria-hidden="true" />
        </button>
      }
      {...props}
    />
  );
}

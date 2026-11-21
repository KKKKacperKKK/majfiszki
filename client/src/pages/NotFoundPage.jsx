import { SearchX } from 'lucide-react';
import { ButtonLink, StatePanel } from '../components/ui.jsx';
import { useDocumentTitle } from '../lib/hooks.js';

export default function NotFoundPage() {
  useDocumentTitle('Nie znaleziono strony');

  return (
    <StatePanel
      icon={SearchX}
      title="Nie znaleziono strony"
      actions={
        <ButtonLink to="/" variant="primary">
          Wróć do zestawów
        </ButtonLink>
      }
    >
      Adres jest nieprawidłowy albo strona została przeniesiona.
    </StatePanel>
  );
}

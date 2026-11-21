import { useId, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cx } from '../lib/utils.js';
import { Alert, Button, IconButton } from './ui.jsx';

const WIDTHS = { sm: 'max-w-md', md: 'max-w-xl' };

/**
 * Okno modalne oparte na natywnym elemencie <dialog>: przeglądarka sama zatrzymuje fokus
 * w oknie, obsługuje klawisz Esc i blokuje resztę strony.
 * Komponent renderuje się tylko wtedy, gdy okno ma być otwarte.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {() => void} props.onClose
 * @param {boolean} [props.busy]               trwa zapis — okna nie da się wtedy zamknąć
 * @param {boolean} [props.dismissOnBackdrop]  czy kliknięcie w tło zamyka okno (wyłączone w formularzach)
 * @param {import('react').ReactNode} [props.footer] przyciski w stopce
 */
export function Dialog({ title, onClose, busy = false, dismissOnBackdrop = true, size = 'md', footer, children }) {
  const dialogRef = useRef(null);
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();

  // useLayoutEffect: przy zamykaniu element jest jeszcze w dokumencie, więc close()
  // może oddać fokus przyciskowi, który otworzył okno.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) {
      // Szerokość paska przewijania mierzymy, zanim zniknie (patrz reguła html:has(dialog[open]) w index.css).
      if (!document.querySelector('dialog[open]')) {
        const root = document.documentElement;
        root.style.setProperty('--scrollbar-width', `${window.innerWidth - root.clientWidth}px`);
      }
      dialog.showModal();
    }
    dialog.querySelector('[data-autofocus]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const requestClose = () => {
    if (!busy) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault(); // o zamknięciu decyduje stan Reacta, nie przeglądarka
        requestClose();
      }}
      onClose={() => {
        // Zdarzenie „close” po naszym własnym close() ignorujemy; reagujemy tylko wtedy,
        // gdy okno zamknęła przeglądarka (np. po dwukrotnym naciśnięciu Esc).
        if (!dialogRef.current?.open) onClose();
      }}
      onMouseDown={(event) => {
        pressedOnBackdrop.current = event.target === dialogRef.current;
      }}
      onClick={(event) => {
        // Zamykamy tylko wtedy, gdy kliknięcie zaczęło się i skończyło na tle
        // (zaznaczanie tekstu z puszczeniem myszy poza oknem nie może go zamknąć).
        if (dismissOnBackdrop && pressedOnBackdrop.current && event.target === dialogRef.current) requestClose();
      }}
      className={cx(
        'm-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] overflow-hidden rounded-3xl border border-line bg-surface p-0 text-ink shadow-pop animate-dialog-in',
        WIDTHS[size],
      )}
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
          <h2 id={titleId} className="font-serif text-2xl font-semibold tracking-tight text-balance">
            {title}
          </h2>
          <IconButton label="Zamknij" icon={X} size="sm" onClick={requestClose} disabled={busy} className="-mr-1.5 -mt-1" />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-line px-5 py-4 sm:px-6">{footer}</footer>
        ) : null}
      </div>
    </dialog>
  );
}

/**
 * Potwierdzenie nieodwracalnej operacji (np. usunięcia fiszki lub zestawu).
 * `onConfirm` może być asynchroniczne; błąd jest pokazywany w oknie, a okno pozostaje otwarte.
 */
export function ConfirmDialog({ title, children, confirmLabel = 'Usuń', cancelLabel = 'Anuluj', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message || 'Coś poszło nie tak. Spróbuj ponownie.');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={title}
      size="sm"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          {/* Fokus trafia na bezpieczną opcję — przypadkowy Enter niczego nie usunie. */}
          <Button variant="secondary" onClick={onClose} disabled={busy} data-autofocus>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[15px] leading-relaxed text-muted text-pretty">{children}</div>
      {error ? <Alert className="mt-4">{error}</Alert> : null}
    </Dialog>
  );
}

import { useState } from 'react';
import { EllipsisVertical, Layers, Pencil, Play, Plus, Sparkles, Trash2, WifiOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { DeckFormDialog } from '../components/DeckFormDialog.jsx';
import { ConfirmDialog } from '../components/Dialog.jsx';
import { Menu, MenuItem } from '../components/Menu.jsx';
import { useToast } from '../components/Toast.jsx';
import { Button, ButtonLink, IconButton, Skeleton, StatePanel } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useDocumentTitle, useFetch } from '../lib/hooks.js';
import { cardsLabel, decksLabel, timeAgo, withCardsPhrase } from '../lib/utils.js';

function DeckTile({ deck, onEdit, onDelete }) {
  return (
    <li className="relative flex flex-col rounded-2xl border border-line bg-surface p-5 transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-pop">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 font-serif text-xl font-semibold leading-snug tracking-tight wrap-anywhere">
          {/* Pseudoelement ::after rozciąga odnośnik na cały kafelek. */}
          <Link
            to={`/decks/${deck.id}`}
            className="outline-hidden after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
          >
            {deck.name}
          </Link>
        </h2>
        <Menu
          label={`Opcje zestawu ${deck.name}`}
          className="-mr-2 -mt-1.5 shrink-0"
          trigger={(props) => <IconButton label={`Opcje zestawu ${deck.name}`} icon={EllipsisVertical} size="sm" {...props} />}
        >
          <MenuItem icon={Pencil} onSelect={onEdit}>
            Edytuj zestaw
          </MenuItem>
          <MenuItem icon={Trash2} danger onSelect={onDelete}>
            Usuń zestaw
          </MenuItem>
        </Menu>
      </div>

      {deck.description ? <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted wrap-anywhere">{deck.description}</p> : null}

      <div className="mt-auto flex items-end justify-between gap-3 pt-6">
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{cardsLabel(deck.cardCount)}</span>
          <span className="mx-1.5" aria-hidden="true">
            ·
          </span>
          {timeAgo(deck.updatedAt)}
        </p>
        {deck.cardCount > 0 ? (
          <ButtonLink to={`/decks/${deck.id}/study`} size="sm" icon={Play} className="relative z-10" aria-label={`Ucz się: ${deck.name}`}>
            Ucz się
          </ButtonLink>
        ) : null}
      </div>
    </li>
  );
}

/** Strona główna po zalogowaniu: lista zestawów zalogowanego użytkownika. */
export default function DecksPage() {
  useDocumentTitle('Zestawy');

  const navigate = useNavigate();
  const toast = useToast();
  const { status, data, error, reload, setData } = useFetch('/decks');
  const [dialog, setDialog] = useState(null); // { type: 'create' } | { type: 'edit' | 'delete', deck }
  const [addingSample, setAddingSample] = useState(false);

  const decks = data?.decks ?? [];
  const totalCards = decks.reduce((sum, deck) => sum + deck.cardCount, 0);

  async function addSampleDeck() {
    setAddingSample(true);
    try {
      const { deck } = await api('/decks/sample', { method: 'POST' });
      navigate(`/decks/${deck.id}`);
    } catch (err) {
      toast(err.message, { type: 'error' });
      setAddingSample(false);
    }
  }

  async function deleteDeck(deck) {
    await api(`/decks/${deck.id}`, { method: 'DELETE' });
    setData((current) => ({ decks: current.decks.filter((item) => item.id !== deck.id) }));
    setDialog(null);
    toast(`Usunięto zestaw „${deck.name}”.`);
  }

  function handleSaved(saved) {
    if (dialog.type === 'create') {
      navigate(`/decks/${saved.id}`); // nowy zestaw otwieramy od razu, żeby można było dodać fiszki
      return;
    }
    // Zmieniony zestaw trafia na początek listy — tak jak po ponownym wczytaniu strony.
    setData((current) => ({ decks: [saved, ...current.decks.filter((item) => item.id !== saved.id)] }));
    setDialog(null);
    toast('Zapisano zmiany.');
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Twoje zestawy</h1>
          <p className="mt-2 min-h-6 text-[15px] text-muted">
            {status === 'ready' && decks.length > 0 ? `${decksLabel(decks.length)} · ${cardsLabel(totalCards)}` : null}
          </p>
        </div>
        {status === 'ready' && decks.length > 0 ? (
          <Button variant="primary" icon={Plus} onClick={() => setDialog({ type: 'create' })}>
            Nowy zestaw
          </Button>
        ) : null}
      </div>

      <div className="mt-8">
        {status === 'loading' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Wczytywanie zestawów">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : null}

        {status === 'error' ? (
          <StatePanel
            icon={WifiOff}
            title="Nie udało się wczytać zestawów"
            actions={
              <Button variant="primary" onClick={reload}>
                Spróbuj ponownie
              </Button>
            }
          >
            {error.message}
          </StatePanel>
        ) : null}

        {status === 'ready' && decks.length === 0 ? (
          <StatePanel
            icon={Layers}
            title="Nie masz jeszcze żadnego zestawu"
            className="rounded-3xl border border-dashed border-line-strong"
            actions={
              <>
                <Button variant="primary" icon={Plus} onClick={() => setDialog({ type: 'create' })}>
                  Utwórz zestaw
                </Button>
                <Button icon={Sparkles} onClick={addSampleDeck} loading={addingSample}>
                  Dodaj przykładowy zestaw
                </Button>
              </>
            }
          >
            Utwórz pierwszy zestaw i dodaj do niego fiszki albo zacznij od gotowego przykładu, żeby zobaczyć, jak działa tryb nauki.
          </StatePanel>
        ) : null}

        {status === 'ready' && decks.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {decks.map((deck) => (
              <DeckTile
                key={deck.id}
                deck={deck}
                onEdit={() => setDialog({ type: 'edit', deck })}
                onDelete={() => setDialog({ type: 'delete', deck })}
              />
            ))}
          </ul>
        ) : null}
      </div>

      {dialog?.type === 'create' || dialog?.type === 'edit' ? (
        <DeckFormDialog deck={dialog.deck} onClose={() => setDialog(null)} onSaved={handleSaved} />
      ) : null}

      {dialog?.type === 'delete' ? (
        <ConfirmDialog
          title="Usunąć zestaw?"
          confirmLabel="Usuń zestaw"
          onConfirm={() => deleteDeck(dialog.deck)}
          onClose={() => setDialog(null)}
        >
          Zestaw <strong className="font-semibold text-ink wrap-anywhere">„{dialog.deck.name}”</strong> zostanie trwale usunięty
          {withCardsPhrase(dialog.deck.cardCount)}. Tej operacji nie można cofnąć.
        </ConfirmDialog>
      ) : null}
    </>
  );
}

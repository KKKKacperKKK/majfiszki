import { useMemo, useState } from 'react';
import { ArrowLeft, GraduationCap, Pencil, Play, Plus, SearchX, SquareStack, Trash2, Volume2, WifiOff } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { CardFormDialog } from '../components/CardFormDialog.jsx';
import { CardImage } from '../components/CardImage.jsx';
import { DeckFormDialog } from '../components/DeckFormDialog.jsx';
import { ConfirmDialog } from '../components/Dialog.jsx';
import { SpeakButton } from '../components/SpeakButton.jsx';
import { useToast } from '../components/Toast.jsx';
import { Button, ButtonLink, IconButton, Skeleton, StatePanel } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useDocumentTitle, useFetch } from '../lib/hooks.js';
import { forgetPrivateImage } from '../lib/images.js';
import { AUTO, detectDeckLanguages, languageName, resolveSpeechLanguage } from '../lib/lang.js';
import { cardsLabel, cx, timeAgo, withCardsPhrase } from '../lib/utils.js';

function shorten(text, max = 90) {
  const chars = [...text.replace(/\s+/g, ' ').trim()];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
}

/** „awers — angielski (USA) [auto]” w podsumowaniu ustawień odczytu. */
function LanguageSummary({ label, setting, detected }) {
  const isAuto = setting === AUTO;
  const language = isAuto ? detected : setting;

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {label} —{' '}
      <span className="font-medium text-ink">{language ? languageName(language) : 'automatycznie'}</span>
      {isAuto && language ? (
        <span className="rounded-md bg-subtle px-1.5 py-px text-[11px] font-medium" title="Język rozpoznany automatycznie na podstawie treści fiszek">
          auto
        </span>
      ) : null}
    </span>
  );
}

function CardSide({ side, text, lang, speakKey, number, className }) {
  return (
    <div className={cx('flex min-w-0 items-start gap-2 p-4 sm:p-5', className)}>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          {number ? (
            <span className="mr-2 tabular-nums text-ink" aria-label={`Fiszka ${number}.`}>
              {number}
            </span>
          ) : null}
          {side === 'front' ? 'Awers' : 'Rewers'}
        </p>
        <p lang={lang} dir="auto" className="line-clamp-6 whitespace-pre-wrap text-[15px] leading-relaxed wrap-anywhere">
          {text}
        </p>
      </div>
      <SpeakButton text={text} lang={lang} speakKey={speakKey} side={side} className="-mr-2 -mt-2" />
    </div>
  );
}

function CardRow({ card, number, frontLang, backLang, reserveImageSpace, onEdit, onDelete }) {
  const name = shorten(card.front, 40);

  return (
    <li
      className={cx(
        'grid rounded-2xl border border-line bg-surface',
        // Stała szerokość ostatniej kolumny wyrównuje linie podziału we wszystkich wierszach.
        reserveImageSpace ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11.5rem]' : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem]',
      )}
    >
      <CardSide side="front" text={card.front} lang={frontLang} speakKey={`list-${card.id}-front`} number={number} />
      <CardSide
        side="back"
        text={card.back}
        lang={backLang}
        speakKey={`list-${card.id}-back`}
        className="border-t border-line sm:border-l sm:border-t-0"
      />
      <div className="flex items-center justify-end gap-1 border-t border-line px-2 py-2 sm:border-l sm:border-t-0 sm:px-3 sm:py-3">
        {card.image ? <CardImage image={card.image} variant="cover" lazy className="mr-auto ml-2 size-12 rounded-lg sm:mx-2 sm:size-14" /> : null}
        <IconButton label={`Edytuj fiszkę: ${name}`} icon={Pencil} onClick={onEdit} />
        <IconButton label={`Usuń fiszkę: ${name}`} icon={Trash2} variant="danger-ghost" onClick={onDelete} />
      </div>
    </li>
  );
}

/** Widok zestawu: nagłówek z akcjami oraz lista fiszek z edycją i usuwaniem. */
export default function DeckPage() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { status, data, error, reload, setData } = useFetch(`/decks/${deckId}`);
  const [dialog, setDialog] = useState(null); // { type: 'add-card' | 'edit-deck' | 'delete-deck' } | { type: 'edit-card' | 'delete-card', card }

  const deck = data?.deck;
  const cards = data?.cards;
  useDocumentTitle(deck?.name ?? 'Zestaw');

  // Języki obu stron zestawu rozpoznajemy na podstawie wszystkich fiszek naraz.
  const detected = useMemo(() => detectDeckLanguages(cards ?? []), [cards]);

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Wczytywanie zestawu">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-6 h-11 w-2/3 max-w-md" />
        <Skeleton className="mt-4 h-5 w-1/2 max-w-xs" />
        <div className="mt-10 grid gap-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (status === 'error') {
    const missing = error.status === 404;
    return (
      <StatePanel
        icon={missing ? SearchX : WifiOff}
        title={missing ? 'Nie znaleziono zestawu' : 'Nie udało się wczytać zestawu'}
        actions={
          missing ? (
            <ButtonLink to="/" variant="primary">
              Wróć do zestawów
            </ButtonLink>
          ) : (
            <Button variant="primary" onClick={reload}>
              Spróbuj ponownie
            </Button>
          )
        }
      >
        {missing ? 'Zestaw nie istnieje albo został usunięty.' : error.message}
      </StatePanel>
    );
  }

  const now = new Date().toISOString();
  const hasImages = cards.some((card) => card.image);

  function handleCardSaved(saved) {
    setData((current) => {
      const exists = current.cards.some((card) => card.id === saved.id);
      const nextCards = exists ? current.cards.map((card) => (card.id === saved.id ? saved : card)) : [...current.cards, saved];
      return { deck: { ...current.deck, cardCount: nextCards.length, updatedAt: now }, cards: nextCards };
    });
  }

  async function deleteCard(card) {
    await api(`/cards/${card.id}`, { method: 'DELETE' });
    if (card.image?.kind === 'upload') forgetPrivateImage(card.image.src);
    setData((current) => {
      const nextCards = current.cards.filter((item) => item.id !== card.id);
      return { deck: { ...current.deck, cardCount: nextCards.length, updatedAt: now }, cards: nextCards };
    });
    setDialog(null);
    toast('Usunięto fiszkę.');
  }

  async function deleteDeck() {
    await api(`/decks/${deck.id}`, { method: 'DELETE' });
    cards.forEach((card) => {
      if (card.image?.kind === 'upload') forgetPrivateImage(card.image.src);
    });
    toast(`Usunięto zestaw „${deck.name}”.`);
    navigate('/', { replace: true });
  }

  return (
    <>
      <Link to="/" className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-sm font-medium text-muted transition-colors hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Zestawy
      </Link>

      <header className="mt-5">
        <div className="flex items-start justify-between gap-4">
          <h1 className="min-w-0 font-serif text-4xl font-semibold leading-[1.1] tracking-tight text-balance wrap-anywhere sm:text-5xl">{deck.name}</h1>
          <div className="-mr-2 flex shrink-0 gap-0.5 sm:mt-1.5">
            <IconButton label="Edytuj zestaw" icon={Pencil} onClick={() => setDialog({ type: 'edit-deck' })} />
            <IconButton label="Usuń zestaw" icon={Trash2} variant="danger-ghost" onClick={() => setDialog({ type: 'delete-deck' })} />
          </div>
        </div>

        {deck.description ? (
          <p className="mt-3 max-w-2xl whitespace-pre-wrap text-[17px] leading-relaxed text-muted text-pretty wrap-anywhere">{deck.description}</p>
        ) : null}

        <p className="mt-4 text-sm text-muted">
          <span className="font-medium text-ink">{cardsLabel(cards.length)}</span>
          <span className="mx-1.5" aria-hidden="true">
            ·
          </span>
          zaktualizowano {timeAgo(deck.updatedAt)}
        </p>

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Volume2 className="size-4 shrink-0" aria-hidden="true" />
            Odczyt na głos:
          </span>
          <LanguageSummary label="awers" setting={deck.frontLang} detected={detected.front} />
          <LanguageSummary label="rewers" setting={deck.backLang} detected={detected.back} />
          <button
            type="button"
            onClick={() => setDialog({ type: 'edit-deck' })}
            className="rounded font-semibold text-accent underline-offset-4 hover:underline"
          >
            Zmień język
          </button>
        </p>

        {cards.length > 0 ? (
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to={`/decks/${deck.id}/study`} variant="primary" size="lg" icon={Play}>
              Ucz się
            </ButtonLink>
            <ButtonLink to={`/decks/${deck.id}/lesson`} size="lg" icon={GraduationCap}>
              Lekcja
            </ButtonLink>
            <Button size="lg" icon={Plus} onClick={() => setDialog({ type: 'add-card' })}>
              Dodaj fiszkę
            </Button>
          </div>
        ) : null}
      </header>

      <section className="mt-10" aria-labelledby="cards-heading">
        <h2 id="cards-heading" className="sr-only">
          Fiszki w zestawie
        </h2>

        {cards.length === 0 ? (
          <StatePanel
            icon={SquareStack}
            title="Ten zestaw jest jeszcze pusty"
            className="rounded-3xl border border-dashed border-line-strong"
            actions={
              <Button variant="primary" icon={Plus} onClick={() => setDialog({ type: 'add-card' })}>
                Dodaj pierwszą fiszkę
              </Button>
            }
          >
            Każda fiszka ma awers (pytanie lub pojęcie), rewers (odpowiedź lub definicję) i opcjonalny obrazek.
          </StatePanel>
        ) : (
          <ol className="grid gap-3">
            {cards.map((card, index) => (
              <CardRow
                key={card.id}
                card={card}
                number={index + 1}
                reserveImageSpace={hasImages}
                frontLang={resolveSpeechLanguage(card.front, deck.frontLang, detected.front)}
                backLang={resolveSpeechLanguage(card.back, deck.backLang, detected.back)}
                onEdit={() => setDialog({ type: 'edit-card', card })}
                onDelete={() => setDialog({ type: 'delete-card', card })}
              />
            ))}
          </ol>
        )}
      </section>

      {dialog?.type === 'add-card' || dialog?.type === 'edit-card' ? (
        <CardFormDialog deckId={deck.id} card={dialog.card} onClose={() => setDialog(null)} onSaved={handleCardSaved} />
      ) : null}

      {dialog?.type === 'edit-deck' ? (
        <DeckFormDialog
          deck={deck}
          detected={detected}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setData((current) => ({ ...current, deck: { ...saved, cardCount: current.cards.length } }));
            setDialog(null);
            toast('Zapisano zmiany.');
          }}
        />
      ) : null}

      {dialog?.type === 'delete-card' ? (
        <ConfirmDialog title="Usunąć fiszkę?" confirmLabel="Usuń fiszkę" onConfirm={() => deleteCard(dialog.card)} onClose={() => setDialog(null)}>
          Fiszka <strong className="font-semibold text-ink wrap-anywhere">„{shorten(dialog.card.front)}”</strong> zostanie trwale usunięta
          {dialog.card.image?.kind === 'upload' ? ' razem z obrazkiem' : ''}. Tej operacji nie można cofnąć.
        </ConfirmDialog>
      ) : null}

      {dialog?.type === 'delete-deck' ? (
        <ConfirmDialog title="Usunąć zestaw?" confirmLabel="Usuń zestaw" onConfirm={deleteDeck} onClose={() => setDialog(null)}>
          Zestaw <strong className="font-semibold text-ink wrap-anywhere">„{deck.name}”</strong> zostanie trwale usunięty
          {withCardsPhrase(cards.length)}. Tej operacji nie można cofnąć.
        </ConfirmDialog>
      ) : null}
    </>
  );
}

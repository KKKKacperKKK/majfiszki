import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Languages, ListRestart, PartyPopper, RotateCcw, SearchX, Shuffle, SquareStack, WifiOff } from 'lucide-react';
import { useParams } from 'react-router';
import { FlipCard } from '../components/FlipCard.jsx';
import { popoverPanelClass, usePopover } from '../components/Menu.jsx';
import { SpeechLanguagePicker } from '../components/SpeechLanguagePicker.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { useToast } from '../components/Toast.jsx';
import { Button, ButtonLink, IconButton, IconLink, Skeleton, StatePanel } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useDocumentTitle, useFetch } from '../lib/hooks.js';
import { preloadCardImage } from '../lib/images.js';
import { detectDeckLanguages, resolveSpeechLanguage } from '../lib/lang.js';
import { cardsLabel, cx, shuffled } from '../lib/utils.js';

const SWIPE_DISTANCE = 56; // minimalna długość przesunięcia palcem (w pikselach), która zmienia fiszkę

/**
 * Po kliknięciu myszą (lub dotknięciu) przycisk zachowałby fokus i spacja uruchamiałaby go ponownie,
 * zamiast odwracać fiszkę. Dlatego po kliknięciu wskaźnikiem zdejmujemy z niego fokus.
 * Przy obsłudze z klawiatury (detail === 0) fokus zostaje tam, gdzie był.
 */
function releasePointerFocus(event) {
  if (event.detail === 0) return;
  const control = event.target instanceof Element ? event.target.closest('button, a') : null;
  if (control && control === document.activeElement) control.blur();
}

/** Pełnoekranowa rama trybu nauki: pasek z nazwą zestawu, narzędzia i pasek postępu. */
function StudyShell({ deckId, title, toolbar, progress = 0, children }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden" onClickCapture={releasePointerFocus}>
      <header className="flex h-14 shrink-0 items-center gap-1 px-2 sm:h-16 sm:px-4">
        <IconLink to={`/decks/${deckId}`} label="Wróć do zestawu" icon={ArrowLeft} />
        <p className="min-w-0 flex-1 truncate px-1 text-[15px] font-medium sm:text-base">{title}</p>
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {toolbar}
          <ThemeToggle />
        </div>
      </header>
      <div className="h-1 shrink-0 bg-subtle" aria-hidden="true">
        {/* Szerokość ustawiana przez CSSOM (React), więc nie wymaga 'unsafe-inline' w polityce CSP. */}
        <div className="h-full rounded-r-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${progress * 100}%` }} />
      </div>
      {children}
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="mx-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line-strong bg-surface px-1.5 font-sans text-[11px] font-semibold text-ink">
      {children}
    </kbd>
  );
}

/** Wybór języka odczytu bez wychodzenia z trybu nauki. */
function LanguagePopover({ deck, detected, onChange }) {
  const { open, setOpen, containerRef, triggerRef } = usePopover();

  return (
    <div ref={containerRef} className="relative">
      <IconButton
        ref={triggerRef}
        label="Język odczytu na głos"
        icon={Languages}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open ? (
        <div role="dialog" aria-label="Język odczytu na głos" className={cx(popoverPanelClass, 'right-0 w-[min(20rem,calc(100vw-1.5rem))] p-4')}>
          <p className="text-sm font-semibold">Odczyt na głos</p>
          <p className="mb-3 mt-1 text-sm text-muted">W trybie automatycznym język jest rozpoznawany na podstawie treści fiszek.</p>
          <SpeechLanguagePicker value={deck} detected={detected} onChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}

function StudySession({ deck, cards, onLanguageChange }) {
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const originalOrder = useMemo(() => cards.map((card) => card.id), [cards]);

  const [order, setOrder] = useState(originalOrder);
  const [isShuffled, setIsShuffled] = useState(false);
  const [position, setPosition] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);
  // `direction` wybiera animację wejścia karty, a zmiana `deal` wymusza ją także wtedy, gdy karta się nie zmieniła.
  const [motion, setMotion] = useState({ direction: 'next', deal: 0 });

  const cardRootRef = useRef(null);
  const restoreFocusRef = useRef(false);
  const restartButtonRef = useRef(null);
  const swipeStart = useRef(null);

  const total = order.length;
  const card = cardsById.get(order[position]);

  const detected = useMemo(() => detectDeckLanguages(cards), [cards]);

  function show(nextPosition, direction) {
    setPosition(nextPosition);
    setFlipped(false); // każda fiszka zaczyna od awersu
    setFinished(false);
    setMotion((current) => ({ ...current, direction }));
  }

  function goNext() {
    if (finished) return;
    if (position >= total - 1) {
      setFinished(true);
      return;
    }
    show(position + 1, 'next');
  }

  function goPrevious() {
    if (finished) show(position, 'prev'); // z ekranu podsumowania wracamy do ostatniej fiszki
    else if (position > 0) show(position - 1, 'prev');
  }

  function flip() {
    if (finished) return;
    // Jeśli fokus był na karcie, po obrocie przeniesiemy go na nowo widoczną stronę.
    restoreFocusRef.current = Boolean(cardRootRef.current?.contains(document.activeElement));
    setFlipped((value) => !value);
  }

  function startOver(nextOrder, nextIsShuffled) {
    setOrder(nextOrder);
    setIsShuffled(nextIsShuffled);
    setPosition(0);
    setFlipped(false);
    setFinished(false);
    setMotion((current) => ({ direction: 'next', deal: current.deal + 1 }));
  }

  function shuffle() {
    let next = shuffled(order);
    // Losowanie może trafić w dotychczasową kolejność — wtedy próbujemy jeszcze raz, żeby było widać zmianę.
    for (let attempt = 0; attempt < 10 && total > 1 && next.every((id, index) => id === order[index]); attempt += 1) {
      next = shuffled(order);
    }
    startOver(next, true);
  }

  // Obsługa klawiatury korzysta zawsze z najnowszych wersji funkcji.
  const actions = useRef({ goNext, goPrevious, flip });
  useEffect(() => {
    actions.current = { goNext, goPrevious, flip };
  });

  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (document.querySelector('dialog[open]')) return;

      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      switch (event.key) {
        case ' ':
        case 'Spacebar':
        case 'Enter':
          // Przycisk lub odnośnik z fokusem obsługuje te klawisze po swojemu.
          if (target?.closest('button, a[href]')) return;
          event.preventDefault();
          if (!event.repeat) actions.current.flip();
          break;
        case 'ArrowRight':
          event.preventDefault();
          actions.current.goNext();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          actions.current.goPrevious();
          break;
        default:
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Obrazki sąsiednich fiszek wczytujemy z wyprzedzeniem, żeby przejścia były płynne.
  useEffect(() => {
    for (const offset of [1, 2, -1]) {
      const neighbour = cardsById.get(order[position + offset]);
      if (neighbour?.image) preloadCardImage(neighbour.image);
    }
  }, [cardsById, order, position]);

  useEffect(() => {
    if (finished) restartButtonRef.current?.focus({ preventScroll: true });
  }, [finished]);

  const swipeHandlers = {
    onPointerDown(event) {
      swipeStart.current = event.pointerType === 'mouse' ? null : { id: event.pointerId, x: event.clientX, y: event.clientY };
    },
    onPointerUp(event) {
      const start = swipeStart.current;
      swipeStart.current = null;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) goNext();
      else goPrevious();
    },
    onPointerCancel() {
      swipeStart.current = null;
    },
  };

  const shownNumber = finished ? total : position + 1;
  const announcement = finished
    ? 'Koniec zestawu. Przejrzano wszystkie fiszki.'
    : `Fiszka ${shownNumber} z ${total}. ${flipped ? `Rewers: ${card.back}` : `Awers: ${card.front}`}`;

  return (
    <StudyShell
      deckId={deck.id}
      title={deck.name}
      progress={shownNumber / total}
      toolbar={
        <>
          {isShuffled ? (
            <IconButton label="Przywróć pierwotną kolejność" icon={ListRestart} onClick={() => startOver(originalOrder, false)} />
          ) : null}
          <Button
            size="sm"
            variant={isShuffled ? 'accent-soft' : 'ghost'}
            icon={Shuffle}
            onClick={shuffle}
            disabled={total < 2}
            title={isShuffled ? 'Kolejność losowa — kliknij, aby przetasować ponownie' : 'Ustaw fiszki w losowej kolejności'}
          >
            Tasuj
          </Button>
          <LanguagePopover deck={deck} detected={detected} onChange={onLanguageChange} />
        </>
      }
    >
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6">
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>

        {/* Karta rośnie do 34rem wysokości; na wyższych ekranach karta i nawigacja są razem wyśrodkowane. */}
        <div className="flex max-h-[34rem] min-h-0 w-full max-w-3xl flex-1 items-center justify-center">
          {finished ? (
            <div className="flex max-w-md flex-col items-center px-2 text-center animate-card-next">
              <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent">
                <PartyPopper className="size-7" aria-hidden="true" />
              </div>
              <h2 className="font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">To już wszystkie fiszki!</h2>
              <p className="mt-2 text-[15px] text-muted">Za Tobą {cardsLabel(total)} z tego zestawu.</p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Button ref={restartButtonRef} variant="primary" icon={RotateCcw} onClick={() => startOver(order, isShuffled)}>
                  Jeszcze raz
                </Button>
                {total > 1 ? (
                  <Button icon={Shuffle} onClick={shuffle}>
                    Tasuj i powtórz
                  </Button>
                ) : null}
                <ButtonLink to={`/decks/${deck.id}`} variant="ghost">
                  Wróć do zestawu
                </ButtonLink>
              </div>
            </div>
          ) : (
            <div
              // Nowy klucz = nowy element, więc każda fiszka wjeżdża z animacją i zawsze zaczyna od awersu.
              key={`${card.id}-${motion.deal}`}
              className={cx('size-full', motion.direction === 'prev' ? 'animate-card-prev' : 'animate-card-next')}
              {...swipeHandlers}
            >
              <FlipCard
                card={card}
                flipped={flipped}
                onFlip={flip}
                frontLang={resolveSpeechLanguage(card.front, deck.frontLang, detected.front)}
                backLang={resolveSpeechLanguage(card.back, deck.backLang, detected.back)}
                rootRef={cardRootRef}
                restoreFocusRef={restoreFocusRef}
                className="size-full"
              />
            </div>
          )}
        </div>

        <nav
          aria-label="Nawigacja między fiszkami"
          className="mt-3 grid w-full max-w-3xl grid-cols-2 items-center gap-x-3 gap-y-2 sm:mt-6 sm:grid-cols-[1fr_auto_1fr] sm:gap-x-6"
        >
          <p className="order-first col-span-2 text-center font-medium tabular-nums sm:order-none sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-lg">
            <span className="sr-only">Fiszka </span>
            {shownNumber} / {total}
          </p>
          <Button icon={ChevronLeft} onClick={goPrevious} disabled={position === 0 && !finished} className="sm:col-start-1 sm:row-start-1 sm:justify-self-start">
            Poprzednia
          </Button>
          <Button variant="primary" onClick={goNext} disabled={finished} className="sm:col-start-3 sm:row-start-1 sm:justify-self-end">
            Następna
            <ChevronRight className="size-[18px]" aria-hidden="true" />
          </Button>
        </nav>

        <p className="mt-4 hidden text-xs text-muted pointer-fine:md:block">
          <Kbd>Spacja</Kbd> odwróć fiszkę
          <span className="mx-2.5 text-faint" aria-hidden="true">
            ·
          </span>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd> poprzednia / następna
        </p>
      </main>
    </StudyShell>
  );
}

/** Tryb nauki: duża obracana fiszka, nawigacja, licznik postępu i tasowanie. */
export default function StudyPage() {
  const { deckId } = useParams();
  const toast = useToast();
  const { status, data, error, reload, setData } = useFetch(`/decks/${deckId}`);
  useDocumentTitle(data ? `Nauka: ${data.deck.name}` : 'Nauka');

  async function changeLanguage(patch) {
    const previous = { frontLang: data.deck.frontLang, backLang: data.deck.backLang };
    setData((current) => ({ ...current, deck: { ...current.deck, ...patch } })); // od razu widoczne w interfejsie
    try {
      await api(`/decks/${deckId}`, { method: 'PATCH', body: patch });
    } catch (err) {
      setData((current) => ({ ...current, deck: { ...current.deck, ...previous } }));
      toast(err.message, { type: 'error' });
    }
  }

  if (status === 'loading') {
    return (
      <StudyShell deckId={deckId} title="">
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 sm:px-6" role="status" aria-label="Wczytywanie fiszek">
          <Skeleton className="h-full max-h-[34rem] w-full max-w-3xl rounded-[28px]" />
        </div>
      </StudyShell>
    );
  }

  if (status === 'error') {
    const missing = error.status === 404;
    return (
      <StudyShell deckId={deckId} title="">
        <div className="flex flex-1 items-center justify-center">
          <StatePanel
            icon={missing ? SearchX : WifiOff}
            title={missing ? 'Nie znaleziono zestawu' : 'Nie udało się wczytać fiszek'}
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
        </div>
      </StudyShell>
    );
  }

  if (data.cards.length === 0) {
    return (
      <StudyShell deckId={deckId} title={data.deck.name}>
        <div className="flex flex-1 items-center justify-center">
          <StatePanel
            icon={SquareStack}
            title="Ten zestaw nie ma jeszcze fiszek"
            actions={
              <ButtonLink to={`/decks/${deckId}`} variant="primary">
                Dodaj fiszki
              </ButtonLink>
            }
          >
            Dodaj przynajmniej jedną fiszkę, aby rozpocząć naukę.
          </StatePanel>
        </div>
      </StudyShell>
    );
  }

  return <StudySession key={data.deck.id} deck={data.deck} cards={data.cards} onLanguageChange={changeLanguage} />;
}

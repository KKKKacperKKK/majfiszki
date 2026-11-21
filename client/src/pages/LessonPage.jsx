import { useMemo, useState } from 'react';
import { ArrowLeft, Check, CircleAlert, GraduationCap, Pencil, PartyPopper, WifiOff } from 'lucide-react';
import { useParams } from 'react-router';
import { CardFormDialog } from '../components/CardFormDialog.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { Button, ButtonLink, IconLink, Skeleton, StatePanel } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useDocumentTitle, useFetch } from '../lib/hooks.js';
import { cx } from '../lib/utils.js';

const RATING_OPTIONS = [
  { value: 'again', label: 'Nie umiem', description: 'Pustka, błąd lub strzał.', hint: '+1 dzień', style: 'border-danger/40 text-danger hover:bg-danger-soft' },
  { value: 'hard', label: 'Słabo', description: 'Szczegół błędny lub odpowiedź niepełna.', hint: '+1 dzień', style: 'border-line-strong hover:bg-subtle' },
  { value: 'medium', label: 'Średnio', description: 'Poprawnie, ale z dużym wysiłkiem.', hint: 'awans +1', style: 'border-line-strong hover:bg-subtle' },
  { value: 'easy', label: 'Umiem', description: 'Płynnie, bez wahania i błędu.', hint: 'awans +2', style: 'border-accent/40 text-accent hover:bg-accent-soft' },
];

function daysForRating(box, rating) {
  if (rating === 'again' || rating === 'hard') return 1;
  if (rating === 'medium') return Math.min(5, box + 1) === 2 ? 3 : 4;
  const nextBox = Math.min(5, box + 2);
  return nextBox === 3 ? 7 : nextBox === 4 ? 14 : 30;
}

function LessonShell({ deckId, title, remaining, total, children }) {
  const progress = total ? (total - remaining) / total : 0;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-2 sm:h-16 sm:px-4">
        <IconLink to={`/decks/${deckId}`} label="Wróć do zestawu" icon={ArrowLeft} />
        <p className="min-w-0 flex-1 truncate px-1 text-[15px] font-medium sm:text-base">{title}</p>
        <ThemeToggle />
      </header>
      {total > 0 ? (
        <div
          className="h-1 shrink-0 bg-subtle"
          role="progressbar"
          aria-label="Postęp lekcji"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.max(0, total - remaining)}
        >
          <div className="h-full rounded-r-full bg-accent transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}
      {children}
    </div>
  );
}

function LessonSession({ deckId, deck, initialCards }) {
  const [cards, setCards] = useState(() => Object.fromEntries(initialCards.map((card) => [card.id, card])));
  const [queue, setQueue] = useState(() => initialCards.map((card) => card.id));
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assessed, setAssessed] = useState(0);
  const [ratingCounts, setRatingCounts] = useState({ again: 0, hard: 0, medium: 0, easy: 0 });
  const [difficultIds, setDifficultIds] = useState([]);
  const [editingCard, setEditingCard] = useState(null);
  const [rateError, setRateError] = useState(null);
  const currentId = queue[0];
  const card = currentId ? cards[currentId] : null;
  const initialTotal = initialCards.length;
  const progressEntries = useMemo(() => Object.values(cards).filter((item) => item.nextReviewAt), [cards]);
  const nextReviewAt = progressEntries
    .map((item) => item.nextReviewAt)
    .sort()[0];

  async function rate(rating) {
    if (!card || saving) return;
    setSaving(true);
    setRateError(null);
    try {
      const progress = await api(`/decks/${deckId}/lesson/${card.id}/rate`, { method: 'POST', body: { rating } });
      setCards((current) => ({ ...current, [card.id]: { ...current[card.id], ...progress } }));
      setAssessed((value) => value + 1);
      setRatingCounts((current) => ({ ...current, [rating]: current[rating] + 1 }));
      if (progress.consecutiveFails >= 3) {
        setDifficultIds((current) => (current.includes(card.id) ? current : [...current, card.id]));
      }
      setRevealed(false);
      setQueue((current) => {
        const remaining = current.slice(1);
        if (rating === 'again') remaining.push(card.id);
        return remaining;
      });
    } catch (error) {
      setRateError(error.message);
    } finally {
      setSaving(false);
    }
  }

  const difficultCards = difficultIds.map((id) => cards[id]).filter(Boolean);

  if (!card) {
    return (
      <>
        <LessonShell deckId={deckId} title={`Lekcja · ${deck.name}`} remaining={0} total={initialTotal}>
          <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 py-8 sm:px-6">
            <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent">
              <PartyPopper className="size-7" aria-hidden="true" />
            </div>
            <h1 className="text-center font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Lekcja ukończona!</h1>
            <p className="mt-2 text-center text-muted">Powtórzono {Object.keys(cards).length} fiszek w {assessed} podejściach.</p>

            <section className="mt-7 w-full rounded-2xl border border-line bg-surface p-5" aria-labelledby="lesson-summary">
              <h2 id="lesson-summary" className="font-semibold">Rozkład ocen</h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {RATING_OPTIONS.map((option) => (
                  <div key={option.value} className="rounded-xl bg-subtle p-3">
                    <dt className="text-muted">{option.label}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">{ratingCounts[option.value]}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm text-muted">
                Najbliższa powtórka:{' '}
                <strong className="font-semibold text-ink">
                  {nextReviewAt ? new Date(nextReviewAt).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }) : 'brak zaplanowanych'}
                </strong>
              </p>
            </section>

            {difficultCards.length ? (
              <section className="mt-5 w-full rounded-2xl border border-danger/30 bg-danger-soft p-5" aria-labelledby="difficult-heading">
                <h2 id="difficult-heading" className="flex items-center gap-2 font-semibold text-danger">
                  <CircleAlert className="size-5" aria-hidden="true" />
                  Fiszki wymagające dopracowania
                </h2>
                <ul className="mt-3 grid gap-2">
                  {difficultCards.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-3">
                      <span className="min-w-0 flex-1 whitespace-pre-wrap text-sm wrap-anywhere">{item.front}</span>
                      <Button size="sm" icon={Pencil} onClick={() => setEditingCard(item)}>Edytuj</Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <ButtonLink to={`/decks/${deckId}`} variant="primary">Wróć do zestawu</ButtonLink>
            </div>
          </main>
        </LessonShell>
        {editingCard ? (
          <CardFormDialog
            deckId={deckId}
            card={editingCard}
            onClose={() => setEditingCard(null)}
            onSaved={(saved) => setCards((current) => ({ ...current, [saved.id]: { ...current[saved.id], ...saved } }))}
          />
        ) : null}
      </>
    );
  }

  const isDifficult = card.consecutiveFails >= 3;
  return (
    <>
      <LessonShell deckId={deckId} title={`Lekcja · ${deck.name}`} remaining={queue.length} total={initialTotal}>
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
          <div className="mb-4 flex items-center justify-between gap-3 text-sm text-muted">
            <span>Pozostało w kolejce: <strong className="text-ink tabular-nums">{queue.length}</strong></span>
            <span>Przegródka <strong className="text-ink">{card.box} / 5</strong>{card.box === 5 ? ' · Opanowane' : ''}</span>
          </div>
          <section className="rounded-[28px] border border-line bg-surface p-6 shadow-card sm:p-9" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{revealed ? 'Odpowiedź' : 'Pytanie'}</p>
            <h1 className="mt-5 whitespace-pre-wrap font-serif text-2xl font-medium leading-relaxed wrap-anywhere sm:text-3xl">
              {revealed ? card.back : card.front}
            </h1>
            {revealed ? (
              <div className="mt-7 rounded-2xl bg-subtle p-4">
                <p className="font-semibold">Samoocena</p>
                <ul className="mt-2 grid gap-1.5 text-sm text-muted">
                  <li>Czy wiedziałem bez podpowiedzi?</li>
                  <li>Czy odpowiedź była w 100% kompletna i poprawna?</li>
                  <li>Czy przypomnienie zajęło dużo czasu / wysiłku?</li>
                  <li>Czy rozumiem dlaczego tak jest (nie zgadłem)?</li>
                </ul>
              </div>
            ) : null}
          </section>

          {isDifficult ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger" role="status">
              <span>Ta fiszka sprawia trudność {card.consecutiveFails}. raz z rzędu — rozważ rozbicie jej na dwie mniejsze lub dodanie podpowiedzi.</span>
              <Button size="sm" icon={Pencil} onClick={() => setEditingCard(card)}>Edytuj fiszkę</Button>
            </div>
          ) : null}

          {!revealed ? (
            <Button className="mt-5 self-center" variant="primary" size="lg" icon={Check} onClick={() => setRevealed(true)}>
              Pokaż odpowiedź
            </Button>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={saving}
                  onClick={() => rate(option.value)}
                  title={option.description}
                  className={cx('flex min-h-20 flex-col items-center justify-center rounded-xl border bg-surface px-2 py-2 text-sm font-semibold transition-colors disabled:opacity-50', option.style)}
                >
                  <span>{option.label}</span>
                  <span className="mt-1 text-center text-[11px] font-normal leading-tight opacity-75">{option.description}</span>
                  <span className="mt-0.5 text-xs font-normal opacity-75">
                    {option.value === 'medium'
                      ? `${card.box === 5 ? 'bez zmiany' : `+${Math.min(5, card.box + 1) - card.box} przegr.`} · ${daysForRating(card.box, option.value)} dni`
                      : option.value === 'easy'
                        ? `${card.box >= 5 ? 'bez zmiany' : `+${Math.min(5, card.box + 2) - card.box} przegr.`} · ${daysForRating(card.box, option.value)} dni`
                        : option.hint}
                  </span>
                </button>
              ))}
            </div>
          )}
          {rateError ? <p className="mt-3 text-center text-sm text-danger" role="alert">{rateError}</p> : null}
        </main>
      </LessonShell>
      {editingCard ? (
        <CardFormDialog
          deckId={deckId}
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSaved={(saved) => setCards((current) => ({ ...current, [saved.id]: { ...current[saved.id], ...saved } }))}
        />
      ) : null}
    </>
  );
}

export default function LessonPage() {
  const { deckId } = useParams();
  const { status, data, error, reload } = useFetch(`/decks/${deckId}`);
  const [batchSize, setBatchSize] = useState(15);
  const [lesson, setLesson] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  useDocumentTitle(data ? `Lekcja: ${data.deck.name}` : 'Lekcja');

  async function startLesson() {
    setStarting(true);
    setStartError(null);
    try {
      const result = await api(`/decks/${deckId}/lesson?limit=${batchSize}`);
      setLesson(result);
    } catch (err) {
      setStartError(err.message);
    } finally {
      setStarting(false);
    }
  }

  if (status === 'loading') {
    return <div className="p-6" role="status" aria-label="Wczytywanie zestawu"><Skeleton className="mx-auto h-64 max-w-2xl rounded-3xl" /></div>;
  }
  if (status === 'error') {
    const missing = error.status === 404;
    return <StatePanel icon={WifiOff} title={missing ? 'Nie znaleziono zestawu' : 'Nie udało się wczytać zestawu'} actions={<Button variant="primary" onClick={reload}>Spróbuj ponownie</Button>}>{error.message}</StatePanel>;
  }

  if (lesson) {
    if (!lesson.cards.length) {
      return (
        <LessonShell deckId={deckId} title={`Lekcja · ${lesson.deck.name}`} remaining={0} total={0}>
          <main className="flex flex-1 items-center justify-center px-4">
            <StatePanel title="Brak fiszek do powtórki" actions={<ButtonLink to={`/decks/${deckId}`} variant="primary">Wróć do zestawu</ButtonLink>}>
              Wszystkie fiszki z tej talii mają już zaplanowaną późniejszą powtórkę. Wróć, gdy nadejdzie jej termin.
            </StatePanel>
          </main>
        </LessonShell>
      );
    }
    return <LessonSession key={`${deckId}-${lesson.cards.map((card) => card.id).join('-')}`} deckId={deckId} deck={lesson.deck} initialCards={lesson.cards} />;
  }

  return (
    <LessonShell deckId={deckId} title={`Lekcja · ${data.deck.name}`} remaining={0} total={0}>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-10 text-center sm:px-6">
        <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent">
          <GraduationCap className="size-7" aria-hidden="true" />
        </div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Lekcja: {data.deck.name}</h1>
        <p className="mt-3 max-w-lg text-muted">Powtórki przypadające na dziś i nowe fiszki z tej talii. Oceny zapisują postęp w czterech etapach Leitnera.</p>
        <label htmlFor="lesson-size" className="mt-7 text-sm font-medium">Liczba fiszek w partii</label>
        <select
          id="lesson-size"
          value={batchSize}
          onChange={(event) => setBatchSize(Number(event.target.value))}
          className="mt-2 h-11 rounded-xl border border-line-strong bg-surface px-4 text-base"
        >
          {[5, 10, 15, 20, 30, 50].map((size) => <option key={size} value={size}>{size} fiszek</option>)}
        </select>
        {startError ? <p className="mt-4 text-sm text-danger" role="alert">{startError}</p> : null}
        <Button className="mt-6" variant="primary" size="lg" icon={GraduationCap} loading={starting} disabled={!data.cards.length} onClick={startLesson}>Rozpocznij lekcję</Button>
        <ButtonLink className="mt-3" to={`/decks/${deckId}`} variant="ghost">Wróć do zestawu</ButtonLink>
      </main>
    </LessonShell>
  );
}

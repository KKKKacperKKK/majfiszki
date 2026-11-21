import { useEffect, useRef } from 'react';
import { RotateCw } from 'lucide-react';
import { cx } from '../lib/utils.js';
import { CardImage } from './CardImage.jsx';
import { SpeakButton } from './SpeakButton.jsx';

/**
 * Im krótszy tekst, tym większa czcionka — pojedyncze słowo wypełnia kartę, a definicja pozostaje czytelna.
 * Same rozmiary (klasy .card-text-*) są zdefiniowane w index.css względem wymiarów karty.
 */
function textClass(text, hasImage) {
  const length = [...text].length;
  const lines = text.split('\n').length;
  const longestWord = Math.max(...text.split(/\s+/).map((word) => [...word].length));

  const steps = ['card-text-xl', 'card-text-lg', 'card-text-md', 'card-text-sm', 'card-text-xs', 'card-text-2xs'];
  let step;
  if (hasImage) {
    // Obrazek zabiera około połowy karty, więc tekst zaczyna od mniejszego rozmiaru.
    if (length <= 30) step = 2;
    else if (length <= 90) step = 3;
    else if (length <= 220) step = 4;
    else step = 5;
  } else if (length <= 16 && lines === 1) step = 0;
  else if (length <= 44) step = 1;
  else if (length <= 110) step = 2;
  else if (length <= 240) step = 3;
  else if (length <= 520) step = 4;
  else step = 5;

  // Bardzo długie słowo w dużym rozmiarze łamałoby się w środku — zmniejszamy je o stopień.
  if (longestWord >= 14 && step < 2) step += 1;

  // Krótki tekst: wyśrodkowany, mocniejszy krój. Długi: wyrównany do lewej, zwykła grubość — wygodniejszy w czytaniu.
  const isLong = length > 240 || lines > 3;
  return cx(steps[step], isLong ? 'text-left font-normal hyphens-auto' : 'text-center font-medium tracking-tight text-balance');
}

function Face({ side, card, text, lang, showImage, hidden, flipButtonRef }) {
  const isBack = side === 'back';

  return (
    <section
      aria-label={isBack ? 'Rewers fiszki' : 'Awers fiszki'}
      // Niewidoczna strona jest wyłączona z nawigacji klawiaturą i czytników ekranu.
      inert={hidden}
      className={cx(
        'flip-face flex flex-col overflow-hidden rounded-[28px] border shadow-card',
        isBack ? 'flip-face--back border-card-back-line bg-card-back' : 'border-line bg-card-front',
      )}
    >
      <header className="flex shrink-0 items-center justify-between pl-6 pr-3 pt-3 sm:pl-8 sm:pr-4 sm:pt-4">
        <span className={cx('text-xs font-semibold uppercase tracking-[0.14em]', isBack ? 'text-accent' : 'text-muted')}>
          {isBack ? 'Rewers' : 'Awers'}
        </span>
        <SpeakButton text={text} lang={lang} speakKey={`study-${card.id}-${side}`} side={side} size="lg" />
      </header>

      {/* .flip-body układa obrazek nad tekstem, a na niskiej, szerokiej karcie — obok tekstu (index.css). */}
      <div className="flip-body px-6 sm:px-10">
        {showImage ? <CardImage image={card.image} className="flip-image" /> : null}
        <div className="flip-text">
          <div className="flex min-h-full items-center justify-center py-3">
            <p
              lang={lang}
              dir="auto"
              className={cx('w-full whitespace-pre-wrap font-serif wrap-anywhere', textClass(text, showImage))}
            >
              {text}
            </p>
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 justify-center pb-3 sm:pb-4">
        {/* Prawdziwy przycisk dla klawiatury i czytników ekranu; myszą można kliknąć całą kartę. */}
        <button
          ref={flipButtonRef}
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          <RotateCw className="size-3.5" aria-hidden="true" />
          Odwróć
        </button>
      </footer>
    </section>
  );
}

/**
 * Duża, obracana w 3D fiszka. Kliknięcie w dowolne miejsce karty wywołuje `onFlip`.
 * Animację obrotu realizuje czysty CSS — klasy .flip-scene / .flip-inner / .flip-face w index.css.
 *
 * @param {object} props
 * @param {object} props.card
 * @param {boolean} props.flipped            `true`, gdy widoczny jest rewers
 * @param {() => void} props.onFlip
 * @param {string} props.frontLang           język odczytu awersu (BCP-47)
 * @param {string} props.backLang            język odczytu rewersu (BCP-47)
 * @param {import('react').RefObject<HTMLElement>} [props.rootRef]
 * @param {import('react').RefObject<boolean>} [props.restoreFocusRef] ustawione na `true` przed obrotem
 *        oznacza, że fokus był na karcie i ma trafić na przycisk „Odwróć” nowo widocznej strony
 */
export function FlipCard({ card, flipped, onFlip, frontLang, backLang, rootRef, restoreFocusRef, className }) {
  const frontButtonRef = useRef(null);
  const backButtonRef = useRef(null);

  useEffect(() => {
    if (!restoreFocusRef?.current) return;
    restoreFocusRef.current = false;
    (flipped ? backButtonRef : frontButtonRef).current?.focus({ preventScroll: true });
  }, [flipped, restoreFocusRef]);

  function handleClick() {
    if (window.getSelection()?.toString()) return; // użytkownik zaznacza tekst, a nie klika
    onFlip();
  }

  const hasImage = Boolean(card.image);

  return (
    <div ref={rootRef} className={cx('flip-scene', className)}>
      <div onClick={handleClick} className={cx('flip-inner cursor-pointer', flipped && 'is-flipped')}>
        <Face
          side="front"
          card={card}
          text={card.front}
          lang={frontLang}
          showImage={hasImage && card.imageSide !== 'back'}
          hidden={flipped}
          flipButtonRef={frontButtonRef}
        />
        <Face
          side="back"
          card={card}
          text={card.back}
          lang={backLang}
          showImage={hasImage && card.imageSide !== 'front'}
          hidden={!flipped}
          flipButtonRef={backButtonRef}
        />
      </div>
    </div>
  );
}

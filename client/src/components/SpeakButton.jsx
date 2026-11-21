import { useEffect, useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { languageName } from '../lib/lang.js';
import { getSpeakingKey, isVoiceMissing, speak, speechSupported, stopSpeaking, subscribeSpeaking } from '../lib/speech.js';
import { cx } from '../lib/utils.js';
import { useToast } from './Toast.jsx';

const SIZES = { md: 'size-10', lg: 'size-11' };
const SIDE_NAMES = { front: 'awers', back: 'rewers' };

// O braku głosu dla danego języka informujemy tylko raz na sesję.
const warnedLanguages = new Set();

function Equalizer() {
  const bar = 'h-full w-[3px] origin-center rounded-full bg-current animate-eq';
  return (
    <span className="flex h-4 items-center gap-[3px]" aria-hidden="true">
      <span className={bar} />
      <span className={cx(bar, '[animation-delay:-0.3s]')} />
      <span className={cx(bar, '[animation-delay:-0.6s]')} />
    </span>
  );
}

/**
 * Ikona głośnika: czyta tekst na głos przez Web Speech API przeglądarki.
 * Ponowne kliknięcie w trakcie czytania zatrzymuje je.
 *
 * @param {object} props
 * @param {string} props.text      tekst do przeczytania
 * @param {string} props.lang      język w formacie BCP-47, np. 'pl-PL'
 * @param {string} props.speakKey  unikalny identyfikator tego przycisku
 * @param {'front' | 'back'} props.side
 */
export function SpeakButton({ text, lang, speakKey, side, size = 'md', className }) {
  const speaking = useSyncExternalStore(subscribeSpeaking, () => getSpeakingKey() === speakKey);
  const toast = useToast();

  // Zniknięcie przycisku (np. przejście do następnej fiszki) przerywa jego czytanie.
  useEffect(
    () => () => {
      if (getSpeakingKey() === speakKey) stopSpeaking();
    },
    [speakKey],
  );

  const baseClass = cx(
    'inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-150',
    SIZES[size],
    className,
  );

  if (!speechSupported) {
    const label = 'Ta przeglądarka nie obsługuje odczytu na głos';
    return (
      <button type="button" disabled aria-label={label} title={label} className={cx(baseClass, 'text-faint')}>
        <VolumeX className="size-5" aria-hidden="true" />
      </button>
    );
  }

  function handleClick(event) {
    event.stopPropagation(); // kliknięcie głośnika nie odwraca fiszki
    if (speaking) {
      stopSpeaking();
      return;
    }
    if (isVoiceMissing(lang) && !warnedLanguages.has(lang)) {
      warnedLanguages.add(lang);
      toast(`W tej przeglądarce nie ma głosu dla języka: ${languageName(lang)}. Odczyt może nie zadziałać.`, { type: 'error' });
    }
    speak({ key: speakKey, text, lang });
  }

  const label = speaking ? 'Zatrzymaj odczyt' : `Odczytaj ${SIDE_NAMES[side]} na głos`;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      aria-pressed={speaking}
      title={speaking ? label : `${label} — ${languageName(lang)}`}
      className={cx(baseClass, speaking ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle hover:text-ink')}
    >
      {speaking ? <Equalizer /> : <Volume2 className="size-5" aria-hidden="true" />}
    </button>
  );
}

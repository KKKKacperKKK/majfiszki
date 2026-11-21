import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { useVoices } from '../lib/hooks.js';
import { AUTO, LANGUAGES, languageName } from '../lib/lang.js';
import { isVoiceMissing, speechSupported } from '../lib/speech.js';
import { cx } from '../lib/utils.js';
import { inputClass } from './ui.jsx';

function LanguageSelect({ label, value, detected, onChange, disabled }) {
  const id = useId();
  const isListed = value === AUTO || LANGUAGES.some((language) => language.code === value);

  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={cx(inputClass, 'appearance-none truncate pr-9')}
        >
          <option value={AUTO}>{detected ? `Automatycznie — ${languageName(detected)}` : 'Automatycznie'}</option>
          {isListed ? null : <option value={value}>{languageName(value)}</option>}
          {LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      </div>
    </div>
  );
}

/**
 * Wybór języka odczytu na głos osobno dla awersu i rewersu.
 * „Automatycznie” oznacza rozpoznawanie języka na podstawie treści fiszek.
 *
 * @param {object} props
 * @param {{ frontLang: string, backLang: string }} props.value
 * @param {{ front: string | null, back: string | null }} [props.detected] języki rozpoznane w zestawie
 * @param {(patch: { frontLang?: string, backLang?: string }) => void} props.onChange
 */
export function SpeechLanguagePicker({ value, detected, onChange, disabled = false, className }) {
  useVoices(); // odświeża ostrzeżenie, gdy przeglądarka skończy wczytywać listę głosów

  const effective = [
    value.frontLang === AUTO ? detected?.front : value.frontLang,
    value.backLang === AUTO ? detected?.back : value.backLang,
  ];
  const missing = [...new Set(effective.filter((lang) => lang && isVoiceMissing(lang)))];

  return (
    <div className={className}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <LanguageSelect
          label="Język awersu"
          value={value.frontLang}
          detected={detected?.front}
          disabled={disabled}
          onChange={(lang) => onChange({ frontLang: lang })}
        />
        <LanguageSelect
          label="Język rewersu"
          value={value.backLang}
          detected={detected?.back}
          disabled={disabled}
          onChange={(lang) => onChange({ backLang: lang })}
        />
      </div>
      {!speechSupported ? (
        <p className="mt-2 text-sm text-danger">Ta przeglądarka nie obsługuje odczytu na głos (Web Speech API).</p>
      ) : missing.length > 0 ? (
        <p className="mt-2 text-sm text-danger">
          W tej przeglądarce nie ma zainstalowanego głosu dla języka: {missing.map(languageName).join(', ')}. Odczyt może nie działać.
        </p>
      ) : null}
    </div>
  );
}

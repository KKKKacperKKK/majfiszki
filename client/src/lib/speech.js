// Odczyt na głos przez Web Speech API (speechSynthesis) wbudowane w przeglądarkę.
// Moduł pilnuje, żeby w danej chwili mówił najwyżej jeden przycisk głośnika,
// i udostępnia prosty „magazyn” stanu, który komponenty Reacta mogą subskrybować.

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

export const speechSupported = Boolean(synth) && typeof window.SpeechSynthesisUtterance === 'function';

// ── Głosy ──────────────────────────────────────────────────────────────────
// Lista głosów ładuje się asynchronicznie (zdarzenie voiceschanged), a jej zawartość
// zależy od systemu i przeglądarki.
let voices = [];
const voiceListeners = new Set();

function refreshVoices() {
  try {
    voices = synth.getVoices() ?? [];
  } catch {
    voices = [];
  }
  voiceListeners.forEach((listener) => listener());
}

if (speechSupported) {
  refreshVoices();
  if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refreshVoices);
  else synth.onvoiceschanged = refreshVoices;
}

export function subscribeVoices(listener) {
  voiceListeners.add(listener);
  return () => voiceListeners.delete(listener);
}

export const getVoices = () => voices;

const normalizeTag = (tag) => String(tag || '').replace('_', '-').toLowerCase();

/** Najlepszy dostępny głos dla języka (np. 'en-US') albo `null`. */
export function pickVoice(lang) {
  const wanted = normalizeTag(lang);
  const base = wanted.split('-')[0];

  let best = null;
  let bestScore = 0;
  for (const voice of voices) {
    const tag = normalizeTag(voice.lang);
    if (tag.split('-')[0] !== base) continue;

    let score = 1;
    if (tag === wanted) score += 4; // ten sam wariant regionalny
    if (/natural|neural|premium|enhanced|google/i.test(voice.name)) score += 2; // zwykle lepsza jakość
    if (voice.default) score += 1;
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

/** `true`, gdy lista głosów jest już znana i nie ma w niej głosu dla danego języka. */
export function isVoiceMissing(lang) {
  return voices.length > 0 && !pickVoice(lang);
}

// ── Stan odtwarzania ───────────────────────────────────────────────────────
let speakingKey = null; // identyfikator przycisku, który aktualnie mówi
let session = 0; // każde wywołanie speak()/stop() dostaje nowy numer; stare zdarzenia są ignorowane
let activeUtterances = []; // referencje chronią wypowiedzi przed odśmieceniem (błąd Chrome'a)
let watchdog = null;
const speakingListeners = new Set();

function setSpeakingKey(key) {
  if (speakingKey === key) return;
  speakingKey = key;
  speakingListeners.forEach((listener) => listener());
}

export function subscribeSpeaking(listener) {
  speakingListeners.add(listener);
  return () => speakingListeners.delete(listener);
}

export const getSpeakingKey = () => speakingKey;

function cleanup() {
  activeUtterances = [];
  if (watchdog) {
    clearInterval(watchdog);
    watchdog = null;
  }
}

export function stopSpeaking() {
  if (!speechSupported) return;
  session += 1;
  cleanup();
  try {
    synth.cancel();
  } catch {
    /* nic nie mówiło */
  }
  setSpeakingKey(null);
}

/**
 * Dzieli dłuższy tekst na zdania. Część przeglądarek urywa pojedynczą wypowiedź
 * po kilkunastu sekundach, więc długie definicje czytamy kawałkami.
 */
function splitIntoChunks(text, maxLength = 180) {
  const sentences = text.match(/[^.!?…。！？\n]+[.!?…。！？]*\s*/g) ?? [text];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (current && (current + sentence).length > maxLength) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence;
    while (current.length > maxLength) {
      const cut = current.lastIndexOf(' ', maxLength);
      const end = cut > maxLength * 0.5 ? cut : maxLength;
      chunks.push(current.slice(0, end).trim());
      current = current.slice(end);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/**
 * Czyta tekst na głos.
 * @param {{ key: string, text: string, lang: string }} options
 *   key — identyfikator wywołującego przycisku, lang — kod BCP-47 (np. 'pl-PL')
 * @returns {boolean} `false`, gdy przeglądarka nie obsługuje syntezy mowy albo tekst jest pusty
 */
export function speak({ key, text, lang }) {
  if (!speechSupported) return false;

  const cleaned = String(text ?? '').replace(/[ \t]+/g, ' ').trim();
  if (!cleaned) return false;

  if (speakingKey !== null || synth.speaking || synth.pending) stopSpeaking();
  session += 1;
  const mySession = session;
  const voice = pickVoice(lang);

  const finish = () => {
    if (session !== mySession) return; // w międzyczasie zaczęło się inne czytanie
    cleanup();
    setSpeakingKey(null);
  };

  const chunks = splitIntoChunks(cleaned);
  activeUtterances = chunks.map((chunk, index) => {
    const utterance = new window.SpeechSynthesisUtterance(chunk);
    utterance.lang = voice?.lang ? voice.lang.replace('_', '-') : lang;
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    if (index === chunks.length - 1) utterance.onend = finish;
    utterance.onerror = (event) => {
      // „interrupted”/„canceled” to skutek naszego własnego cancel() — nie są błędem.
      if (event.error !== 'interrupted' && event.error !== 'canceled') finish();
    };
    return utterance;
  });

  setSpeakingKey(key);
  try {
    if (synth.paused) synth.resume();
    activeUtterances.forEach((utterance) => synth.speak(utterance));
  } catch {
    finish();
    return false;
  }

  // Zabezpieczenie: niektóre przeglądarki mobilne nie wysyłają zdarzenia „end”.
  let idleChecks = 0;
  watchdog = setInterval(() => {
    if (session !== mySession) return;
    idleChecks = synth.speaking || synth.pending ? 0 : idleChecks + 1;
    if (idleChecks >= 3) finish();
  }, 400);

  return true;
}

// Przy zamknięciu lub przeładowaniu karty przeglądarka potrafi „dokończyć” czytanie — przerywamy je.
if (speechSupported) {
  window.addEventListener('pagehide', () => {
    try {
      synth.cancel();
    } catch {
      /* ignorujemy */
    }
  });
}

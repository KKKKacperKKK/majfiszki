// Języki odsłuchu (Text-to-Speech) oraz automatyczne rozpoznawanie języka tekstu fiszki.
//
// Rozpoznawanie działa w całości w przeglądarce i jest heurystyką — pojedyncze słowo
// („radio”, „to”) bywa niejednoznaczne. Dlatego:
//   1. jeśli sam tekst daje wyraźny sygnał (np. polskie znaki, „the”, „und”), wygrywa on,
//   2. w przeciwnym razie używany jest język rozpoznany dla całej strony zestawu
//      (wszystkie awersy albo wszystkie rewersy razem, z uwzględnieniem drugiej strony),
//   3. a użytkownik zawsze może wybrać język ręcznie w ustawieniach zestawu.

export const AUTO = 'auto';

/** Języki do wyboru w ustawieniach zestawu (kody BCP-47). */
export const LANGUAGES = [
  { code: 'pl-PL', name: 'polski' },
  { code: 'en-US', name: 'angielski (USA)' },
  { code: 'en-GB', name: 'angielski (Wielka Brytania)' },
  { code: 'de-DE', name: 'niemiecki' },
  { code: 'es-ES', name: 'hiszpański' },
  { code: 'fr-FR', name: 'francuski' },
  { code: 'it-IT', name: 'włoski' },
  { code: 'pt-PT', name: 'portugalski' },
  { code: 'nl-NL', name: 'niderlandzki' },
  { code: 'sv-SE', name: 'szwedzki' },
  { code: 'nb-NO', name: 'norweski' },
  { code: 'cs-CZ', name: 'czeski' },
  { code: 'uk-UA', name: 'ukraiński' },
  { code: 'ru-RU', name: 'rosyjski' },
  { code: 'el-GR', name: 'grecki' },
  { code: 'ja-JP', name: 'japoński' },
  { code: 'zh-CN', name: 'chiński' },
  { code: 'ko-KR', name: 'koreański' },
];

const NAMES_BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language.name]));
const NAMES_BY_BASE = {
  pl: 'polski',
  en: 'angielski',
  de: 'niemiecki',
  es: 'hiszpański',
  fr: 'francuski',
  it: 'włoski',
  pt: 'portugalski',
  nl: 'niderlandzki',
  sv: 'szwedzki',
  nb: 'norweski',
  cs: 'czeski',
  uk: 'ukraiński',
  ru: 'rosyjski',
  el: 'grecki',
  he: 'hebrajski',
  ar: 'arabski',
  ja: 'japoński',
  zh: 'chiński',
  ko: 'koreański',
};

/** Polska nazwa języka dla kodu BCP-47, np. 'en-US' → 'angielski (USA)'. */
export function languageName(code) {
  if (!code || code === AUTO) return 'automatycznie';
  return NAMES_BY_CODE.get(code) ?? NAMES_BY_BASE[code.split('-')[0].toLowerCase()] ?? code;
}

// Rozpoznany język (kod dwuliterowy) → konkretny wariant używany do odsłuchu.
const DEFAULT_LOCALE = {
  pl: 'pl-PL',
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR',
  it: 'it-IT',
  uk: 'uk-UA',
  ru: 'ru-RU',
  el: 'el-GR',
  he: 'he-IL',
  ar: 'ar-SA',
  ja: 'ja-JP',
  zh: 'zh-CN',
  ko: 'ko-KR',
};

// ── Alfabety inne niż łaciński: wystarczy sprawdzić zakresy znaków ─────────
const SCRIPTS = [
  { pattern: /[\uac00-\ud7af\u1100-\u11ff]/g, lang: () => 'ko' },
  // Kanji występuje i w japońskim, i w chińskim — o japońskim przesądza obecność kany.
  { pattern: /[\u3040-\u30ff\u4e00-\u9fff]/g, lang: (text) => (/[\u3040-\u30ff]/.test(text) ? 'ja' : 'zh') },
  // Cyrylica: litery і ї є ґ wskazują na ukraiński, o ile nie ma typowo rosyjskich ы э ъ ё.
  { pattern: /[\u0400-\u04ff]/g, lang: (text) => (/[іїєґ]/.test(text) && !/[ыэъё]/.test(text) ? 'uk' : 'ru') },
  { pattern: /[\u0370-\u03ff]/g, lang: () => 'el' },
  { pattern: /[\u0590-\u05ff]/g, lang: () => 'he' },
  { pattern: /[\u0600-\u06ff]/g, lang: () => 'ar' },
];

// ── Języki zapisywane alfabetem łacińskim ──────────────────────────────────
// Każdy profil to cztery rodzaje wskazówek:
//   letters  — typowa częstość liter a–z w procentach (po usunięciu znaków diakrytycznych),
//   marks    — znaki charakterystyczne dla języka: [wzorzec, waga],
//   words    — najczęstsze krótkie słowa,
//   patterns — typowe zbitki liter i końcówki: [wzorzec, waga] (sprawdzane na pojedynczych słowach).
const words = (list) => new Set(list.split(' '));

const PROFILES = {
  pl: {
    //        a    b    c    d    e    f    g    h    i    j    k    l    m    n    o    p    q     r    s    t    u    v     w    x     y    z
    letters: [9.9, 1.5, 4.4, 3.3, 8.8, 0.3, 1.4, 1.1, 8.2, 2.3, 3.5, 3.9, 2.8, 5.7, 8.6, 3.1, 0.05, 4.7, 5.0, 4.0, 2.5, 0.05, 4.7, 0.05, 3.8, 6.5],
    marks: [
      [/[ąćęłńśźż]/g, 5],
      [/ó/g, 1.5],
    ],
    words: words(
      'i w z na do się nie to jest że o a jak po co ale od za dla czy tak lub oraz przez być mieć który która które ten ta tego jego jej ich są był była było bardzo tylko może też już przy pod nad ze we gdy kiedy gdzie bo więc mam masz ma pan pani proszę dziękuję dzień dobry jutro dziś ja ty on ona my wy oni',
    ),
    patterns: [
      [/szcz|prz|trz|drz|krz|rz(?=[aeiouy])|sz|cz|dz|kw|wsz|cj|ych$|ski$|cki$|ska$|ow[yae]$/g, 1.5],
      [/[nc]ie$/g, 0.8],
    ],
  },
  en: {
    letters: [8.2, 1.5, 2.8, 4.3, 12.7, 2.2, 2.0, 6.1, 7.0, 0.15, 0.8, 4.0, 2.4, 6.7, 7.5, 1.9, 0.1, 6.0, 6.3, 9.1, 2.8, 1.0, 2.4, 0.15, 2.0, 0.07],
    marks: [[/['’](?:s|t|re|ll|ve|m|d)(?![\p{L}])/gu, 3]],
    words: words(
      'the a an of to in is are was were and or for on with that this it as at by be from not have has had you your he she we they his her its which what who when where how do does did can will would should there their than then but if about into i my me some any one very good morning thank thanks please see tomorrow today yes no',
    ),
    patterns: [
      [/th|wh|ght|ough|ness$|ful$|less$|ly$|ed$|ity$|ould$|^wr|sh/g, 1.5],
      [/ing$|ee|oo|ck|ow$|ay$|ea|tion$/g, 0.7],
    ],
  },
  de: {
    letters: [7.0, 1.9, 3.0, 5.1, 16.6, 1.7, 3.0, 4.8, 7.6, 0.3, 1.3, 3.4, 2.5, 9.8, 2.8, 0.8, 0.05, 7.0, 7.8, 6.2, 5.0, 0.8, 1.9, 0.05, 0.05, 1.1],
    marks: [
      [/ß/g, 5],
      [/[äöü]/g, 3],
    ],
    words: words(
      'der die das und ist ein eine einen nicht zu mit von den dem des auf für sich auch es ich du er sie wir ihr im an als bei nach wie aus oder aber wenn dass sind war haben hat sein werden wird zum zur über um noch nur kein keine guten morgen danke bitte heute ja nein sehr gut',
    ),
    patterns: [
      [/heit$|keit$|lich$|isch$|cht|pf/g, 1.5],
      [/sch|ung$/g, 1.2],
      [/tz|chen$/g, 1.0],
      [/ei|en$/g, 0.5],
    ],
  },
  es: {
    letters: [12.3, 1.8, 4.4, 5.4, 13.2, 0.7, 1.4, 0.7, 6.9, 0.45, 0.05, 5.0, 3.2, 7.0, 9.3, 2.5, 0.9, 6.9, 8.0, 4.6, 3.5, 1.0, 0.05, 0.2, 1.0, 0.5],
    marks: [
      [/[ñ¿¡]/g, 5],
      [/[áíú]/g, 3],
      [/ó/g, 1.5],
      [/é/g, 1],
    ],
    words: words(
      'el la los las de del y en que es un una por con para no se su al lo como más pero sus le ya o este esta sí porque muy sin sobre también me hay ser estar son está yo tú él ella nosotros qué cómo buenos días gracias hola mañana hoy bien',
    ),
    patterns: [
      [/dad$|ando$|iendo$/g, 1.2],
      [/mente$|[ai]do$/g, 1.0],
      [/os$|ar$|os[oa]$|er[oa]$|ell[oa]$/g, 0.6],
    ],
  },
  fr: {
    letters: [8.2, 0.9, 3.35, 3.7, 17.1, 1.1, 0.9, 0.7, 7.6, 0.6, 0.07, 5.5, 3.0, 7.1, 5.8, 2.5, 1.4, 6.7, 7.9, 7.2, 6.4, 1.8, 0.05, 0.4, 0.15, 0.3],
    marks: [
      [/[œ]/g, 5],
      [/[çâêîôûëï]/g, 3],
      [/é/g, 2],
      [/[àèù]/g, 1.5],
      [/(?:^|[^\p{L}])(?:l|d|j|qu|n|s|c|m|t)['’](?=[\p{L}])/gu, 3],
    ],
    words: words(
      'le la les de des du et en un une est que qui dans pour pas ne se ce il elle au aux avec sur son sa ses par plus ou mais nous vous ils elles je tu être avoir sont était cette ces comme tout très bonjour merci oui non bien demain',
    ),
    patterns: [
      [/eau|eux$|aux$|oux$|euse$/g, 1.5],
      [/eur$|oir$|ais$|ait$|aient$/g, 1.3],
      [/ette$|ille|oi|ont$/g, 0.7],
      [/ment$|ez$|que$|gn/g, 0.5],
    ],
  },
  it: {
    letters: [12.4, 0.9, 4.5, 3.7, 12.1, 1.15, 1.6, 0.65, 10.6, 0.05, 0.05, 6.5, 2.5, 6.9, 9.8, 3.1, 0.5, 6.4, 5.0, 5.6, 3.0, 2.1, 0.05, 0.05, 0.05, 1.2],
    marks: [
      [/[ìò]/g, 3],
      [/[àèù]/g, 1.5],
      [/é/g, 0.5],
    ],
    words: words(
      'il lo la i gli le di del della dei e è in un una che per non con si da su al alla come più ma o se sono era ha hanno io tu lui lei noi voi loro questo questa anche molto essere avere cosa perché buongiorno grazie ciao oggi domani bene',
    ),
    patterns: [
      [/zion[ei]$|gli[aeou]|^gli$|cch|issim[oaie]$/g, 1.5],
      [/gh[ei]|[^q]uo|^uo|ett[oai]$|mente$/g, 1.0],
      [/zz|gn/g, 0.7],
      [/sc[ei]|ell[oa]$|at[oa]$|[aei]re$/g, 0.5],
    ],
  },
};

const LATIN_LANGS = Object.keys(PROFILES);
const WORD_WEIGHT = 3;
const LETTER_WEIGHT = 0.6;
// Lekka przewaga „na starcie” dla języka przeglądarki i angielskiego — to najczęstsza para na fiszkach.
const PRIOR_BONUS = 1.5;
// Przewaga nad drugim kandydatem wymagana, by zaufać pojedynczemu tekstowi. Dla jednego słowa
// próg jest wyższy: samo „las” (hiszpański rodzajnik, ale i polski las) to za mało.
const CONFIDENT_MARGIN = 3;
const CONFIDENT_MARGIN_SINGLE_WORD = 4.5;
const MIN_MARGIN = 0.75; // minimalna przewaga, by w ogóle brać wynik pod uwagę

const LOG_LETTERS = Object.fromEntries(
  LATIN_LANGS.map((lang) => [lang, PROFILES[lang].letters.map((percent) => Math.log(percent / 100))]),
);

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/** „żółć” → „zolc”: litery podstawowe bez znaków diakrytycznych. */
function foldToAscii(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss')
    .replace(/[œæ]/g, 'e')
    .replace(/ø/g, 'o');
}

/** Język przeglądarki jako kod BCP-47 z regionem, np. 'pl-PL'. */
function browserLocale() {
  const tag = typeof navigator !== 'undefined' ? String(navigator.language || '') : '';
  if (/^[a-z]{2,3}-[A-Z]{2}$/.test(tag)) return tag;
  const base = tag.split('-')[0].toLowerCase();
  if (DEFAULT_LOCALE[base]) return DEFAULT_LOCALE[base];
  return /^[a-z]{2,3}$/.test(base) ? base : 'pl-PL';
}

/** Kod języka ('en') → wariant używany do odsłuchu ('en-US'); dla języka przeglądarki — jej własny wariant. */
function toLocale(lang) {
  if (!lang) return null;
  const browser = browserLocale();
  return browser.split('-')[0] === lang ? browser : (DEFAULT_LOCALE[lang] ?? lang);
}

function scoreLatin(text, tokens) {
  const folded = foldToAscii(text);
  const browserLang = browserLocale().split('-')[0];
  const scores = {};

  for (const lang of LATIN_LANGS) {
    const profile = PROFILES[lang];
    let score = lang === 'en' || lang === browserLang ? PRIOR_BONUS : 0;

    for (const [pattern, weight] of profile.marks) score += weight * countMatches(text, pattern);

    for (const token of tokens) {
      // Jednoliterowe słowa („a”, „i”, „o”) są wspólne dla wielu języków i bywają fragmentami wzorów czy oznaczeń.
      if (profile.words.has(token)) score += token.length === 1 ? 1 : WORD_WEIGHT;
      for (const [pattern, weight] of profile.patterns) score += weight * countMatches(token, pattern);
    }

    let letters = 0;
    const logs = LOG_LETTERS[lang];
    for (let i = 0; i < folded.length; i += 1) {
      const index = folded.charCodeAt(i) - 97;
      if (index >= 0 && index < 26) letters += logs[index];
    }

    scores[lang] = score + LETTER_WEIGHT * letters;
  }

  return scores;
}

const cache = new Map();

const NOTHING = { lang: null, margin: 0, confident: false, scores: null };

/**
 * Rozpoznaje język tekstu.
 * @returns {{ lang: string | null, margin: number, confident: boolean, scores: Record<string, number> | null }}
 *   kod języka (np. 'pl'), przewaga nad kolejnym kandydatem, informacja, czy wynik jest pewny, oraz punktacja
 *   języków zapisywanych alfabetem łacińskim (`null` dla innych alfabetów i tekstów bez liter)
 */
export function detectLanguage(input) {
  const text = String(input ?? '')
    .toLowerCase()
    .trim();
  if (!text) return NOTHING;

  const cacheable = text.length <= 200; // długich tekstów zbiorczych nie opłaca się pamiętać
  const cached = cacheable ? cache.get(text) : undefined;
  if (cached) return cached;

  let result;
  const letterCount = countMatches(text, /\p{L}/gu);

  const script = SCRIPTS.find(({ pattern }) => countMatches(text, pattern) >= Math.max(1, letterCount * 0.3));
  if (script) {
    result = { lang: script.lang(text), margin: Infinity, confident: true, scores: null };
  } else if (letterCount === 0) {
    result = NOTHING;
  } else {
    const tokens = text.match(/\p{L}+/gu) ?? [];
    const scores = scoreLatin(text, tokens);
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const margin = ranked[0][1] - ranked[1][1];
    const required = tokens.length > 1 ? CONFIDENT_MARGIN : CONFIDENT_MARGIN_SINGLE_WORD;
    result = { lang: ranked[0][0], margin, confident: margin >= required, scores };
  }

  if (cacheable) {
    if (cache.size > 3000) cache.clear();
    cache.set(text, result);
  }
  return result;
}

// ── Języki całego zestawu ──────────────────────────────────────────────────
// Taka przewaga języka drugiej strony oznacza zestaw jednojęzyczny (np. pytania i odpowiedzi po polsku).
const SAME_LANGUAGE_MARGIN = 1.5;
// Słówko i jego tłumaczenie mają zbliżoną długość; pytanie bywa kilka razy dłuższe od odpowiedzi.
const MAX_TRANSLATION_LENGTH_RATIO = 2;

const averageLength = (texts) => texts.reduce((sum, text) => sum + text.length, 0) / Math.max(1, texts.length);

/**
 * Kształt zestawu: `short` — obie strony to krótkie teksty (słowa, zwroty, krótkie pytania),
 * `translations` — dodatkowo mają podobną długość, czyli najpewniej są to słówka z tłumaczeniami.
 */
function deckShape(fronts, backs) {
  const front = averageLength(fronts);
  const back = averageLength(backs);
  const short = front > 0 && back > 0 && front <= 40 && back <= 40;
  return { short, translations: short && Math.max(front, back) / Math.min(front, back) <= MAX_TRANSLATION_LENGTH_RATIO };
}

/** Najwyżej punktowany język strony z pominięciem `excluded`. */
function bestExcept(side, excluded) {
  let best = null;
  for (const lang of LATIN_LANGS) {
    if (lang !== excluded && (best === null || side.scores[lang] > side.scores[best])) best = lang;
  }
  return best;
}

/**
 * Rozpoznaje języki obu stron zestawu jednocześnie.
 *
 * Każda strona jest oceniana na podstawie wszystkich swoich tekstów naraz. Gdy to za mało (mały zestaw,
 * słowa bez znaków diakrytycznych), pomaga druga strona:
 *   - w zestawie słówek strony są w różnych językach i jeden z nich to zwykle język użytkownika,
 *   - w zestawie pojęć z definicjami obie strony są w tym samym języku.
 *
 * @param {{ front: string, back: string }[]} cards
 * @returns {{ front: string | null, back: string | null }} kody BCP-47; `null`, gdy strona nie zawiera liter
 */
export function detectDeckLanguages(cards) {
  const fronts = cards.map((card) => card.front);
  const backs = cards.map((card) => card.back);
  const front = detectLanguage(fronts.join('\n').slice(0, 20000));
  const back = detectLanguage(backs.join('\n').slice(0, 20000));
  const native = browserLocale().split('-')[0];
  const { short, translations } = deckShape(fronts, backs);

  /** Język strony niepewnej (`unsure`), gdy druga strona (`sure`) została rozpoznana pewnie. */
  const inferFrom = (sure, unsure) => {
    if (!unsure.scores) return unsure.lang; // strona bez liter — nie ma czego wnioskować
    const known = sure.lang;

    if (!translations) {
      // Strona sama dość wyraźnie wskazuje inny język.
      if (unsure.lang !== known && unsure.margin >= CONFIDENT_MARGIN / 2) return unsure.lang;
      // Krótkie teksty o różnej długości (np. „der Hund” / „pies”): język użytkownika albo język drugiej strony
      // — ten, do którego strona pasuje lepiej.
      if (short && known !== native && native in unsure.scores) {
        return !(known in unsure.scores) || unsure.scores[native] >= unsure.scores[known] ? native : known;
      }
      // Pojęcie i definicja: ten sam język.
      return known;
    }

    // Słówka: strona, która nie wygląda wyraźnie na język drugiej strony, jest w innym języku.
    if (known in unsure.scores && unsure.scores[known] - unsure.scores[bestExcept(unsure, known)] >= SAME_LANGUAGE_MARGIN) {
      return known;
    }
    if (known !== native && native in unsure.scores) return native;
    return bestExcept(unsure, known);
  };

  let frontLang = front.lang;
  let backLang = back.lang;

  if (front.confident && !back.confident) {
    backLang = inferFrom(front, back);
  } else if (back.confident && !front.confident) {
    frontLang = inferFrom(back, front);
  } else if (!front.confident && !back.confident) {
    if (translations && front.scores && back.scores && native in front.scores) {
      // Dwie niepewne strony słówek: jedna jest najpewniej w języku użytkownika.
      // Porównujemy oba układy („swój” język na awersie albo na rewersie) i wybieramy bardziej prawdopodobny.
      const foreignFront = bestExcept(front, native);
      const foreignBack = bestExcept(back, native);
      const nativeOnFront = front.scores[native] + back.scores[foreignBack];
      const nativeOnBack = front.scores[foreignFront] + back.scores[native];
      if (nativeOnFront > nativeOnBack) {
        frontLang = native;
        backLang = foreignBack;
      } else {
        frontLang = foreignFront;
        backLang = native;
      }
    } else {
      // W pozostałych przypadkach zbyt słaby wynik zastępujemy językiem przeglądarki.
      if (front.lang && front.margin < MIN_MARGIN) frontLang = native;
      if (back.lang && back.margin < MIN_MARGIN) backLang = native;
    }
  }

  return { front: toLocale(frontLang), back: toLocale(backLang) };
}

/**
 * Wybiera język odsłuchu dla konkretnego tekstu.
 * @param {string} text      treść do przeczytania
 * @param {string} setting   ustawienie zestawu: 'auto' albo kod BCP-47
 * @param {string | null} [sideLanguage] język tej strony zestawu z `detectDeckLanguages`
 * @returns {string} kod BCP-47, np. 'en-US'
 */
export function resolveSpeechLanguage(text, setting, sideLanguage = null) {
  if (setting && setting !== AUTO) return setting;

  // Tekst, który sam jednoznacznie wskazuje język (np. polskie zdanie w angielskim zestawie), ma pierwszeństwo.
  const { lang, confident } = detectLanguage(text);
  if (confident) return toLocale(lang);

  return sideLanguage ?? browserLocale();
}

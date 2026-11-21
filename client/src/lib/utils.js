/** Skleja nazwy klas, pomijając wartości fałszywe: cx('a', warunek && 'b'). */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

/** Polska odmiana rzeczownika przez liczbę: plural(5, 'fiszka', 'fiszki', 'fiszek') → 'fiszek'. */
export function plural(count, one, few, many) {
  if (count === 1) return one;
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const cardsLabel = (count) => `${count} ${plural(count, 'fiszka', 'fiszki', 'fiszek')}`;
export const decksLabel = (count) => `${count} ${plural(count, 'zestaw', 'zestawy', 'zestawów')}`;

/** Dopełnienie zdania w potwierdzeniu usunięcia zestawu: „…razem z 12 fiszkami”. */
export function withCardsPhrase(count) {
  if (count === 0) return '';
  return count === 1 ? ' razem z 1 fiszką' : ` razem z ${count} fiszkami`;
}

const relativeTime = new Intl.RelativeTimeFormat('pl', { numeric: 'auto' });

/** „3 dni temu”, „wczoraj”, „przed chwilą”. */
export function timeAgo(isoDate) {
  const seconds = Math.round((new Date(isoDate).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (!Number.isFinite(seconds)) return '';
  if (abs < 60) return 'przed chwilą';
  if (abs < 3600) return relativeTime.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relativeTime.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 30) return relativeTime.format(Math.round(seconds / 86400), 'day');
  if (abs < 86400 * 365) return relativeTime.format(Math.round(seconds / (86400 * 30)), 'month');
  return relativeTime.format(Math.round(seconds / (86400 * 365)), 'year');
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Algorytm Fishera–Yatesa; zwraca nową, przetasowaną tablicę. */
export function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Poprawny adres http(s) albo `null`. */
export function parseHttpUrl(value) {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

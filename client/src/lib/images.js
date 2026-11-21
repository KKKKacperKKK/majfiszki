import { apiBlob } from './api.js';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // zgodne z domyślnym limitem serwera (MAX_UPLOAD_MB)

const MAX_DIMENSION = 1600; // dłuższy bok po zmniejszeniu — z zapasem na ekrany o dużej gęstości
const KEEP_ORIGINAL_BELOW = 600 * 1024;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* próbujemy przez <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Przygotowuje obraz do wysłania: duże zdjęcia (np. z telefonu) są zmniejszane w przeglądarce
 * do rozsądnych wymiarów. Dzięki temu wysyłka trwa krócej, a fiszki ładują się szybko.
 * Przy okazji z pliku znikają metadane EXIF (np. lokalizacja GPS).
 * @param {File} file
 * @returns {Promise<File>} plik gotowy do wysłania
 * @throws {Error} z komunikatem dla użytkownika
 */
export async function prepareImage(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('To nie jest plik graficzny. Wybierz obraz JPG, PNG, WebP lub GIF.');
  }

  const isAccepted = ACCEPTED_IMAGE_TYPES.includes(file.type);

  // Animowanych GIF-ów nie przetwarzamy (straciłyby animację), małych plików też nie ma po co.
  if (isAccepted && (file.type === 'image/gif' || file.size <= KEEP_ORIGINAL_BELOW)) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('Obraz jest za duży — maksymalny rozmiar to 5 MB.');
    return file;
  }

  let source;
  try {
    source = await decodeImage(file);
  } catch {
    if (isAccepted && file.size <= MAX_UPLOAD_BYTES) return file;
    throw new Error('Nie udało się odczytać tego obrazu. Spróbuj z plikiem JPG, PNG lub WebP.');
  }

  const sourceWidth = source.naturalWidth ?? source.width;
  const sourceHeight = source.naturalHeight ?? source.height;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  source.close?.();

  // JPEG zostaje JPEG-iem; pozostałe formaty zapisujemy jako WebP (zachowuje przezroczystość).
  // Przeglądarka bez kodera WebP zwróci PNG — to również akceptowany format.
  const targetType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
  const blob = await canvasToBlob(canvas, targetType, 0.86);

  if (!blob) {
    if (isAccepted && file.size <= MAX_UPLOAD_BYTES) return file;
    throw new Error('Nie udało się przetworzyć tego obrazu. Spróbuj z innym plikiem.');
  }

  // Jeśli przetworzenie nic nie dało (plik już był dobrze skompresowany), zostaje oryginał.
  if (isAccepted && scale === 1 && blob.size >= file.size && file.size <= MAX_UPLOAD_BYTES) return file;

  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('Obraz jest za duży — maksymalny rozmiar to 5 MB.');

  const extension = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' }[blob.type] ?? 'img';
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'obraz';
  return new File([blob], `${baseName}.${extension}`, { type: blob.type });
}

// ── Obrazki przesłane na serwer ────────────────────────────────────────────
// Są prywatne: serwer wydaje je tylko z nagłówkiem Authorization, którego znacznik <img>
// nie potrafi wysłać. Pobieramy je więc przez fetch i pokazujemy jako adresy blob:.
const privateImages = new Map(); // adres API → { promise, objectUrl }

/** Zwraca (i zapamiętuje) adres blob: dla prywatnego obrazka. */
export function loadPrivateImage(src) {
  let entry = privateImages.get(src);
  if (!entry) {
    entry = { objectUrl: null, promise: null };
    entry.promise = apiBlob(src)
      .then((blob) => {
        entry.objectUrl = URL.createObjectURL(blob);
        return entry.objectUrl;
      })
      .catch((err) => {
        privateImages.delete(src); // pozwala spróbować ponownie
        throw err;
      });
    privateImages.set(src, entry);
  }
  return entry.promise;
}

/** Adres blob: już pobranego obrazka albo `null`. */
export function peekPrivateImage(src) {
  return privateImages.get(src)?.objectUrl ?? null;
}

/** Zwalnia pamięć po obrazku, który nie będzie już potrzebny (usunięty lub podmieniony). */
export function forgetPrivateImage(src) {
  const entry = privateImages.get(src);
  if (!entry) return;
  privateImages.delete(src);
  if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
}

/** Czyści całą pamięć obrazków — wywoływane przy wylogowaniu. */
export function clearPrivateImages() {
  for (const entry of privateImages.values()) {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  }
  privateImages.clear();
}

/** Wczytuje z wyprzedzeniem obrazek fiszki (np. następnej w trybie nauki). */
export function preloadCardImage(image) {
  if (!image) return;
  if (image.kind === 'upload') {
    loadPrivateImage(image.src).catch(() => {});
  } else {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = image.src;
  }
}

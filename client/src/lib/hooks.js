import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { loadPrivateImage, peekPrivateImage } from './images.js';
import { getVoices, subscribeVoices } from './speech.js';

/** Ustawia tytuł karty przeglądarki: „Zestawy · Fiszki”. */
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Fiszki` : 'Fiszki';
  }, [title]);
}

const LOADING = { status: 'loading', data: null, error: null };

/**
 * Pobiera dane z API i śledzi stan: 'loading' | 'ready' | 'error'.
 * `reload` ponawia pobieranie (np. po błędzie), a `setData` pozwala nanieść lokalnie wynik zapisu
 * bez ponownego pobierania całości.
 */
export function useFetch(path) {
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${attempt}:${path}`;
  const [result, setResult] = useState({ requestKey: null, ...LOADING });

  useEffect(() => {
    const controller = new AbortController();
    api(path, { signal: controller.signal }).then(
      (data) => setResult({ requestKey, status: 'ready', data, error: null }),
      (error) => {
        if (error?.name !== 'AbortError') setResult({ requestKey, status: 'error', data: null, error });
      },
    );
    return () => controller.abort(); // zmiana adresu lub zamknięcie widoku anuluje żądanie w toku
  }, [path, requestKey]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  const setData = useCallback((updater) => {
    setResult((previous) =>
      previous.status === 'ready'
        ? { ...previous, data: typeof updater === 'function' ? updater(previous.data) : updater }
        : previous,
    );
  }, []);

  // Dopóki nie nadejdzie odpowiedź na bieżące żądanie, zapamiętany wynik dotyczy poprzedniego — pokazujemy ładowanie.
  const current = result.requestKey === requestKey ? result : LOADING;

  return { status: current.status, data: current.data, error: current.error, reload, setData };
}

/** Lista głosów syntezatora mowy dostępnych w przeglądarce. */
export function useVoices() {
  return useSyncExternalStore(subscribeVoices, getVoices);
}

/** `true`, gdy element pojawił się w oknie przeglądarki (lub tuż obok). Służy do leniwego ładowania. */
export function useInView(enabled = true) {
  const ref = useRef(null);
  const [inView, setInView] = useState(!enabled);

  useEffect(() => {
    if (!enabled || inView) return undefined;
    const element = ref.current;
    if (!element || typeof IntersectionObserver !== 'function') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true);
      },
      { rootMargin: '300px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, inView]);

  return [ref, inView];
}

/**
 * Zamienia opis obrazka fiszki z API na adres dla <img>.
 *   { kind: 'url' }    → adres zewnętrzny, używany bezpośrednio,
 *   { kind: 'upload' } → prywatny plik pobierany z tokenem i podawany jako adres blob:.
 * @param {{ kind: 'url' | 'upload', src: string } | null} image
 * @param {boolean} [enabled] `false` odracza pobieranie (np. do chwili, gdy element pojawi się na ekranie)
 * @returns {{ src: string | null, status: 'empty' | 'idle' | 'loading' | 'ready' | 'error' }}
 */
export function useCardImageSrc(image, enabled = true) {
  const kind = image?.kind ?? null;
  const source = image?.src ?? null;
  // Wynik ostatniego pobierania; zmiana tego stanu wymusza ponowne narysowanie komponentu.
  const [result, setResult] = useState({ source: null, failed: false });

  useEffect(() => {
    if (kind !== 'upload' || !enabled || peekPrivateImage(source)) return undefined;

    let cancelled = false;
    loadPrivateImage(source).then(
      () => {
        if (!cancelled) setResult({ source, failed: false });
      },
      () => {
        if (!cancelled) setResult({ source, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [kind, source, enabled]);

  if (!source) return { src: null, status: 'empty' };
  if (kind === 'url') return { src: source, status: 'ready' };

  const objectUrl = peekPrivateImage(source);
  if (objectUrl) return { src: objectUrl, status: 'ready' };
  if (result.source === source && result.failed) return { src: null, status: 'error' };
  return { src: null, status: enabled ? 'loading' : 'idle' };
}

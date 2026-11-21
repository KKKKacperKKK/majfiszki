import { getContext } from '@netlify/server';

/**
 * Prosty licznik zdarzeń w oknie czasowym, trzymany w pamięci procesu.
 * Wystarcza dla pojedynczej instancji serwera; przy wielu instancjach
 * należałoby przenieść stan np. do Redisa.
 */
export function createRateLimiter({ windowMs, max }) {
  const buckets = new Map();

  function current(key, now) {
    const bucket = buckets.get(key);
    if (!bucket) return null;
    if (bucket.resetAt <= now) {
      buckets.delete(key);
      return null;
    }
    return bucket;
  }

  function prune(now) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return {
    /** Liczba sekund do odblokowania albo 0, gdy limit nie został przekroczony. */
    retryAfter(key, now = Date.now()) {
      const bucket = current(key, now);
      return bucket && bucket.count >= max ? Math.ceil((bucket.resetAt - now) / 1000) : 0;
    },

    hit(key, now = Date.now()) {
      let bucket = current(key, now);
      if (!bucket) {
        if (buckets.size >= 50_000) prune(now);
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
    },

    reset(key) {
      buckets.delete(key);
    },
  };
}

/** Adres IP klienta: na Netlify podawany przez platformę (nie da się go podrobić nagłówkiem), lokalnie z Expressa. */
export function clientIp(req) {
  try {
    const ip = getContext()?.ip;
    if (ip) return ip;
  } catch {
    /* poza Netlify Server — brak kontekstu żądania */
  }
  return req.ip || 'unknown';
}

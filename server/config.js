import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

/** `TRUST_PROXY` przyjmuje liczbę pośredników (np. 1), `true` albo listę adresów zrozumiałą dla Expressa. */
function toTrustProxy(value) {
  const raw = String(value ?? '').trim();
  if (!raw || ['0', 'false', 'no', 'off'].includes(raw.toLowerCase())) return false;
  if (raw.toLowerCase() === 'true') return true;
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

/** Buduje konfigurację ze zmiennych środowiskowych (patrz `.env.example`). */
export function loadConfig(env = process.env) {
  return {
    port: toInt(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',

    clientDir: path.join(rootDir, 'dist'),

    jwtSecret: env.JWT_SECRET || null,
    jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
    bcryptRounds: Math.min(toInt(env.BCRYPT_ROUNDS, 12), 15),

    maxUploadBytes: toInt(env.MAX_UPLOAD_MB, 5) * 1024 * 1024,

    allowEmbedding: toBool(env.ALLOW_EMBEDDING),
    trustProxy: toTrustProxy(env.TRUST_PROXY),

    // Limity chroniące przed zgadywaniem haseł i masowym zakładaniem kont.
    limits: {
      loginFailuresPerUser: 8, // nieudane logowania na parę (adres IP, nazwa użytkownika) w ciągu 15 minut
      loginFailuresPerIp: 60, // nieudane logowania z jednego adresu IP w ciągu 15 minut
      registrationsPerIp: 30, // nowe konta z jednego adresu IP w ciągu godziny
    },
  };
}

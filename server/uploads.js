import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import multer from 'multer';
import { HttpError } from './errors.js';

const ascii = (buffer, start, end) => buffer.toString('latin1', start, end);

// Typ pliku rozpoznajemy po jego faktycznej zawartości („magic bytes”),
// a nie po rozszerzeniu ani nagłówku Content-Type wysłanym przez przeglądarkę.
// SVG jest celowo pominięty — może zawierać skrypty.
const IMAGE_TYPES = [
  { ext: 'jpg', mime: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', matches: (b) => b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a },
  { ext: 'gif', mime: 'image/gif', matches: (b) => ['GIF87a', 'GIF89a'].includes(ascii(b, 0, 6)) },
  { ext: 'webp', mime: 'image/webp', matches: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  { ext: 'avif', mime: 'image/avif', matches: (b) => ascii(b, 4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(b, 8, 12)) },
];

const FILE_NAME_RE = /^[a-f0-9]{32}\.(jpg|png|gif|webp|avif)$/;

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  return IMAGE_TYPES.find((type) => type.matches(buffer)) ?? null;
}

export function createUploads({ maxUploadBytes }) {
  // Obrazki fiszek są przechowywane w Netlify Blobs (trwałe, niezależne od procesu serwera).
  const store = getStore({ name: 'card-images', consistency: 'strong' });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes, files: 1, fields: 20, fieldSize: 64 * 1024 },
  });

  return {
    maxUploadBytes,

    /** Middleware: parsuje formularz multipart z opcjonalnym plikiem w polu `image`. */
    parseCardForm: upload.single('image'),

    /** Zapisuje obraz pod losową nazwą i zwraca tę nazwę (trafia do `cards.image_file`). */
    async save(buffer) {
      const type = detectImageType(buffer);
      if (!type) {
        throw new HttpError(415, 'unsupported_image', 'Nieobsługiwany format obrazu. Dozwolone: JPG, PNG, WebP, GIF i AVIF.', {
          image: 'Nieobsługiwany format obrazu. Dozwolone: JPG, PNG, WebP, GIF i AVIF.',
        });
      }
      const name = `${crypto.randomBytes(16).toString('hex')}.${type.ext}`;
      await store.set(name, new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
      return name;
    },

    /** Usuwa pliki obrazów; brak pliku nie jest błędem. */
    async remove(...names) {
      await Promise.all(
        names
          .filter((name) => typeof name === 'string' && FILE_NAME_RE.test(name))
          .map((name) =>
            store.delete(name).catch((err) => {
              console.error(`Nie udało się usunąć pliku ${name}:`, err.message);
            }),
          ),
      );
    },

    /** Zawartość i typ MIME zapisanego obrazu albo `null`, gdy nazwa jest nieprawidłowa lub pliku brak. */
    async read(name) {
      if (typeof name !== 'string' || !FILE_NAME_RE.test(name)) return null;
      const data = await store.get(name, { type: 'arrayBuffer' });
      if (!data) return null;
      const ext = name.slice(name.lastIndexOf('.') + 1);
      const type = IMAGE_TYPES.find((candidate) => candidate.ext === ext);
      return { buffer: Buffer.from(data), mime: type.mime };
    },
  };
}

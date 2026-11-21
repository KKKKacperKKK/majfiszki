import { Router } from 'express';
import { notFound } from '../errors.js';
import { toCard } from '../serializers.js';
import { parseCard, parseId } from '../validation.js';

// Fiszka należy do użytkownika wtedy, gdy należy do niego jej zestaw.
const OWNED_CARD = `
  SELECT c.* FROM cards c
    JOIN decks d ON d.id = c.deck_id
   WHERE c.id = ? AND d.user_id = ?`;

export function cardRoutes({ db, auth, uploads }) {
  const router = Router();
  router.use(auth.requireAuth);

  const cardNotFound = () => notFound('Nie znaleziono fiszki.');

  async function findCard(req) {
    const id = parseId(req.params.cardId);
    const card = id ? await db.get(OWNED_CARD, id, req.user.id) : null;
    if (!card) throw cardNotFound();
    return card;
  }

  // Obrazek przesłany z dysku. Dostęp ma wyłącznie właściciel fiszki — dlatego frontend
  // pobiera go przez fetch z nagłówkiem Authorization, a nie zwykłym <img src>.
  router.get('/:cardId/image', async (req, res) => {
    const card = await findCard(req);
    if (!card.image_file) throw notFound('Ta fiszka nie ma obrazka.');
    const image = await uploads.read(card.image_file);
    if (!image) throw notFound('Nie znaleziono pliku obrazka.');

    res.vary('Authorization');
    res.set({
      'Content-Type': image.mime,
      'Content-Disposition': 'inline',
      // Adres zawiera wersję pliku (?v=…), więc przeglądarka może go trzymać w prywatnej pamięci podręcznej.
      'Cache-Control': 'private, max-age=31536000, immutable',
    });
    res.send(image.buffer);
  });

  // Edycja fiszki. Obrazek zmienia się tylko wtedy, gdy żądanie mówi o tym wprost:
  //   plik `image`          → nowy plik z dysku,
  //   pole `imageUrl`       → zewnętrzny adres,
  //   pole `removeImage=1`  → usunięcie obrazka,
  //   żadne z powyższych    → obrazek zostaje bez zmian.
  router.patch('/:cardId', uploads.parseCardForm, async (req, res) => {
    const card = await findCard(req);
    const input = parseCard(req.body, { partial: true });

    const newFile = req.file ? await uploads.save(req.file.buffer) : null;

    let result;
    try {
      result = await db.transaction(async (tx) => {
        const current = await tx.get(`${OWNED_CARD} FOR UPDATE OF c`, card.id, req.user.id);
        if (!current) throw cardNotFound(); // fiszka usunięta w trakcie zapisywania pliku

        let imageFile = current.image_file;
        let imageUrl = current.image_url;
        if (newFile) {
          imageFile = newFile;
          imageUrl = null;
        } else if (input.imageUrl) {
          imageFile = null;
          imageUrl = input.imageUrl;
        } else if (input.removeImage) {
          imageFile = null;
          imageUrl = null;
        }

        const now = new Date().toISOString();
        const updated = await tx.get(
          'UPDATE cards SET front = ?, back = ?, image_file = ?, image_url = ?, image_side = ?, updated_at = ? WHERE id = ? RETURNING *',
          input.front ?? current.front,
          input.back ?? current.back,
          imageFile,
          imageUrl,
          input.imageSide ?? current.image_side,
          now,
          current.id,
        );
        await tx.run('UPDATE decks SET updated_at = ? WHERE id = ?', now, current.deck_id);

        return {
          card: updated,
          replacedFile: current.image_file && current.image_file !== imageFile ? current.image_file : null,
        };
      });
    } catch (err) {
      await uploads.remove(newFile);
      throw err;
    }

    await uploads.remove(result.replacedFile);
    res.json({ card: toCard(result.card) });
  });

  router.delete('/:cardId', async (req, res) => {
    const card = await findCard(req);

    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM cards WHERE id = ?', card.id);
      await tx.run('UPDATE decks SET updated_at = ? WHERE id = ?', new Date().toISOString(), card.deck_id);
    });

    await uploads.remove(card.image_file);
    res.status(204).end();
  });

  return router;
}

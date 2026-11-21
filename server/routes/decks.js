import { Router } from 'express';
import { HttpError, notFound } from '../errors.js';
import { SAMPLE_DECK, sampleImage } from '../sample-deck.js';
import { toCard, toDeck } from '../serializers.js';
import { parseCard, parseDeck, parseId } from '../validation.js';

const MAX_DECKS_PER_USER = 500;
export const MAX_CARDS_PER_DECK = 2000;

const DECK_WITH_COUNT = `
  SELECT d.*, (SELECT COUNT(*)::int FROM cards c WHERE c.deck_id = d.id) AS card_count
    FROM decks d`;

export function deckRoutes({ db, auth, uploads }) {
  const router = Router();
  router.use(auth.requireAuth);

  // Każde zapytanie o zestaw zawiera warunek `user_id = ?` — cudzy zestaw wygląda
  // dokładnie tak samo jak nieistniejący (404), więc nie da się nawet sprawdzić, czy istnieje.
  async function findDeck(req) {
    const id = parseId(req.params.deckId);
    const deck = id ? await db.get(`${DECK_WITH_COUNT} WHERE d.id = ? AND d.user_id = ?`, id, req.user.id) : null;
    if (!deck) throw notFound('Nie znaleziono zestawu.');
    return deck;
  }

  async function assertCanCreateDeck(userId) {
    const { total } = await db.get('SELECT COUNT(*)::int AS total FROM decks WHERE user_id = ?', userId);
    if (total >= MAX_DECKS_PER_USER) {
      throw new HttpError(409, 'limit_reached', `Osiągnięto limit ${MAX_DECKS_PER_USER} zestawów na koncie.`);
    }
  }

  async function insertDeck(client, userId, deck, now) {
    const row = await client.get(
      `INSERT INTO decks (user_id, name, description, front_lang, back_lang, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      userId,
      deck.name,
      deck.description,
      deck.frontLang,
      deck.backLang,
      now,
      now,
    );
    return row.id;
  }

  router.get('/', async (req, res) => {
    const rows = await db.all(`${DECK_WITH_COUNT} WHERE d.user_id = ? ORDER BY d.updated_at DESC, d.id DESC`, req.user.id);
    res.json({ decks: rows.map(toDeck) });
  });

  router.post('/', async (req, res) => {
    const input = parseDeck(req.body);
    await assertCanCreateDeck(req.user.id);

    const deckId = await insertDeck(db, req.user.id, input, new Date().toISOString());
    const deck = await db.get(`${DECK_WITH_COUNT} WHERE d.id = ?`, deckId);
    res.status(201).json({ deck: toDeck(deck) });
  });

  // Przykładowy zestaw z obrazkami — żeby od razu można było wypróbować tryb nauki.
  router.post('/sample', async (req, res) => {
    await assertCanCreateDeck(req.user.id);

    const savedFiles = new Map();
    try {
      for (const card of SAMPLE_DECK.cards) {
        if (card.image) {
          savedFiles.set(card.image, await uploads.save(sampleImage(card.image)));
        }
      }

      const deckId = await db.transaction(async (tx) => {
        const now = new Date().toISOString();
        const id = await insertDeck(tx, req.user.id, SAMPLE_DECK, now);
        for (const [position, card] of SAMPLE_DECK.cards.entries()) {
          await tx.run(
            `INSERT INTO cards (deck_id, front, back, image_file, image_side, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            id,
            card.front,
            card.back,
            card.image ? savedFiles.get(card.image) : null,
            card.imageSide ?? 'both',
            position,
            now,
            now,
          );
        }
        return id;
      });

      const deck = await db.get(`${DECK_WITH_COUNT} WHERE d.id = ?`, deckId);
      res.status(201).json({ deck: toDeck(deck) });
    } catch (err) {
      await uploads.remove(...savedFiles.values());
      throw err;
    }
  });

  router.get('/:deckId', async (req, res) => {
    const deck = await findDeck(req);
    const cards = await db.all('SELECT * FROM cards WHERE deck_id = ? ORDER BY position, id', deck.id);
    res.json({ deck: toDeck(deck), cards: cards.map(toCard) });
  });

  router.patch('/:deckId', async (req, res) => {
    const deck = await findDeck(req);
    const input = parseDeck(req.body, { partial: true });

    await db.run(
      'UPDATE decks SET name = ?, description = ?, front_lang = ?, back_lang = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      input.name ?? deck.name,
      input.description ?? deck.description,
      input.frontLang ?? deck.front_lang,
      input.backLang ?? deck.back_lang,
      new Date().toISOString(),
      deck.id,
      req.user.id,
    );

    res.json({ deck: toDeck(await db.get(`${DECK_WITH_COUNT} WHERE d.id = ?`, deck.id)) });
  });

  router.delete('/:deckId', async (req, res) => {
    const deck = await findDeck(req);

    const files = await db.transaction(async (tx) => {
      const rows = await tx.all('SELECT image_file FROM cards WHERE deck_id = ? AND image_file IS NOT NULL', deck.id);
      await tx.run('DELETE FROM decks WHERE id = ? AND user_id = ?', deck.id, req.user.id); // fiszki znikają kaskadowo
      return rows.map((row) => row.image_file);
    });

    await uploads.remove(...files);
    res.status(204).end();
  });

  // Nowa fiszka. Przyjmuje JSON albo multipart/form-data (gdy dołączony jest plik `image`).
  router.post('/:deckId/cards', uploads.parseCardForm, async (req, res) => {
    const deck = await findDeck(req);
    const input = parseCard(req.body);

    if (deck.card_count >= MAX_CARDS_PER_DECK) {
      throw new HttpError(409, 'limit_reached', `Zestaw może mieć maksymalnie ${MAX_CARDS_PER_DECK} fiszek.`);
    }

    // Przesłany plik ma pierwszeństwo przed adresem URL.
    const imageFile = req.file ? await uploads.save(req.file.buffer) : null;
    const imageUrl = imageFile ? null : (input.imageUrl ?? null);

    try {
      const card = await db.transaction(async (tx) => {
        // Zestaw mógł zostać usunięty w trakcie zapisywania pliku. FOR UPDATE szereguje równoczesne dodawanie fiszek.
        if (!(await tx.get('SELECT 1 AS found FROM decks WHERE id = ? AND user_id = ? FOR UPDATE', deck.id, req.user.id))) {
          throw notFound('Nie znaleziono zestawu.');
        }
        const now = new Date().toISOString();
        const { position } = await tx.get('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM cards WHERE deck_id = ?', deck.id);
        const inserted = await tx.get(
          `INSERT INTO cards (deck_id, front, back, image_file, image_url, image_side, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
          deck.id,
          input.front,
          input.back,
          imageFile,
          imageUrl,
          input.imageSide ?? 'both',
          position,
          now,
          now,
        );
        await tx.run('UPDATE decks SET updated_at = ? WHERE id = ?', now, deck.id);
        return inserted;
      });

      res.status(201).json({ card: toCard(card) });
    } catch (err) {
      await uploads.remove(imageFile); // nie zostawiamy osieroconych plików
      throw err;
    }
  });

  return router;
}

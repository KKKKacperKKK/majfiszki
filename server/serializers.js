// Zamiana wierszy bazy danych na obiekty zwracane przez API.
// Dzięki temu do klienta nigdy nie trafia np. hash hasła.

export function toUser(row) {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
  };
}

export function toDeck(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    frontLang: row.front_lang,
    backLang: row.back_lang,
    cardCount: row.card_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCard(row) {
  let image = null;
  if (row.image_file) {
    // Plik z dysku serwera: pobierany przez API z nagłówkiem Authorization.
    // Parametr `v` zmienia się razem z plikiem, więc przeglądarka nie pokaże starej wersji z pamięci podręcznej.
    image = { kind: 'upload', src: `/api/cards/${row.id}/image?v=${row.image_file.slice(0, 12)}` };
  } else if (row.image_url) {
    image = { kind: 'url', src: row.image_url };
  }

  return {
    id: row.id,
    deckId: row.deck_id,
    front: row.front,
    back: row.back,
    image,
    imageSide: row.image_side,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

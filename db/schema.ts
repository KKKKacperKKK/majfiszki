// Schemat bazy danych aplikacji Fiszki (Netlify Database / Postgres).
// Migracje generuje `npx drizzle-kit generate`; Netlify stosuje je automatycznie przy wdrożeniu.
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text } from "drizzle-orm/pg-core";

// Użytkownicy: wyłącznie nazwa użytkownika i hash hasła (bcrypt).
export const users = pgTable("users", {
  id: serial().primaryKey(),
  username: text().notNull(),
  // Nazwa znormalizowana (NFKC + małe litery) — gwarantuje unikalność bez względu na wielkość liter.
  usernameKey: text("username_key").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // Zwiększany przy zmianie hasła; unieważnia wcześniej wydane tokeny JWT.
  tokenVersion: integer("token_version").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

// Zestawy (talie) fiszek. Każdy zestaw należy do dokładnie jednego użytkownika.
export const decks = pgTable(
  "decks",
  {
    id: serial().primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text().notNull().default(""),
    frontLang: text("front_lang").notNull().default("auto"),
    backLang: text("back_lang").notNull().default("auto"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("idx_decks_user").on(t.userId, t.updatedAt)],
);

// Fiszki. Obrazek jest opcjonalny: image_file — plik w Netlify Blobs, image_url — zewnętrzny adres.
export const cards = pgTable(
  "cards",
  {
    id: serial().primaryKey(),
    deckId: integer("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    front: text().notNull(),
    back: text().notNull(),
    imageFile: text("image_file"),
    imageUrl: text("image_url"),
    imageSide: text("image_side").notNull().default("both"),
    position: integer().notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("idx_cards_deck").on(t.deckId, t.position, t.id),
    check("cards_image_side_check", sql`${t.imageSide} IN ('front', 'back', 'both')`),
    check("cards_single_image_check", sql`${t.imageFile} IS NULL OR ${t.imageUrl} IS NULL`),
  ],
);

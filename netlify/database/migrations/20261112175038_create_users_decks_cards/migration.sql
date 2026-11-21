CREATE TABLE "cards" (
	"id" serial PRIMARY KEY,
	"deck_id" integer NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"image_file" text,
	"image_url" text,
	"image_side" text DEFAULT 'both' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "cards_image_side_check" CHECK ("image_side" IN ('front', 'back', 'both')),
	CONSTRAINT "cards_single_image_check" CHECK ("image_file" IS NULL OR "image_url" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"front_lang" text DEFAULT 'auto' NOT NULL,
	"back_lang" text DEFAULT 'auto' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"username" text NOT NULL,
	"username_key" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_cards_deck" ON "cards" ("deck_id","position","id");--> statement-breakpoint
CREATE INDEX "idx_decks_user" ON "decks" ("user_id","updated_at");--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_deck_id_decks_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
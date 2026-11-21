CREATE TABLE "learning_progress" (
	"user_id" integer,
	"card_id" integer,
	"box" integer DEFAULT 1 NOT NULL,
	"next_review_at" text NOT NULL,
	"consecutive_fails" integer DEFAULT 0 NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "learning_progress_pkey" PRIMARY KEY("user_id","card_id"),
	CONSTRAINT "learning_progress_box_check" CHECK ("box" BETWEEN 1 AND 5),
	CONSTRAINT "learning_progress_fails_check" CHECK ("consecutive_fails" >= 0)
);
--> statement-breakpoint
CREATE INDEX "idx_learning_progress_user_review" ON "learning_progress" ("user_id","next_review_at");--> statement-breakpoint
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_card_id_cards_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE;
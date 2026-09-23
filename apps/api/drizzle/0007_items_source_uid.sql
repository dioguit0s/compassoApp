ALTER TABLE "items" ADD COLUMN "source_uid" text;--> statement-breakpoint
CREATE UNIQUE INDEX "items_user_id_source_uid_idx" ON "items" USING btree ("user_id","source_uid");
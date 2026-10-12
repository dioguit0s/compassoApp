ALTER TABLE "items" ADD COLUMN "reminders_minutes_before" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
UPDATE "items" SET "reminders_minutes_before" = ARRAY["reminder_minutes_before"] WHERE "reminder_minutes_before" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_reminders_check" CHECK (cardinality("items"."reminders_minutes_before") <= 5);

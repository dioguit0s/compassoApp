ALTER TABLE "class_slots" ADD COLUMN "week_interval" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "class_slots" ADD COLUMN "week_offset" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "semesters" ADD COLUMN "kind" text DEFAULT 'semester' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_slots" ADD CONSTRAINT "class_slots_week_interval_check" CHECK ("class_slots"."week_interval" between 1 and 4);--> statement-breakpoint
ALTER TABLE "class_slots" ADD CONSTRAINT "class_slots_week_offset_check" CHECK ("class_slots"."week_offset" >= 0 and "class_slots"."week_offset" < "class_slots"."week_interval");--> statement-breakpoint
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_kind_check" CHECK ("semesters"."kind" in ('semester', 'quadrimester'));
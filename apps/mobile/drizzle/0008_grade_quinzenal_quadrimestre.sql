ALTER TABLE `class_slots` ADD `week_interval` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `class_slots` ADD `week_offset` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `semesters` ADD `kind` text DEFAULT 'semester' NOT NULL;
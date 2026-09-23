CREATE TABLE `coin_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`amount` integer NOT NULL,
	`source` text NOT NULL,
	`ref_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `completions` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`occurrence_date` text,
	`action` text NOT NULL,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`dirty` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `completions_item_idx` ON `completions` (`item_id`,`occurrence_date`);--> statement-breakpoint
CREATE INDEX `completions_dirty_idx` ON `completions` (`dirty`);--> statement-breakpoint
CREATE TABLE `xp_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`occurrence_date` text,
	`completion_id` text NOT NULL,
	`attribute` text NOT NULL,
	`points` integer NOT NULL,
	`earned_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `xp_entries_attribute_earned_at_idx` ON `xp_entries` (`attribute`,`earned_at`);--> statement-breakpoint
CREATE INDEX `xp_entries_item_idx` ON `xp_entries` (`item_id`,`occurrence_date`);
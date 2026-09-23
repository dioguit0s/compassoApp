CREATE TABLE `item_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`occurrence_date` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`completed_at` integer,
	`start_at` integer,
	`end_at` integer,
	`title_override` text,
	`notes_override` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`dirty` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_occurrences_item_data_idx` ON `item_occurrences` (`item_id`,`occurrence_date`);--> statement-breakpoint
CREATE INDEX `item_occurrences_dirty_idx` ON `item_occurrences` (`dirty`);
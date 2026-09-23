CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`kind` text NOT NULL,
	`effort` integer,
	`effort_locked_at` integer,
	`primary_attribute` text,
	`secondary_attribute` text,
	`due_at` integer,
	`start_at` integer,
	`end_at` integer,
	`all_day` integer DEFAULT false NOT NULL,
	`timezone` text NOT NULL,
	`rrule` text,
	`recurrence_ends_at` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`completed_at` integer,
	`postpone_count` integer DEFAULT 0 NOT NULL,
	`reminder_minutes_before` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`dirty` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `items_dirty_idx` ON `items` (`dirty`);--> statement-breakpoint
CREATE INDEX `items_start_at_idx` ON `items` (`start_at`);--> statement-breakpoint
CREATE INDEX `items_due_at_idx` ON `items` (`due_at`);--> statement-breakpoint
CREATE TABLE `metadados` (
	`chave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL
);

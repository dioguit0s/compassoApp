CREATE TABLE `class_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`slot_id` text NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`room` text,
	`note` text,
	`start_time` text,
	`end_time` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`dirty` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `class_exceptions_slot_id_date_idx` ON `class_exceptions` (`slot_id`,`date`);--> statement-breakpoint
CREATE TABLE `class_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`room` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`dirty` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `class_slots_course_id_idx` ON `class_slots` (`course_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`semester_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`professor` text,
	`color` text NOT NULL,
	`default_room` text,
	`notes` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`dirty` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `courses_semester_id_idx` ON `courses` (`semester_id`);--> statement-breakpoint
CREATE TABLE `semesters` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`dirty` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE `items` ADD `course_id` text;
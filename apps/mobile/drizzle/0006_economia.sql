CREATE TABLE `redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`reward_id` text NOT NULL,
	`price_paid` integer NOT NULL,
	`redeemed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `redemptions_reward_idx` ON `redemptions` (`reward_id`,`redeemed_at`);--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`cooldown_days` integer NOT NULL,
	`price_effective_from` text NOT NULL,
	`pending_price` integer,
	`pending_from` text,
	`active` integer DEFAULT true NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`dirty` integer DEFAULT false NOT NULL
);

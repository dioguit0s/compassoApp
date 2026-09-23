ALTER TABLE `perfil` ADD `default_reminder_minutes` integer;--> statement-breakpoint
ALTER TABLE `perfil` ADD `pendente` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `perfil` ADD `avatar_local` text;
CREATE TABLE `perfil` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`avatar_kind` text NOT NULL,
	`avatar_path` text,
	`accent_color` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`buscado_em` integer NOT NULL
);

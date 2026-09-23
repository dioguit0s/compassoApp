CREATE TABLE "api_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"avatar_kind" text DEFAULT 'initials' NOT NULL,
	"avatar_path" text,
	"accent_color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_avatar_kind_check" CHECK ("users"."avatar_kind" in ('initials', 'uploaded')),
	CONSTRAINT "users_avatar_path_check" CHECK (("users"."avatar_kind" = 'uploaded') = ("users"."avatar_path" is not null))
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_tokens_user_id_idx" ON "api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "api_tokens_dono" ON "api_tokens" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("api_tokens"."user_id" = app_user_id()) WITH CHECK ("api_tokens"."user_id" = app_user_id());--> statement-breakpoint
CREATE POLICY "users_dono" ON "users" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("users"."id" = app_user_id()) WITH CHECK ("users"."id" = app_user_id());
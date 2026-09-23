CREATE TABLE "coin_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"source" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "coin_entries_source_check" CHECK ("coin_entries"."source" in ('task', 'redemption')),
	CONSTRAINT "coin_entries_amount_check" CHECK ("coin_entries"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "coin_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "completions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"occurrence_date" date,
	"action" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"efeito" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "completions_action_check" CHECK ("completions"."action" in ('complete', 'uncomplete'))
);
--> statement-breakpoint
ALTER TABLE "completions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "xp_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"occurrence_date" date,
	"completion_id" uuid NOT NULL,
	"attribute" text NOT NULL,
	"points" integer NOT NULL,
	"earned_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "xp_entries_attribute_check" CHECK ("xp_entries"."attribute" in ('corpo', 'mente', 'oficio', 'casa', 'social')),
	CONSTRAINT "xp_entries_points_check" CHECK ("xp_entries"."points" <> 0)
);
--> statement-breakpoint
ALTER TABLE "xp_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coin_entries" ADD CONSTRAINT "coin_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completions" ADD CONSTRAINT "completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_entries" ADD CONSTRAINT "xp_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_entries" ADD CONSTRAINT "xp_entries_completion_id_completions_id_fk" FOREIGN KEY ("completion_id") REFERENCES "public"."completions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coin_entries_user_id_server_updated_at_idx" ON "coin_entries" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "coin_entries_ref_idx" ON "coin_entries" USING btree ("user_id","ref_id");--> statement-breakpoint
CREATE INDEX "completions_user_id_server_updated_at_idx" ON "completions" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "completions_alvo_idx" ON "completions" USING btree ("user_id","item_id","occurrence_date");--> statement-breakpoint
CREATE INDEX "xp_entries_user_id_attribute_earned_at_idx" ON "xp_entries" USING btree ("user_id","attribute","earned_at");--> statement-breakpoint
CREATE INDEX "xp_entries_alvo_idx" ON "xp_entries" USING btree ("user_id","item_id","occurrence_date");--> statement-breakpoint
CREATE INDEX "xp_entries_user_id_server_updated_at_idx" ON "xp_entries" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE POLICY "coin_entries_dono" ON "coin_entries" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("coin_entries"."user_id" = app_user_id()) WITH CHECK ("coin_entries"."user_id" = app_user_id());--> statement-breakpoint
CREATE POLICY "completions_dono" ON "completions" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("completions"."user_id" = app_user_id()) WITH CHECK ("completions"."user_id" = app_user_id());--> statement-breakpoint
CREATE POLICY "xp_entries_dono" ON "xp_entries" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("xp_entries"."user_id" = app_user_id()) WITH CHECK ("xp_entries"."user_id" = app_user_id());
CREATE TABLE "redemptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"reward_id" uuid NOT NULL,
	"reward_name" text NOT NULL,
	"price_paid" integer NOT NULL,
	"redeemed_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "redemptions_price_paid_check" CHECK ("redemptions"."price_paid" > 0)
);
--> statement-breakpoint
ALTER TABLE "redemptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"cooldown_days" integer DEFAULT 0 NOT NULL,
	"price_effective_from" date NOT NULL,
	"pending_price" integer,
	"pending_from" date,
	"active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "rewards_price_check" CHECK ("rewards"."price" > 0),
	CONSTRAINT "rewards_pending_price_check" CHECK ("rewards"."pending_price" is null or "rewards"."pending_price" > 0),
	CONSTRAINT "rewards_pendente_check" CHECK (("rewards"."pending_price" is null) = ("rewards"."pending_from" is null)),
	CONSTRAINT "rewards_cooldown_check" CHECK ("rewards"."cooldown_days" >= 0),
	CONSTRAINT "rewards_name_check" CHECK (length("rewards"."name") > 0)
);
--> statement-breakpoint
ALTER TABLE "rewards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "redemptions_user_id_reward_idx" ON "redemptions" USING btree ("user_id","reward_id","redeemed_at");--> statement-breakpoint
CREATE INDEX "redemptions_user_id_server_updated_at_idx" ON "redemptions" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rewards_user_id_id_idx" ON "rewards" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "rewards_user_id_server_updated_at_idx" ON "rewards" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE POLICY "redemptions_dono" ON "redemptions" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("redemptions"."user_id" = app_user_id()) WITH CHECK ("redemptions"."user_id" = app_user_id());--> statement-breakpoint
CREATE POLICY "rewards_dono" ON "rewards" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("rewards"."user_id" = app_user_id()) WITH CHECK ("rewards"."user_id" = app_user_id());
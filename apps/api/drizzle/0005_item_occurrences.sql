CREATE UNIQUE INDEX "items_user_id_id_idx" ON "items" USING btree ("user_id","id");--> statement-breakpoint
CREATE TABLE "item_occurrences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"title_override" text,
	"notes_override" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "item_occurrences_type_check" CHECK ("item_occurrences"."type" in ('completed', 'cancelled', 'moved', 'edited')),
	CONSTRAINT "item_occurrences_status_check" CHECK ("item_occurrences"."status" in ('open', 'done')),
	CONSTRAINT "item_occurrences_conclusao_check" CHECK (("item_occurrences"."status" = 'done') = ("item_occurrences"."completed_at" is not null)),
	CONSTRAINT "item_occurrences_intervalo_check" CHECK ("item_occurrences"."end_at" is null or ("item_occurrences"."start_at" is not null and "item_occurrences"."end_at" >= "item_occurrences"."start_at"))
);
--> statement-breakpoint
ALTER TABLE "item_occurrences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "item_occurrences" ADD CONSTRAINT "item_occurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_occurrences" ADD CONSTRAINT "item_occurrences_item_fk" FOREIGN KEY ("user_id","item_id") REFERENCES "public"."items"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_occurrences_item_data_idx" ON "item_occurrences" USING btree ("item_id","occurrence_date");--> statement-breakpoint
CREATE INDEX "item_occurrences_user_id_server_updated_at_idx" ON "item_occurrences" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "item_occurrences_deleted_at_idx" ON "item_occurrences" USING btree ("deleted_at");--> statement-breakpoint
CREATE POLICY "item_occurrences_dono" ON "item_occurrences" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("item_occurrences"."user_id" = app_user_id()) WITH CHECK ("item_occurrences"."user_id" = app_user_id());
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"kind" text NOT NULL,
	"effort" smallint,
	"effort_locked_at" timestamp with time zone,
	"primary_attribute" text,
	"secondary_attribute" text,
	"due_at" timestamp with time zone,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"timezone" text NOT NULL,
	"rrule" text,
	"recurrence_ends_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"postpone_count" integer DEFAULT 0 NOT NULL,
	"reminder_minutes_before" integer,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "items_kind_check" CHECK ("items"."kind" in ('task', 'event')),
	CONSTRAINT "items_status_check" CHECK ("items"."status" in ('open', 'done')),
	CONSTRAINT "items_effort_check" CHECK ("items"."effort" in (1, 2, 3, 5, 8)),
	CONSTRAINT "items_primary_attribute_check" CHECK ("items"."primary_attribute" in ('corpo', 'mente', 'oficio', 'casa', 'social')),
	CONSTRAINT "items_secondary_attribute_check" CHECK ("items"."secondary_attribute" in ('corpo', 'mente', 'oficio', 'casa', 'social')),
	CONSTRAINT "items_task_campos_check" CHECK ("items"."kind" <> 'task' or ("items"."start_at" is null and "items"."end_at" is null and "items"."effort" is not null)),
	CONSTRAINT "items_event_campos_check" CHECK ("items"."kind" <> 'event' or ("items"."due_at" is null and "items"."start_at" is not null)),
	CONSTRAINT "items_intervalo_check" CHECK ("items"."end_at" is null or "items"."end_at" >= "items"."start_at"),
	CONSTRAINT "items_pontua_check" CHECK (("items"."effort" is null) = ("items"."primary_attribute" is null)),
	CONSTRAINT "items_secundario_check" CHECK ("items"."secondary_attribute" is null or ("items"."primary_attribute" is not null and "items"."secondary_attribute" <> "items"."primary_attribute")),
	CONSTRAINT "items_timezone_check" CHECK (length("items"."timezone") > 0),
	CONSTRAINT "items_postpone_count_check" CHECK ("items"."postpone_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_user_id_server_updated_at_idx" ON "items" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "items_user_id_start_at_idx" ON "items" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE INDEX "items_user_id_due_at_idx" ON "items" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "items_deleted_at_idx" ON "items" USING btree ("deleted_at");--> statement-breakpoint
CREATE POLICY "items_dono" ON "items" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("items"."user_id" = app_user_id()) WITH CHECK ("items"."user_id" = app_user_id());
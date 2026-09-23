CREATE TABLE "class_exceptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"room" text,
	"note" text,
	"start_time" text,
	"end_time" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "class_exceptions_type_check" CHECK ("class_exceptions"."type" in ('cancelled', 'room_change', 'extra')),
	CONSTRAINT "class_exceptions_sala_check" CHECK ("class_exceptions"."type" <> 'room_change' or length(coalesce("class_exceptions"."room", '')) > 0),
	CONSTRAINT "class_exceptions_horario_check" CHECK (("class_exceptions"."start_time" is null and "class_exceptions"."end_time" is null) or ("class_exceptions"."type" = 'extra' and "class_exceptions"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "class_exceptions"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "class_exceptions"."end_time" > "class_exceptions"."start_time"))
);
--> statement-breakpoint
ALTER TABLE "class_exceptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "class_slots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"room" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "class_slots_weekday_check" CHECK ("class_slots"."weekday" between 0 and 6),
	CONSTRAINT "class_slots_start_time_check" CHECK ("class_slots"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "class_slots_end_time_check" CHECK ("class_slots"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "class_slots_intervalo_check" CHECK ("class_slots"."end_time" > "class_slots"."start_time")
);
--> statement-breakpoint
ALTER TABLE "class_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"semester_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"professor" text,
	"color" text NOT NULL,
	"default_room" text,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "courses_color_check" CHECK ("courses"."color" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "courses_name_check" CHECK (length("courses"."name") > 0)
);
--> statement-breakpoint
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "semesters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "semesters_intervalo_check" CHECK ("semesters"."end_date" >= "semesters"."start_date"),
	CONSTRAINT "semesters_label_check" CHECK (length("semesters"."label") > 0)
);
--> statement-breakpoint
ALTER TABLE "semesters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "course_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "class_slots_user_id_id_idx" ON "class_slots" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_user_id_id_idx" ON "courses" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "semesters_user_id_id_idx" ON "semesters" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "class_exceptions" ADD CONSTRAINT "class_exceptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_exceptions" ADD CONSTRAINT "class_exceptions_slot_fk" FOREIGN KEY ("user_id","slot_id") REFERENCES "public"."class_slots"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_slots" ADD CONSTRAINT "class_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_slots" ADD CONSTRAINT "class_slots_course_fk" FOREIGN KEY ("user_id","course_id") REFERENCES "public"."courses"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_semester_fk" FOREIGN KEY ("user_id","semester_id") REFERENCES "public"."semesters"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_exceptions_user_id_server_updated_at_idx" ON "class_exceptions" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "class_exceptions_slot_id_date_idx" ON "class_exceptions" USING btree ("slot_id","date");--> statement-breakpoint
CREATE INDEX "class_slots_user_id_server_updated_at_idx" ON "class_slots" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "courses_user_id_server_updated_at_idx" ON "courses" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "semesters_user_id_server_updated_at_idx" ON "semesters" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "items_user_id_course_id_idx" ON "items" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE POLICY "class_exceptions_dono" ON "class_exceptions" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("class_exceptions"."user_id" = app_user_id()) WITH CHECK ("class_exceptions"."user_id" = app_user_id());--> statement-breakpoint
CREATE POLICY "class_slots_dono" ON "class_slots" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("class_slots"."user_id" = app_user_id()) WITH CHECK ("class_slots"."user_id" = app_user_id());--> statement-breakpoint
CREATE POLICY "courses_dono" ON "courses" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("courses"."user_id" = app_user_id()) WITH CHECK ("courses"."user_id" = app_user_id());--> statement-breakpoint
CREATE POLICY "semesters_dono" ON "semesters" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("semesters"."user_id" = app_user_id()) WITH CHECK ("semesters"."user_id" = app_user_id());
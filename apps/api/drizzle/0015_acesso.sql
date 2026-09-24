CREATE TABLE "credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credentials_email_check" CHECK ("credentials"."email" = lower(btrim("credentials"."email")))
);
--> statement-breakpoint
ALTER TABLE "credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invites" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" uuid,
	CONSTRAINT "invites_used_check" CHECK (("invites"."used_at" is null) = ("invites"."used_by" is null))
);
--> statement-breakpoint
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_email_idx" ON "credentials" USING btree ("email");--> statement-breakpoint
CREATE POLICY "credentials_dono" ON "credentials" AS PERMISSIVE FOR ALL TO "compasso_app" USING ("credentials"."user_id" = app_user_id()) WITH CHECK ("credentials"."user_id" = app_user_id());--> statement-breakpoint
CREATE POLICY "invites_nenhum" ON "invites" AS PERMISSIVE FOR ALL TO "compasso_app" USING (false) WITH CHECK (false);
ALTER TABLE "api_tokens" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "kind" text DEFAULT 'session' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "scopes" text[];--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_id_idx" ON "api_tokens" USING btree ("id");--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_kind_check" CHECK ("api_tokens"."kind" in ('session', 'service'));--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_scopes_check" CHECK (("api_tokens"."kind" = 'service') = ("api_tokens"."scopes" is not null) and ("api_tokens"."scopes" is null or "api_tokens"."scopes" <@ array['agenda:read', 'agenda:write']::text[]));
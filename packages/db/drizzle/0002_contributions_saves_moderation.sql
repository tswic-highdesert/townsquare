CREATE TABLE IF NOT EXISTS "contribution_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"allowed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contribution_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"town_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"content" jsonb NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"town_id" text NOT NULL,
	"type" text NOT NULL,
	"content" jsonb NOT NULL,
	"content_digest" text NOT NULL,
	"attribution" jsonb NOT NULL,
	"contributor_id" uuid,
	"status" text NOT NULL,
	"route" text DEFAULT 'none' NOT NULL,
	"counts_toward_pause" boolean DEFAULT true NOT NULL,
	"record_id" uuid,
	"record_version" integer,
	"scheduled_for" timestamp with time zone,
	"decided_by" uuid,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"town_id" text NOT NULL,
	"creation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"note" text,
	"from_version_id" uuid,
	"to_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"town_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"url" text,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creation_versions" ADD COLUMN "reverted_from_version_id" uuid;--> statement-breakpoint
ALTER TABLE "record_versions" ADD COLUMN "author_org_id" uuid;--> statement-breakpoint
ALTER TABLE "record_versions" ADD COLUMN "author_source_label" text;--> statement-breakpoint
ALTER TABLE "record_versions" ADD COLUMN "contribution_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "target_version" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "resolution_note" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contribution_attempts_user_idx" ON "contribution_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contribution_drafts_user_idx" ON "contribution_drafts" USING btree ("town_id","user_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contribution_drafts_stale_idx" ON "contribution_drafts" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contributions_queue_idx" ON "contributions" USING btree ("town_id","status","route","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contributions_contributor_idx" ON "contributions" USING btree ("contributor_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contributions_scheduled_idx" ON "contributions" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contributions_open_correction_uq" ON "contributions" USING btree ("contributor_id","town_id",(content->>'targetRef'),(content->>'field')) WHERE type = 'correction' and decided_at is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_actions_creation_idx" ON "moderation_actions" USING btree ("creation_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_actions_town_idx" ON "moderation_actions" USING btree ("town_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saves_user_target_uq" ON "saves" USING btree ("town_id","user_id","kind","ref_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saves_user_idx" ON "saves" USING btree ("town_id","user_id","saved_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reports_open_dup_uq" ON "reports" USING btree ("reporter_id","target_type","target_id") WHERE resolved_at is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_reporter_idx" ON "reports" USING btree ("reporter_id","created_at");
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creation_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_items" (
	"town_id" text NOT NULL,
	"tsp_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"republish_rule" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"community" text NOT NULL,
	"geo" jsonb,
	"canonical_url" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"location" text,
	"is_all_day" boolean,
	"recurrence" text,
	"cost" text,
	"severity" text,
	"expires_at" timestamp with time zone,
	"is_active" boolean,
	"category" text,
	"address" text,
	"phone" text,
	"website" text,
	"hours" text,
	"author" text,
	"published_at" timestamp with time zone,
	"image_url" text,
	"raw" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_items_town_id_tsp_id_pk" PRIMARY KEY("town_id","tsp_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creation_blobs" (
	"sha256" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creation_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"town_id" text NOT NULL,
	"status" text DEFAULT 'staged' NOT NULL,
	"manifest" jsonb,
	"inventory" jsonb,
	"validation_report" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creation_files" (
	"version_id" uuid NOT NULL,
	"path" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	CONSTRAINT "creation_files_version_id_path_pk" PRIMARY KEY("version_id","path")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creation_storage" (
	"creation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creation_storage_creation_id_user_id_key_pk" PRIMARY KEY("creation_id","user_id","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creation_id" uuid NOT NULL,
	"version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"csp_header" text NOT NULL,
	"bundle_sha256" text NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"validation_report" jsonb,
	"submitted_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"town_id" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"origin_key" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kind" text DEFAULT 'embedded' NOT NULL,
	"url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"active_version_id" uuid,
	"source_visibility" text DEFAULT 'public' NOT NULL,
	"forked_from_id" uuid,
	"last_seen_ok" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'pat' NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "record_types" (
	"town_id" text NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"schema" jsonb NOT NULL,
	"defined_by_creation_id" uuid,
	"defined_by_version_id" uuid,
	"write_open" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "record_types_town_id_type_pk" PRIMARY KEY("town_id","type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "record_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"author_user_id" uuid,
	"author_creation_id" uuid,
	"reverted_from" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"town_id" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"town_id" text NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_health" (
	"town_id" text NOT NULL,
	"source" text NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "source_health_town_id_source_pk" PRIMARY KEY("town_id","source")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "towns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"center_lat" double precision,
	"center_lng" double precision,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"email" text NOT NULL,
	"email_confirmed" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"verified_resident" boolean DEFAULT false NOT NULL,
	"verified_method" text,
	"verified_at" timestamp with time zone,
	"vouch_budget_override" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vouches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voucher_id" uuid NOT NULL,
	"vouchee_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_hash_uq" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_items_town_type_idx" ON "content_items" USING btree ("town_id","type","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_items_town_starts_idx" ON "content_items" USING btree ("town_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_items_town_seen_idx" ON "content_items" USING btree ("town_id","last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creation_bundles_user_idx" ON "creation_bundles" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creation_versions_uq" ON "creation_versions" USING btree ("creation_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creation_versions_status_idx" ON "creation_versions" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creations_origin_key_uq" ON "creations" USING btree ("origin_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creations_town_slug_uq" ON "creations" USING btree ("town_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creations_town_status_idx" ON "creations" USING btree ("town_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creations_owner_idx" ON "creations" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_tokens_hash_uq" ON "mcp_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_tokens_user_idx" ON "mcp_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "record_versions_uq" ON "record_versions" USING btree ("record_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "record_versions_author_idx" ON "record_versions" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "record_versions_creation_idx" ON "record_versions" USING btree ("author_creation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "records_town_type_idx" ON "records" USING btree ("town_id","type","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "records_town_type_updated_idx" ON "records" USING btree ("town_id","type","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_open_idx" ON "reports" USING btree ("town_id","resolved_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_handle_lower_uq" ON "users" USING btree (lower("handle"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vouches_pair_uq" ON "vouches" USING btree ("voucher_id","vouchee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouches_voucher_idx" ON "vouches" USING btree ("voucher_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vouches_vouchee_idx" ON "vouches" USING btree ("vouchee_id");
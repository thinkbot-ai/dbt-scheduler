CREATE TYPE "public"."project_source_mode" AS ENUM('git', 'local_directory');--> statement-breakpoint
ALTER TYPE "public"."job_trigger_type" ADD VALUE 'GIT_CHANGE';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source_mode" "project_source_mode" DEFAULT 'git' NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "poll_for_changes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "last_seen_commit_sha" text;
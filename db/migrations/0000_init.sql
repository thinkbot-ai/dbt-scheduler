CREATE TYPE "public"."concurrency_policy" AS ENUM('SKIP_IF_RUNNING', 'QUEUE', 'ALLOW');--> statement-breakpoint
CREATE TYPE "public"."dbt_command" AS ENUM('debug', 'deps', 'compile', 'run', 'test', 'build');--> statement-breakpoint
CREATE TYPE "public"."failure_class" AS ENUM('TRANSIENT_FAILURE', 'CONFIGURATION_FAILURE', 'DBT_FAILURE', 'WORKER_FAILURE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED', 'RETRY_WAIT', 'STALE', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."job_trigger_type" AS ENUM('SCHEDULED', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."log_stream" AS ENUM('stdout', 'stderr', 'system');--> statement-breakpoint
CREATE TYPE "public"."worker_status" AS ENUM('STARTING', 'IDLE', 'RUNNING', 'DRAINING', 'STOPPED', 'DEAD');--> statement-breakpoint
CREATE TABLE "job_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_run_id" uuid NOT NULL,
	"depends_on_job_run_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_run_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"stream" "log_stream" NOT NULL,
	"message" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"external_uri" text
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"priority" integer NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"worker_id" uuid,
	"commit_sha" text,
	"repository_url" text,
	"branch" text,
	"dbt_command" "dbt_command" NOT NULL,
	"dbt_arguments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exit_code" integer,
	"error_message" text,
	"failure_class" "failure_class",
	"duration_ms" integer,
	"cancel_requested_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"trigger_type" "job_trigger_type" DEFAULT 'SCHEDULED' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"idempotency_key" text,
	"metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"repository_url" text NOT NULL,
	"branch" text DEFAULT 'main' NOT NULL,
	"project_path" text DEFAULT '.' NOT NULL,
	"environment" text DEFAULT 'prod' NOT NULL,
	"dbt_version" text,
	"dbt_adapter_version" text,
	"credentials_reference" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"max_concurrent_jobs" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_execution_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"job_run_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cron_expression" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"dbt_command" "dbt_command" DEFAULT 'build' NOT NULL,
	"dbt_arguments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"run_dbt_deps" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"concurrency_policy" "concurrency_policy" DEFAULT 'SKIP_IF_RUNNING' NOT NULL,
	"max_retries" integer DEFAULT 0 NOT NULL,
	"retry_delay_seconds" integer DEFAULT 60 NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_name" text NOT NULL,
	"hostname" text NOT NULL,
	"status" "worker_status" DEFAULT 'STARTING' NOT NULL,
	"current_job_id" uuid,
	"concurrency" integer DEFAULT 2 NOT NULL,
	"last_heartbeat" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workers_worker_name_unique" UNIQUE("worker_name")
);
--> statement-breakpoint
ALTER TABLE "job_dependencies" ADD CONSTRAINT "job_dependencies_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_dependencies" ADD CONSTRAINT "job_dependencies_depends_on_job_run_id_job_runs_id_fk" FOREIGN KEY ("depends_on_job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_execution_keys" ADD CONSTRAINT "schedule_execution_keys_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_execution_keys" ADD CONSTRAINT "schedule_execution_keys_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_dependencies_job_run_depends_on_uidx" ON "job_dependencies" USING btree ("job_run_id","depends_on_job_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_logs_job_run_id_sequence_uidx" ON "job_logs" USING btree ("job_run_id","sequence_number");--> statement-breakpoint
CREATE INDEX "job_runs_status_priority_queued_at_idx" ON "job_runs" USING btree ("status","priority","queued_at");--> statement-breakpoint
CREATE INDEX "job_runs_schedule_id_status_idx" ON "job_runs" USING btree ("schedule_id","status");--> statement-breakpoint
CREATE INDEX "job_runs_project_id_status_idx" ON "job_runs" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_schedule_id_idempotency_key_uidx" ON "job_runs" USING btree ("schedule_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_name_uidx" ON "projects" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_execution_keys_schedule_id_scheduled_for_uidx" ON "schedule_execution_keys" USING btree ("schedule_id","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_project_id_name_uidx" ON "schedules" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "schedules_enabled_next_run_at_idx" ON "schedules" USING btree ("enabled","next_run_at");
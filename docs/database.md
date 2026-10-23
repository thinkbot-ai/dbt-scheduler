# Database

PostgreSQL is the persistent source of truth and the V1 queue.

## Schema

| Table                     | Purpose                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `projects`                | GitHub-hosted dbt projects. Secrets are stored as `credentials_reference` pointers, never plaintext tokens.                                      |
| `schedules`               | Cron, timezone, dbt command/args, priority, retries, concurrency policy, `next_run_at`.                                                          |
| `job_runs`                | Queue rows and execution history, including commit SHA, lease, cancellation, and metrics.                                                        |
| `job_logs`                | Bounded stdout/stderr/system lines. Oversize lines are truncated; row count is capped so logs can later move to object storage (`external_uri`). |
| `workers`                 | Worker registration and heartbeats.                                                                                                              |
| `job_dependencies`        | Scheduler-level DAG edges (not dbt `ref()`).                                                                                                     |
| `schedule_execution_keys` | Unique `(schedule_id, scheduled_for)` so multiple scheduler replicas cannot create the same run.                                                 |

Timestamps are `timestamptz`. Schedules keep a user timezone column; comparisons use UTC instants.

## Commands

```bash
npm run db:generate   # after schema changes
npm run db:migrate    # requires DATABASE_URL
npm run db:seed       # example project, no real credentials
```

Migrations live in `db/migrations/` and are applied with Drizzle. Unit tests apply the same folder against PGlite, so `npm test` does not need a running PostgreSQL process.

## Repositories

All SQL goes through `packages/database` repositories. Controllers must not embed SQL. Multi-step changes use `withTransaction()`.

## Job queue

`JobQueue` in `@dbt-scheduler/job-queue` is the only way workers take work:

1. Take a transaction advisory lock so `RUNNING` counts are consistent
2. Select the next `QUEUED` row (`priority ASC, queued_at ASC`) with `FOR UPDATE SKIP LOCKED`
3. Skip the row when the global cap, project `max_concurrent_jobs`, or schedule policy (`SKIP_IF_RUNNING` / `QUEUE`) would be violated; try the next queued row
4. Mark `RUNNING`, assign `worker_id`, set `lease_expires_at`
5. Commit

Completion is a transaction: `RUNNING` → `SUCCESS` or `FAILED`. Expired leases become `STALE`, not success or failed.

Schedule `SKIP_IF_RUNNING` skips enqueue when a `QUEUED` or `RUNNING` job already exists for that schedule. `QUEUE` and `ALLOW` still insert.

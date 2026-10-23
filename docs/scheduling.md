# Scheduling

The scheduler process is responsible only for **when**.

Loop:

1. Find enabled schedules with `next_run_at <= now()` (and initialize `next_run_at` when it is null)
2. Lock the schedule row (`FOR UPDATE`) so replicas do not double-create
3. Insert a `job_runs` row through `JobQueue` (`trigger_type=SCHEDULED`) unless `SKIP_IF_RUNNING` applies
4. Write `schedule_execution_keys(schedule_id, scheduled_for)`
5. Set `next_run_at` to the next cron occurrence **after now** in the schedule timezone (missed slots are not all enqueued)

Duplicate protection: unique `(schedule_id, scheduled_for)` plus `job_runs.idempotency_key`. Multiple scheduler replicas must not create the same execution twice.

Presets:

| Label            | Cron           |
| ---------------- | -------------- |
| Every 5 minutes  | `*/5 * * * *`  |
| Every 15 minutes | `*/15 * * * *` |
| Every 30 minutes | `*/30 * * * *` |
| Every hour       | `0 * * * *`    |
| Every 6 hours    | `0 */6 * * *`  |
| Daily            | `0 0 * * *`    |
| Weekly           | `0 0 * * 0`    |
| Custom           | user cron      |

Default command: `dbt build`. Default concurrency policy: `SKIP_IF_RUNNING`.
Enqueue goes through `JobQueue.enqueue()`, which skips a new `QUEUED` row when that
policy is set and a `QUEUED` or `RUNNING` job already exists for the schedule.
At claim time, `QUEUE` and `SKIP_IF_RUNNING` also refuse a second `RUNNING` job for
the same schedule; `ALLOW` can run two at once. A CRITICAL job is claimed before
older NORMAL work. It does not preempt a job that is already running.

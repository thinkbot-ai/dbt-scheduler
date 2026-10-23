# Workers

Workers are stateless except for in-process execution state. PostgreSQL remains the source of truth.

Startup:

```text
START → REGISTER → HEARTBEAT → CLAIM JOB → EXECUTE → UPDATE RESULT → CLAIM NEXT
```

Workers claim through `JobQueue` (`@dbt-scheduler/job-queue`), which selects the next
`QUEUED` row with `FOR UPDATE SKIP LOCKED`, marks it `RUNNING`, and sets a lease.

The worker process then:

1. Registers (`STARTING` → `IDLE`) and heartbeats on `HEARTBEAT_INTERVAL_SECONDS`
2. Claims up to `WORKER_CONCURRENCY` jobs, stopping when `MAX_CONCURRENT_JOBS` are `RUNNING`
3. Leaves a queued job queued when the project cap is full or the schedule is already `RUNNING` (unless `ALLOW`)
4. Prepares `/workspaces/job-<id>` and records `commit_sha`
5. Optionally runs `dbt deps`, then the scheduled command
6. Streams stdout/stderr into `job_logs` and completes `SUCCESS` / `FAILED` / `CANCELLED`
7. Moves retryable failures (`TRANSIENT_FAILURE`, `WORKER_FAILURE`) to `RETRY_WAIT` when attempts remain

Graceful shutdown sets `DRAINING`, stops claiming, cancels in-flight dbt processes, then `STOPPED`.

`WORKER_CONCURRENCY=2` means at most two dbt processes in that worker. `MAX_CONCURRENT_JOBS` is the global cap across all workers. Each project also has `max_concurrent_jobs` (default 5). Claim evaluates those limits inside the queue transaction; a higher-priority job from another project can start while a full project waits. Running jobs are not cancelled to make room.

Each job uses an isolated workspace under `WORKSPACE_ROOT` (for example
`/workspaces/job-<id>`). `prepareJobRepository()` deletes any previous directory
for that job, clones the configured branch, hard-resets to `origin/<branch>`,
and records `HEAD`. Private GitHub HTTPS clones send `GIT_TOKEN` as a one-shot
`http.extraHeader` so the token is not stored in `.git/config`. Workspaces older
than `WORKSPACE_RETENTION_HOURS` are removed by `cleanupExpiredWorkspaces()`.

Cancellation targets the dbt child process, not the worker process.

Stale jobs: if the lease heartbeat expires, the job becomes `STALE` and is recovered by policy.

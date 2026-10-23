# Architecture

DBT Scheduler is an orchestrator around **dbt-core** and **dbt-dremio**. It does not compile SQL, interpret Jinja, or talk to Dremio as a transformation engine.

```text
                         ┌──────────────────────┐
                         │      React UI        │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │    Node.js API       │
                         │      Fastify         │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │     PostgreSQL       │
                         │  source of truth +   │
                         │  durable job queue   │
                         └──────────┬───────────┘
                                    │
                  ┌─────────────────┼─────────────────┐
                  ▼                 ▼                 ▼
           ┌────────────┐    ┌────────────┐    ┌────────────┐
           │  Worker 1  │    │  Worker 2  │    │  Worker 3  │
           └─────┬──────┘    └─────┬──────┘    └─────┬──────┘
                 └─────────────────┼─────────────────┘
                                   ▼
                                 dbt CLI
                                   ▼
                               dbt-core
                                   ▼
                              dbt-dremio
                                   ▼
                                Dremio
```

## Responsibility split

```text
WHEN?                WHAT?                 WHO?              HOW?
Scheduler     →      PostgreSQL queue  →   Workers     →     dbt CLI
```

- **Scheduler** evaluates due schedules and inserts `job_runs`. It never runs dbt.
- **PostgreSQL** stores projects, schedules, jobs, logs, workers, and queue state.
- **Workers** claim jobs with `SELECT ... FOR UPDATE SKIP LOCKED`, prepare an isolated Git workspace, and spawn dbt.
- **dbt-core + dbt-dremio** perform the transformation against Dremio.

The API is a stateless control plane. Manual "Run now" creates a `QUEUED` job. The API does not spawn dbt.

## Processes

| Process   | Entry            | Behavior                                                          |
| --------- | ---------------- | ----------------------------------------------------------------- |
| API       | `apps/api`       | Health, projects, schedules, jobs, workers, system status         |
| Scheduler | `apps/scheduler` | Due schedules → idempotent `job_runs` + `schedule_execution_keys` |
| Worker    | `apps/worker`    | Register, claim, git, dbt, heartbeat, retry, drain on shutdown    |

They share one repository and one Docker image. `PROCESS_ROLE` / the image entrypoint selects the process. Horizontal scale is:

- API replicas > 1 (stateless)
- Worker replicas > 1 (queue-backed)
- Scheduler replicas >= 1 (idempotent via `schedule_id + scheduled_for`)

Do not run 100 in-memory cron timers inside the API process.

## Packages

Business logic lives in packages, not HTTP handlers.

```text
types
  ↑
validation, config, database, scheduler-core, job-queue
  ↑
logging (standalone), dbt-runner, git-manager
  ↑
apps/api, apps/scheduler, apps/worker
```

`apps/web` talks only to the API (see [ui.md](./ui.md)). It never executes dbt.

## Data model (Phase 2)

Intended PostgreSQL tables:

- `projects`
- `schedules`
- `job_runs`
- `job_logs`
- `workers`
- `job_dependencies`
- `schedule_execution_keys` unique on `(schedule_id, scheduled_for)`

Timestamps are stored timezone-aware. Schedules keep a user timezone; internal comparisons use UTC.

## Queue

Workers claim jobs inside a transaction:

1. `pg_advisory_xact_lock` so `RUNNING` counts are consistent
2. Select the next `QUEUED` row (`priority ASC, queued_at ASC`)
3. `FOR UPDATE SKIP LOCKED`
4. Confirm it is still executable (schedule policy, global cap, project `max_concurrent_jobs`)
5. Mark `RUNNING`, assign `worker_id`, set lease
6. Commit

Priority: `1=CRITICAL`, `2=HIGH`, `3=NORMAL`, `4=LOW`. A higher-priority queued job is claimed first. Running work is not preempted.

Schedule concurrency policies: `SKIP_IF_RUNNING` (default), `QUEUE`, `ALLOW`.

## Execution

Each job gets an isolated workspace such as `/workspaces/job-<id>`. Workers must not share a Git working tree. After checkout, the worker records `commit_sha`, optionally runs `dbt deps`, then the configured command through `spawn("dbt", argv)`.

## Failure and recovery

Valid job transitions are encoded in `@dbt-scheduler/job-queue`. Retries use `max_retries` and `retry_delay_seconds`. Workers heartbeat; expired leases become `STALE` and are recovered according to policy rather than blindly marked success or failed.

## Out of scope for V1

Kafka, RabbitMQ, Redis, Kubernetes, Airflow, Temporal, Celery, and a custom SQL/dbt engine. Interfaces are kept so a later queue (for example Redis/BullMQ) can replace the PostgreSQL claim implementation without rewriting dbt or schedule logic.

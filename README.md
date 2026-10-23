# DBT Scheduler

Internal scheduling and orchestration for GitHub-hosted **dbt-core** projects that run against **Dremio** through **dbt-dremio**.

This application does not replace dbt. It decides _when_ work should run, records _what_ needs to run in PostgreSQL, and lets workers execute the **dbt CLI**. Dremio still executes the actual SQL.

```text
GitHub → DBT project → DBT Scheduler → dbt-core CLI → dbt-dremio → Dremio
```

## Current status

**Phase 10 (concurrency and priority) is complete.**

Claim enforces the global cap, per-project `max_concurrent_jobs`, and schedule
policy inside the queue transaction. CRITICAL work is claimed before older
NORMAL work; running jobs are not cancelled. The following is **not**
implemented yet:

- retry/recovery polish (Phase 11)

## Architecture

Three process roles share one codebase and Docker image:

| Role          | Responsibility                                               |
| ------------- | ------------------------------------------------------------ |
| **API**       | Stateless HTTP control plane. Never executes dbt.            |
| **Scheduler** | Creates due `job_runs`. Never executes dbt.                  |
| **Worker**    | Claims queued jobs and runs `dbt` via `child_process.spawn`. |

PostgreSQL is the source of truth and the durable job queue. See [docs/architecture.md](docs/architecture.md), [docs/api.md](docs/api.md), [docs/ui.md](docs/ui.md), the copy-pasteable [docs/quickstart.md](docs/quickstart.md), and the step-by-step [docs/local-testing.md](docs/local-testing.md).

## Prerequisites

- Node.js 22.13+
- npm 10+
- Docker and Docker Compose (for the full stack)

**Step-by-step local setup and feature testing:** [docs/local-testing.md](docs/local-testing.md)

## Local commands

```bash
cp .env.example .env
npm install
npm run lint
npm run typecheck
npm test
```

Run process roles locally (requires `DATABASE_URL` in `.env`):

```bash
npm run dev:api
npm run dev:scheduler
npm run dev:worker
npm run dev:web
```

| Service    | URL                              |
| ---------- | -------------------------------- |
| Web        | http://localhost:3000            |
| API        | http://localhost:4000            |
| API health | http://localhost:4000/api/health |
| PostgreSQL | localhost:5432                   |

## Docker

```bash
cp .env.example .env
docker compose up --build
```

Development bind mounts:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Pinned dbt versions in the runtime image:

- `dbt-core==1.10.23`
- `dbt-dremio==1.10.1`

## Repository layout

```text
apps/api            Fastify HTTP process
apps/scheduler      Schedule tick process
apps/worker         Job execution process
apps/web            React dashboard
packages/config     Environment loading
packages/database   Drizzle schema, repositories, transactions
packages/dbt-runner dbt execution: spawn, log streaming, timeout, cancel, artifacts
packages/git-manager Isolated clone/fetch/checkout, commit SHA, workspace cleanup
packages/job-queue  Claim, complete, retry wait, SKIP LOCKED queue
packages/logging    Pino JSON logging with secret redaction
packages/scheduler-core Cron presets, next_run_at, timezone-aware catch-up
packages/types      Shared enums and error types
packages/validation Zod for dbt argv and HTTP request bodies
```

## Security

- dbt is executed with `spawn(bin, argv)`, never a shell string.
- dbt commands are allowlisted.
- GitHub tokens, API tokens, and database URLs are redacted from logs.
- `.env` is gitignored. Use `.env.example` as the template.

## Next phase

Phase 11: Retry and recovery polish — stale leases, retry wait, and restart safety.

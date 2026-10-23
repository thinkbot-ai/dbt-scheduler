# Configuration

Infrastructure configuration comes from environment variables. `.env` is never committed.

| Variable                          | Default                 | Purpose                                    |
| --------------------------------- | ----------------------- | ------------------------------------------ |
| `NODE_ENV`                        | `development`           | `development`, `test`, or `production`     |
| `PROCESS_ROLE`                    | `api`                   | `api`, `scheduler`, or `worker`            |
| `PORT`                            | `4000`                  | API port                                   |
| `API_BIND_HOST`                   | `0.0.0.0`               | API bind address                           |
| `WEB_ORIGIN`                      | `http://localhost:3000` | CORS origin                                |
| `DATABASE_URL`                    | required                | PostgreSQL connection string               |
| `LOG_LEVEL`                       | `info`                  | Pino level, including `silent`             |
| `MAX_CONCURRENT_JOBS`             | `10`                    | Global running-job cap (claim-time)        |
| `WORKER_CONCURRENCY`              | `2`                     | dbt processes per worker process           |
| `WORKER_ID`                       | `worker-<pid>`          | Worker identity                            |
| `JOB_LEASE_SECONDS`               | `60`                    | Running-job lease                          |
| `HEARTBEAT_INTERVAL_SECONDS`      | `15`                    | Worker heartbeat                           |
| `SCHEDULER_TICK_INTERVAL_SECONDS` | `10`                    | How often the scheduler looks for due work |
| `WORKSPACE_ROOT`                  | `/workspaces`           | Isolated Git/dbt workspaces                |
| `WORKSPACE_RETENTION_HOURS`       | `24`                    | Workspace cleanup (later phase)            |
| `GIT_TOKEN`                       | unset                   | GitHub credentials; never logged           |
| `DBT_BIN`                         | `dbt`                   | dbt executable                             |
| `DBT_PYTHON_BIN`                  | `python3`               | Python executable                          |
| `DBT_CORE_VERSION`                | `1.10.23`               | Pinned image version                       |
| `DBT_DREMIO_VERSION`              | `1.10.1`                | Pinned image version                       |
| `API_AUTH_TOKEN`                  | unset                   | Simple auth boundary (Phase 13)            |

Per-project caps live on `projects.max_concurrent_jobs` (API/UI), not in the environment.

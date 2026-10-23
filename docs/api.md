# API

The API is a stateless HTTP control plane. It never spawns dbt.

## Endpoints

| Method         | Path                         | Purpose                                                  |
| -------------- | ---------------------------- | -------------------------------------------------------- |
| GET            | `/api/health`                | Liveness; does not query PostgreSQL                      |
| GET/POST       | `/api/projects`              | List / create projects                                   |
| GET/PUT/DELETE | `/api/projects/:id`          | Read / update / delete a project                         |
| GET/POST       | `/api/schedules`             | List / create schedules                                  |
| GET/PUT/DELETE | `/api/schedules/:id`         | Read / update / delete a schedule                        |
| POST           | `/api/schedules/:id/run`     | Enqueue a `MANUAL` job                                   |
| POST           | `/api/schedules/:id/enable`  | Enable a schedule                                        |
| POST           | `/api/schedules/:id/disable` | Disable a schedule                                       |
| GET            | `/api/jobs`                  | List jobs (`status`, `scheduleId`, `projectId`, `limit`) |
| GET            | `/api/jobs/:id`              | Job details                                              |
| GET            | `/api/jobs/:id/logs`         | Bounded stdout/stderr/system lines                       |
| POST           | `/api/jobs/:id/cancel`       | Cancel queued work or request cancel of a running job    |
| GET            | `/api/workers`               | Registered workers                                       |
| GET            | `/api/system/status`         | Job and worker counts                                    |

Successful resource responses use `{ "data": ... }`. Errors use `{ "error": { "code", "message", "details?" } }`.

`POST /api/schedules/:id/run` creates a `QUEUED` job. The API does not execute dbt. Optional `idempotencyKey` in the body or `Idempotency-Key` header.

Cancellation of a `QUEUED` job marks it `CANCELLED` immediately. A `RUNNING` job sets `cancel_requested_at`; the worker aborts the dbt child.

When `API_AUTH_TOKEN` is set, every route except `/api/health` requires `Authorization: Bearer <token>`. When it is unset, the API is open (local development). OIDC/SSO is Phase 13.

The React client is documented in [ui.md](./ui.md).

# Local setup and feature testing

This is the step-by-step guide for running DBT Scheduler on a laptop and verifying each feature. It is written for **Windows PowerShell** (Git Bash and macOS/Linux are the same commands with `cp` instead of `Copy-Item`).

The scheduler does **not** replace dbt. It decides **when** a job should run, stores that job in **PostgreSQL**, and lets a **worker** spawn the **dbt CLI**. Dremio still executes SQL through **dbt-dremio**.

```text
You (browser) → Web UI (:3000) → API (:4000) → PostgreSQL
Scheduler → PostgreSQL (creates due jobs)
Worker → PostgreSQL (claims jobs) → git clone → dbt → dbt-dremio → Dremio
```

Related docs: [quickstart.md](./quickstart.md) (just the commands, no explanation), [local-development.md](./local-development.md), [ui.md](./ui.md), [api.md](./api.md), [configuration.md](./configuration.md), [troubleshooting.md](./troubleshooting.md).

---

## 1. What you need

| Tool                                     | Why                                                        |
| ---------------------------------------- | ---------------------------------------------------------- |
| Node.js 22.13+                           | API, scheduler, worker, and Vite UI                        |
| npm 10+                                  | Workspace install (`npm install` at the repo root)         |
| Docker Desktop                           | PostgreSQL, or the full stack including dbt                |
| Git                                      | Workers clone GitHub-hosted dbt projects                   |
| A GitHub dbt repo (optional for UI-only) | Required for a job to reach `SUCCESS`                      |
| `dbt` on PATH (host worker only)         | Docker worker already includes `dbt-core` and `dbt-dremio` |

Confirm Node:

```powershell
node -v   # v22.x
npm -v
```

---

## 2. Choose how you want to test

| Goal                                    | What to run                                         | Postgres                     | dbt                              |
| --------------------------------------- | --------------------------------------------------- | ---------------------------- | -------------------------------- |
| **A. Automated unit/integration tests** | `npm test`                                          | In-memory PGlite (no Docker) | Fake dbt in tests                |
| **B. Click through the UI**             | Postgres in Docker + four `npm run dev:*` processes | Docker                       | Host `dbt` if you want real runs |
| **C. Full stack like production**       | `docker compose up --build`                         | Docker                       | dbt inside the worker image      |

Start with **A**, then **B**. Use **C** when you want Git + dbt without installing dbt on Windows.

Pointing a project at a dbt codebase that already lives in a folder on this
machine (instead of cloning from GitHub)? See
[Local folder projects](./dbt-projects.md#local-folder-projects) — it needs Path
**B** (host processes), not Docker, since the Dockerized worker can't see local
paths.

---

## 3. One-time repo setup

From the repository root (for example, `C:\Users\<you>\dbt-scheduler`):

```powershell
Copy-Item .env.example .env
npm install
```

`.env` is gitignored. Never commit tokens. Template: `.env.example`. Meanings: [configuration.md](./configuration.md).

### 3.1 Edit `.env` for local host processes

Keep these defaults unless you know you need otherwise:

```text
DATABASE_URL=postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler
PORT=4000
WEB_ORIGIN=http://localhost:3000
API_AUTH_TOKEN=
GIT_TOKEN=
MAX_CONCURRENT_JOBS=10
WORKER_CONCURRENCY=2
```

On **Windows**, change the workspace root so Git/dbt can write files:

```text
WORKSPACE_ROOT=C:/tmp/dbt-scheduler-workspaces
```

Create that folder if it does not exist:

```powershell
New-Item -ItemType Directory -Force -Path C:\tmp\dbt-scheduler-workspaces
```

If the dbt GitHub repo is **private**, set `GIT_TOKEN` to a PAT with repo read access. The worker sends it as a one-shot Git header; it is never shown in the UI or in logs.

Leave `API_AUTH_TOKEN` empty for local testing so the API is open. If you set a token later, paste the same value on **Settings** in the UI.

---

## 4. Path A — automated tests (no running app)

These tests do not start the UI and do not need PostgreSQL.

```powershell
npm run lint
npm run typecheck
npm test
```

Watch mode:

```powershell
npm run test:watch
```

**What passing means:** packages (queue, dbt-runner, git-manager, scheduler, API, worker, web helpers) behave as designed. This is the fastest regression check after a code change.

---

## 5. Path B — live UI on the host (recommended for feature testing)

You will run **Postgres in Docker**, then **four Node processes** on the host.

### Step B1. Start PostgreSQL

```powershell
docker compose up postgres -d
```

Wait until healthy (a few seconds). Port **5432** must be free.

### Step B2. Create tables and optional sample data

```powershell
npm run db:migrate
npm run db:seed
```

- `db:migrate` applies `db/migrations/` to Postgres.
- `db:seed` inserts project `example-analytics` and a **disabled** hourly schedule. The GitHub URL is a placeholder (`https://github.com/example/analytics-dbt.git`). **Replace it** before you expect a worker clone to succeed. Seed is idempotent: it will not duplicate that project name.

### Step B3. Start the four processes (four terminals)

Keep all four running.

**Terminal 1 — API** (never runs dbt):

```powershell
npm run dev:api
```

Expect listen on port 4000. Smoke check:

```powershell
Invoke-RestMethod http://localhost:4000/api/health
```

You should see `"status": "ok"`. Health does **not** need Postgres.

**Terminal 2 — scheduler** (creates due jobs only):

```powershell
npm run dev:scheduler
```

**Terminal 3 — worker** (clones Git, runs dbt):

```powershell
npm run dev:worker
```

Without `dbt` on PATH, jobs can still be **queued** and **claimed**, then **fail** at execute. For UI-only (create project, Run now, cancel queued jobs), that is enough.

**Terminal 4 — web**:

```powershell
npm run dev:web
```

Open **http://localhost:3000**. Vite proxies `/api` to `http://localhost:4000`.

Header **API reachable** (green) means `GET /api/health` succeeded.

### Step B4. If a process will not start

| Symptom                             | What to do                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `Invalid application configuration` | `.env` missing or `DATABASE_URL` empty. See [troubleshooting.md](./troubleshooting.md) |
| API cannot connect to Postgres      | `docker compose up postgres -d`, then `npm run db:migrate`                             |
| Port 4000 / 3000 / 5432 in use      | Stop the other process or change `PORT`                                                |
| UI error banner / “Failed to fetch” | API is not running                                                                     |
| 401 Unauthorized                    | Set the same `API_AUTH_TOKEN` on **Settings**                                          |

---

## 6. Path C — full Docker Compose

Use this when you want the worker image (Git + pinned dbt) without installing dbt on Windows.

```powershell
Copy-Item .env.example .env   # if needed
docker compose up --build
```

| Service  | URL                   |
| -------- | --------------------- |
| Web      | http://localhost:3000 |
| API      | http://localhost:4000 |
| Postgres | localhost:5432        |

The API process does **not** auto-migrate. After Postgres is healthy, from the **host** (with `.env` `DATABASE_URL` pointing at localhost:5432):

```powershell
npm install
npm run db:migrate
npm run db:seed
```

Stop:

```powershell
docker compose down
```

Bind-mounted source (hot reload style):

```powershell
docker compose -f docker-compose.dev.yml up --build
```

Confirm dbt in the worker container:

```powershell
docker compose exec worker dbt --version
```

---

## 7. Feature testing in the UI

Do these in order the first time. Pages poll about every 4 seconds; an open job’s logs poll every 2 seconds while `QUEUED` or `RUNNING`.

### 7.1 Settings and health

1. Open http://localhost:3000 → **Settings**.
2. **API health** should be `ok`.
3. **Max concurrent jobs** should match `MAX_CONCURRENT_JOBS` in `.env` (default 10).
4. Leave **API token** empty unless you set `API_AUTH_TOKEN`.
5. Confirm GitHub tokens are **not** displayed anywhere.

**Pass:** health ok, no secrets on screen.

### 7.2 Dashboard (empty or seeded)

1. Open **Dashboard**.
2. After seed, **Total schedules** is at least 1, **Active schedules** is 0 (seed schedule is disabled).
3. **Workers online** is 1+ if `dev:worker` is running (heartbeat within 90 seconds).
4. If the API is down, a red error banner appears.

**Pass:** cards load; no crash.

### 7.3 Projects

1. Open **Projects**.
2. If you seeded, you see `example-analytics`. Click **Delete** only if you do not need it.
3. **Add project** with a **real** GitHub HTTPS URL you can clone, for example:
   - Name: `my-dbt`
   - Repository URL: `https://github.com/<org>/<repo>.git`
   - Branch: `main` (must exist)
   - Project path: `.` or the subdirectory that contains `dbt_project.yml`
   - Environment: `dev`
   - Max concurrent jobs: `2`
4. Click **Add project**. The row should appear.
5. Change **Max jobs**, click **Save**. Reload the page: the number must persist.

The form never asks for `GIT_TOKEN`. That stays in `.env` / Compose.

**Pass:** project listed; cap updates via PUT `/api/projects/:id`.

### 7.4 Schedules

1. Open **Schedules**.
2. Select the project, name the schedule, pick a cron preset (or Custom), timezone, dbt command (`debug` is the cheapest real CLI check; `build` needs Dremio).
3. Extra args are space-separated, for example `--select my_model`.
4. Priority: NORMAL is typical. Policy:
   - **SKIP_IF_RUNNING** (default): a second Run now is skipped while one job is queued/running
   - **QUEUE**: a second job is created but will not **start** until the first for that schedule finishes
   - **ALLOW**: two runs of the same schedule can run at once (still limited by project and global caps)
5. Click **Add schedule**. **Next run** appears after the scheduler ticks (about 10 seconds) if the schedule is enabled.
6. Click **Disable** / **Enable**. Disabled schedules are not ticked into new `SCHEDULED` jobs. **Run now** still works.

**Pass:** row shows cron, timezone, command, next run (when enabled), enable toggle.

### 7.5 Run now (manual job) — most important path

1. On **Schedules**, click **Run now**.
2. Banner: `Queued job <uuid>` or a skip reason (`SKIP_IF_RUNNING`).
3. Open **Jobs**. A row with trigger **MANUAL** should appear (`QUEUED` then `RUNNING` if a worker is up).
4. Open the job (click the status badge).

| Field       | What you should see                                                       |
| ----------- | ------------------------------------------------------------------------- |
| Status      | `QUEUED` → `RUNNING` → `SUCCESS` or `FAILED`                              |
| Trigger     | `MANUAL`                                                                  |
| Attempt     | `1 / 1` unless the schedule has retries                                   |
| Commit SHA  | First 8 chars of Git `HEAD` after clone                                   |
| dbt command | What you configured                                                       |
| Logs        | stdout/stderr/system lines, polled while running                          |
| Metrics     | Model/test counts when `run_results.json` exists (`debug` often has none) |

**Pass without real dbt:** job is created and may fail with a spawn/Git error; it still appears in history.

**Pass with Git + dbt + profiles:** status `SUCCESS`, SHA set, logs contain dbt output.

`dbt debug` is the best first command: it does not need Dremio models to succeed if the adapter/profile is valid. `dbt build` needs a working `profiles.yml` for Dremio (see [dbt-projects.md](./dbt-projects.md)). Profiles live with the dbt project / user home, **not** in this scheduler repo.

### 7.6 Cancel

1. **Run now** so a job is `QUEUED` or `RUNNING`.
2. On job details, click **Cancel** (queued) or **Request cancel** (running).
3. Queued → status `CANCELLED` immediately.
4. Running → “Cancel requested …” then the worker stops the dbt child and completes as cancelled.

**Pass:** queued job never starts dbt; running job stops without killing the worker process.

### 7.7 Jobs list filters

1. Open **Jobs**.
2. Filter status `FAILED`, `SUCCESS`, `QUEUED`, etc.
3. Open a row and use **Back to jobs**.

**Pass:** filter matches; names resolve from projects/schedules.

### 7.8 Workers

1. Open **Workers** with `dev:worker` running.
2. You should see hostname, status (`IDLE` / `RUNNING`), heartbeat (“just now”), concurrency.
3. While a job runs, **Current job** links to `/jobs/:id`.
4. Stop the worker (Ctrl+C). After ~90 seconds the row looks **Offline** (or `STOPPED` if shutdown completed).

**Pass:** worker registers; heartbeat updates.

### 7.9 Scheduler (automatic jobs)

1. Enable a schedule with cron `Every 5 minutes` (or Custom `* * * * *` for every minute — use only in local testing).
2. Wait for `next_run_at` to pass (scheduler ticks every `SCHEDULER_TICK_INTERVAL_SECONDS`, default 10).
3. **Jobs** should show trigger **SCHEDULED**.
4. Restart the scheduler. The same `scheduled_for` slot must **not** create a duplicate job (unique execution key).

Missed hours: the scheduler creates **one** catch-up job for the overdue slot, then jumps `next_run_at` to the next future time. It does not enqueue every missed hour.

**Pass:** one scheduled job per occurrence; dashboard **Upcoming schedules** shows the next time.

### 7.10 Concurrency and priority (Phase 10)

Use **QUEUE** or **ALLOW**, two workers or `WORKER_CONCURRENCY=2`, and **Run now** twice quickly.

| Setup                                          | Expected                                                       |
| ---------------------------------------------- | -------------------------------------------------------------- |
| Same schedule, **SKIP_IF_RUNNING**             | Second Run now skipped; one job                                |
| Same schedule, **QUEUE**                       | Two jobs; only one `RUNNING` at a time                         |
| Same schedule, **ALLOW**                       | Both can be `RUNNING` unless a cap applies                     |
| Project **Max jobs** = 1, two schedules, ALLOW | Second job stays `QUEUED` until the first finishes             |
| One CRITICAL and one LOW queued                | CRITICAL is claimed first                                      |
| A job already `RUNNING`                        | A new CRITICAL job does **not** kill it; it waits in the queue |

Global cap: set `MAX_CONCURRENT_JOBS=1` in `.env`, restart API/worker, enqueue two ALLOW jobs on different schedules. Only one should be `RUNNING`.

**Pass:** caps hold; CRITICAL jumps the queue only.

---

## 8. Optional API checks (same features, no UI)

PowerShell examples (no auth):

```powershell
Invoke-RestMethod http://localhost:4000/api/health
Invoke-RestMethod http://localhost:4000/api/system/status
Invoke-RestMethod http://localhost:4000/api/projects
Invoke-RestMethod http://localhost:4000/api/schedules
Invoke-RestMethod http://localhost:4000/api/jobs
Invoke-RestMethod http://localhost:4000/api/workers
```

Create a project:

```powershell
Invoke-RestMethod -Method POST -Uri http://localhost:4000/api/projects -ContentType 'application/json' -Body '{"name":"api-test","repositoryUrl":"https://github.com/example/analytics-dbt.git","branch":"main","projectPath":".","environment":"dev"}'
```

Successful bodies look like `{ "data": ... }`. Errors look like `{ "error": { "code", "message" } }`. Full list: [api.md](./api.md).

If `API_AUTH_TOKEN` is set:

```powershell
$headers = @{ Authorization = "Bearer YOUR_TOKEN" }
Invoke-RestMethod -Headers $headers http://localhost:4000/api/projects
```

---

## 9. Job statuses (what “working” looks like)

| Status       | Meaning                                                             |
| ------------ | ------------------------------------------------------------------- |
| `QUEUED`     | In Postgres; waiting for a worker                                   |
| `RUNNING`    | Worker holds a lease and is cloning or running dbt                  |
| `SUCCESS`    | dbt exited 0                                                        |
| `FAILED`     | dbt or worker failed; see `failureClass` and logs                   |
| `CANCELLED`  | Cancelled before or during run                                      |
| `RETRY_WAIT` | Retryable failure; will return to `QUEUED` after delay              |
| `STALE`      | Lease expired (worker died); not treated as success                 |
| `SKIPPED`    | Reserved; enqueue skip usually returns a skip **result**, not a row |

---

## 10. Suggested first-time checklist

1. `npm test` passes.
2. Postgres up, `db:migrate` / `db:seed` succeed.
3. API health ok; UI **API reachable**.
4. Worker appears on **Workers**.
5. Create a real GitHub project (or edit the seed URL).
6. Create a `debug` schedule; **Run now**.
7. Job appears; logs stream; cancel still works on a queued job.
8. Enable a short cron and wait for one `SCHEDULED` job.
9. Set project max jobs to 1 and confirm a second job waits.

You can stop after step 7 if you only need to confirm the control plane. Steps 6–7 need a cloneable repo for `SUCCESS`; they need dbt + Dremio profile for a real `build`.

---

## 11. Shut down

Host processes: Ctrl+C in each terminal.

Postgres / full stack:

```powershell
docker compose down
```

Workspaces under `WORKSPACE_ROOT` (`job-<id>` folders) are leftover checkouts; you can delete them by hand. The app also cleans old workspaces after `WORKSPACE_RETENTION_HOURS`.

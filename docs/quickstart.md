# Quickstart: terminal commands to run this project

This is the exact, tested command sequence to start DBT Scheduler locally on
Windows (PowerShell). For feature-by-feature UI testing once it's running, see
[local-testing.md](./local-testing.md). For the theory behind each command, see
[local-development.md](./local-development.md).

## Known gap: `.env` is not auto-loaded

`npm run dev:api` / `dev:scheduler` / `dev:worker` / `db:migrate` / `db:seed` all
run via `tsx`, and this repo has no `dotenv` (or `--env-file`) wired in — so
creating `.env` alone does **not** put those values into `process.env` for these
commands. You'll get `DATABASE_URL is required to run migrations` or `Invalid
application configuration` if you skip the `$env:` lines below.

The one exception is **Docker Compose**, which auto-reads `.env` in the project
root for its own `${VAR}` substitution — that part works with no extra steps.

## 0. One-time setup

```powershell
Copy-Item .env.example .env
npm install
```

Edit `.env` and set (Windows host processes need a real Windows path):

```text
WORKSPACE_ROOT=C:/tmp/dbt-scheduler-workspaces
```

```powershell
New-Item -ItemType Directory -Force -Path C:\tmp\dbt-scheduler-workspaces
```

## 1. Start Postgres (Docker)

```powershell
docker compose up postgres -d
docker compose ps   # wait for "healthy"
```

## 2. Apply the schema

Every terminal tab that runs a host process needs `DATABASE_URL` set — it
persists for the life of that tab, so this only needs to be typed once per new
window:

```powershell
$env:DATABASE_URL = "postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler"
npm run db:migrate
npm run db:seed        # optional: adds a sample project + disabled schedule
```

## 3. Start the four processes (four terminal tabs)

**Tab 1 — API:**

```powershell
$env:DATABASE_URL = "postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler"
npm run dev:api
```

**Tab 2 — scheduler:**

```powershell
$env:DATABASE_URL = "postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler"
npm run dev:scheduler
```

**Tab 3 — worker** (also needs `WORKSPACE_ROOT` so git-clone-mode jobs land on a
real Windows path; not required for `local_directory`-mode jobs, but harmless to
always set):

```powershell
$env:DATABASE_URL = "postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler"
$env:WORKSPACE_ROOT = "C:/tmp/dbt-scheduler-workspaces"
npm run dev:worker
```

**Tab 4 — web** (no env vars needed; Vite proxies `/api` to `http://localhost:4000`):

```powershell
npm run dev:web
```

## 4. Open it

| Service    | URL                              |
| ---------- | -------------------------------- |
| Web UI     | http://localhost:3000            |
| API        | http://localhost:4000            |
| API health | http://localhost:4000/api/health |
| Postgres   | localhost:5432                   |

Quick smoke check without the UI:

```powershell
Invoke-RestMethod http://localhost:4000/api/health
Invoke-RestMethod http://localhost:4000/api/workers
```

## 5. Shut everything down

```powershell
# Ctrl+C in each of the four terminal tabs, then:
docker compose down
```

`docker compose down` (no `-v`) keeps the `postgres_data` volume, so seeded/test
data survives the next `docker compose up postgres -d`. Add `-v` only if you
want a clean database.

## Alternative: everything in Docker (no host Node processes)

Skips the four terminal tabs above entirely — useful when you don't need to
point at a local Windows folder (see
[dbt-projects.md#local-folder-projects](./dbt-projects.md#local-folder-projects)
for why local-folder projects specifically need the host-process path instead).

```powershell
docker compose up --build
# from the host, once Postgres is healthy:
$env:DATABASE_URL = "postgres://dbt_scheduler:dbt_scheduler@localhost:5432/dbt_scheduler"
npm run db:migrate
npm run db:seed
```

Shut down with `docker compose down`.

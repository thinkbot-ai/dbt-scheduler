# Troubleshooting

## `Invalid application configuration`

`DATABASE_URL` is required. Copy `.env.example` to `.env`.

## API starts but UI shows no jobs

The React UI at http://localhost:3000 proxies `/api` to the Fastify process. If lists are empty, confirm `GET /api/jobs` and `GET /api/health`. If the API requires `API_AUTH_TOKEN`, set the same value on the Settings page. `GET /api/health` does not require PostgreSQL. Step-by-step setup: [local-testing.md](./local-testing.md).

## dbt is not on the host PATH

Local process roles do not run dbt in Phase 1. The Docker image installs pinned dbt. Confirm with `docker compose exec worker dbt --version` after Phase 3.

## Duplicate schedules after restart

`(schedule_id, scheduled_for)` is unique. Restarting the scheduler advances `next_run_at` and will not insert a second job for an occurrence that already has an execution key. Missed hours are caught up with one job for the overdue slot, then `next_run_at` jumps to the next future occurrence.

## Worker crash during a run

The job lease expires and the run is marked `STALE`, then recovered. It is not automatically marked `SUCCESS`. Workers renew `lease_expires_at` on each heartbeat while the job is `RUNNING`.

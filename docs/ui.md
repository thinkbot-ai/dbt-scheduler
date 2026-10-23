# Web UI

The React app (`apps/web`) is a control-plane client. It talks only to the Fastify API through Vite’s `/api` proxy (or the same origin in Docker). It never runs dbt, never clones Git, and never displays `GIT_TOKEN` or other secrets.

## Pages

| Route        | Purpose                                                                               |
| ------------ | ------------------------------------------------------------------------------------- |
| `/`          | Dashboard: queue counts, running jobs, failures, upcoming `nextRunAt`, workers online |
| `/projects`  | Create/list/delete projects; set per-project `maxConcurrentJobs`                      |
| `/schedules` | Cron presets, timezone, dbt command, Run now, enable/disable                          |
| `/jobs`      | Filter by status                                                                      |
| `/jobs/:id`  | SHA, metrics, polled logs, cancel                                                     |
| `/workers`   | Heartbeat and current job                                                             |
| `/settings`  | Local `Authorization: Bearer` token and API health                                    |

Job and schedule names are joined client-side from `/api/projects` and `/api/schedules`. Lists poll about every 4 seconds; a running or queued job’s details and logs poll every 2 seconds.

## Auth

If `API_AUTH_TOKEN` is set on the API, paste the same value on Settings. It is stored in this browser only (`dbt-scheduler.api-token`). Health remains unauthenticated.

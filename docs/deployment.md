# Deployment

The production image contains Node.js 22, Python 3, Git, `dbt-core==1.10.23`, and `dbt-dremio==1.10.1`.

Scale by replica count, not by embedding more cron timers:

- API: 1+
- Scheduler: 1+ (idempotent)
- Worker: 1+ (queue consumers)
- PostgreSQL: 1 primary for V1

Compose files:

- `docker-compose.yml` — local full stack
- `docker-compose.dev.yml` — bind-mounted source

Kubernetes is intentionally out of scope until there is a concrete operational need.

# Local development

For a full walkthrough (Postgres, four processes, UI feature checks, Docker), see [local-testing.md](./local-testing.md).

## Toolchain

- Node.js 22.13+ (see `.nvmrc`)
- npm workspaces
- Docker Compose for PostgreSQL and the three process roles

## First run

```bash
cp .env.example .env
npm install
npm run lint
npm run typecheck
npm test
```

## Process roles

```bash
npm run dev:api        # http://localhost:4000
npm run dev:scheduler
npm run dev:worker
npm run dev:web        # http://localhost:3000
```

`DATABASE_URL` is required. Apply schema after Postgres is up:

```bash
npm run db:migrate
npm run db:seed
```

## Docker

```bash
docker compose up --build
```

Hot-reload style bind mounts:

```bash
docker compose -f docker-compose.dev.yml up --build
```

## Tests

Vitest runs package and app unit tests plus `tests/workspace-packages.test.ts`.

```bash
npm test
npm run test:watch
```

## What is intentionally missing

The web UI is live against the API. Use Settings if `API_AUTH_TOKEN` is set. Empty dashboards usually mean Postgres is empty or the API is not running.

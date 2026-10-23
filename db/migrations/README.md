# Database migrations

SQL migrations are generated from `packages/database/src/schema` with Drizzle Kit:

```bash
npm run db:generate
```

Apply them to PostgreSQL:

```bash
npm run db:migrate
```

Do not edit generated files in `meta/` by hand. Tests apply the same folder against PGlite.

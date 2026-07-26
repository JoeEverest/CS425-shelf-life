# ShelfLife

ShelfLife is a Bun and TypeScript general-store management system. The monorepo contains a Hono API, a Vite React client, shared contracts, and a PostgreSQL database package built with Drizzle ORM.

## Getting started

Install dependencies, start both local databases, and create your environment file:

```bash
bun install
docker compose up -d
cp .env.example .env
```

Apply the checked-in Drizzle migrations and load the demo data:

```bash
bun run db:migrate
bun run db:seed
```

Start the development workspaces:

```bash
bun run dev
```

Run the complete test suite. Database integration tests use `TEST_DATABASE_URL` from `.env` and reset application tables between tests.

```bash
bun test
```

Useful validation commands:

```bash
bun run format:check
bun run lint
bun run type-check
bun run build
```

## Workspaces

- `server` — Hono API
- `client` — Vite and React frontend
- `shared` — shared validation schemas and TypeScript types
- `db` — Drizzle schema, migrations, integration tests, and seed data

## Database commands

Run database commands from this directory:

```bash
bun run db:migrate
bun run db:seed
```

To stop PostgreSQL while preserving its named volume:

```bash
docker compose down
```

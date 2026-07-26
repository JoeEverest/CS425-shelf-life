# ShelfLife — Release 1 Readiness

This document covers what an operator needs to run, support, and reason about
ShelfLife Release 1: the release checklist, known limitations, the backup and
restore procedure, deployment configuration, and a short user guide for each
role.

## Release checklist

- [x] **Every critical business rule has an automated test.** No-negative-stock
  (conditional decrement + `CHECK`), round-once money, ledger invariant
  (`stock_levels` = Σ movements), RBAC matrix, publish-once immutability,
  supplier partial-delivery payable, credit-sale atomicity, and overpayment
  rejection are each exercised by integration tests. Run `bun run test`.
- [x] **Secrets are externalized.** No credentials are committed; configuration
  is read from the environment (`app/.env`, ignored by git). `app/.env.example`
  documents the required variables.
- [x] **Migrations are reproducible.** `bun run db:migrate` applies the
  checked-in Drizzle migrations to an empty database; the schema is the single
  source of truth.
- [x] **CI blocks merges on failure** — format, lint, type-check, tests, and a
  production build all run and must pass (`.github/workflows/ci.yml`).
- [x] **Seed/demo data** loads a representative store (`bun run db:seed`).
- [ ] **Production database provisioned** and `DATABASE_URL` set in the target
  environment (operator step).
- [ ] **Backup schedule enabled** on the production database (see below).
- [ ] **`CLIENT_ORIGIN` and `NODE_ENV=production` set** so cookies are `Secure`
  and CORS is pinned to the real front-end origin.

## Known limitations (Release 1)

- **Single store, single currency**, chosen at setup; the currency is immutable
  afterward. Multi-branch and multi-currency are out of scope.
- **Stock projections are a runway estimate**, not a forecast — days-to-stockout
  from the trailing sales rate. No seasonality or demand modelling.
- **No external integrations** — barcode scanning, receipt printing, and payment
  processors are not included.
- **Customer management is lightweight** — customers are created inline during a
  credit sale or from the Customers page; there is no full customer profile.
- **Reporting is period totals**, not a general query builder.
- Passwords are set by an admin at account creation; there is no self-service
  password reset flow in this release.

## Backup and restore

The entire application state is in one PostgreSQL database, so a single logical
dump captures everything.

**Back up:**

```bash
pg_dump "$DATABASE_URL" --format=custom --file=shelflife-$(date +%F).dump
```

**Restore into an empty database:**

```bash
createdb shelflife_restore
pg_restore --dbname="postgres://…/shelflife_restore" --clean --if-exists shelflife-YYYY-MM-DD.dump
```

Because stock levels are derived from and reconciled against the append-only
`stock_movements` ledger, a restored database can be integrity-checked with:

```sql
SELECT p.sku, sl.qty_units, COALESCE(SUM(sm.delta_units), 0) AS ledger_sum
FROM products p
JOIN stock_levels sl ON sl.product_id = p.id
LEFT JOIN stock_movements sm ON sm.product_id = p.id
GROUP BY p.sku, sl.qty_units
HAVING sl.qty_units <> COALESCE(SUM(sm.delta_units), 0);
```

A restore is healthy when that query returns **no rows**.

## Deployment configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string for the API and migrations |
| `TEST_DATABASE_URL` | Separate database used only by the test suite / CI |
| `CLIENT_ORIGIN` | Front-end origin allowed by CORS (defaults to the dev origin) |
| `NODE_ENV` | Set to `production` so the session cookie is `Secure` |

- **API:** `bun run --cwd server start` (built with `bun run build`) behind HTTPS.
- **Client:** `bun run build:client` produces static assets served from any
  static host or the same origin as the API (same-origin keeps the session
  cookie simplest).
- **Database:** any managed PostgreSQL 17; run `bun run db:migrate` on deploy.

## User guide by role

**Admin / Owner** — Runs the one-time setup wizard (store name, currency,
address, and the first admin account). Adds employees and assigns roles,
manages product categories, and sees the dashboard. Only an admin can change
admin membership, and the last active admin cannot be removed.

**Manager** — Sets and changes product prices (every change is recorded), adds
suppliers and raises purchase orders, reviews the dashboard, stock projections,
and low-stock alerts, and records expenses. Can also do anything a clerk can.

**Sales Clerk** — Works the *Sell* screen: search a product, build the cart,
take cash payment, or sell on credit to a customer. Records customer payments
against invoices. Sees products and stock.

**Inventory Clerk** — Adds products and publishes them, receives deliveries
against purchase orders (including partial deliveries) and signs them off, and
records manager-approved stock adjustments. A discrepancy flagged with a note
needs a manager's confirmation.

**Accountant** — Records operating expenses and views the financial report
(revenue, cost of goods, expenses, net profit) for any period. Records customer
payments.

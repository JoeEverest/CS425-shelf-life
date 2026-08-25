# Performance Budget — Single Store (Release 1)

ShelfLife targets **one store** on a single Postgres instance. The budget below
is what "responds quickly under normal store load" (the SRS usability/performance
NFR) means concretely, plus a measured run against the seeded database.

## Budget (targets)

| Class of request | Budget (p95, local) | Rationale |
|---|---|---|
| Liveness/readiness probe | < 20 ms | must be cheap enough to poll frequently |
| Reads (lists, stock, alerts, projections) | < 100 ms | counter and stockroom lookups feel instant |
| Aggregations (dashboard, financial report) | < 250 ms | periodic manager/accountant views |
| Writes (record sale, receive delivery) | < 300 ms | one transaction; still fast at the counter |
| Login | < 400 ms | argon2id is deliberately slow; one-time per session |

These are single-store, single-instance targets, not horizontal-scale numbers —
scaling work is explicitly out of scope for Release 1.

## Measured — 2026-07-26 (seeded DB, warm)

| Endpoint | time_total |
|---|---|
| `GET /api/health/readiness` | 0.002 s |
| `POST /api/auth/login` | 0.112 s |
| `GET /api/products` | 0.008 s |
| `GET /api/stock` | 0.007 s |
| `GET /api/stock/alerts` | 0.007 s |
| `GET /api/analytics/projections` | 0.007 s |
| `GET /api/purchase-orders` | 0.009 s |
| `GET /api/suppliers` | 0.006 s |
| `GET /api/reports/financial?from&to` | 0.019 s |
| `GET /api/analytics/dashboard` | 0.027 s |

Every endpoint is comfortably inside its budget — the heaviest read
(the dashboard's multi-aggregate query) is ~27 ms against ~10 days of seeded
sales, an order of magnitude under the 250 ms aggregation budget.

## How to reproduce

With the app running (`bun run dev`) and the DB seeded, log in and time the
endpoints:

```bash
curl -sS -c /tmp/s.txt -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"manager","password":"password123"}' -o /dev/null -w 'login %{time_total}s\n'
curl -sS -b /tmp/s.txt localhost:3000/api/analytics/dashboard -o /dev/null -w 'dashboard %{time_total}s\n'
```

## Notes

- Indexing: the transactional hot paths filter on primary/foreign keys and the
  unique `sku`/`username` constraints; no missing-index hotspots were observed
  at store scale. Revisit if a store's history grows into millions of movements.

# ShelfLife — Threat Model (Release 1)

A concise threat model for a single-store deployment: what could go wrong, and
what in the system prevents or limits it. Scope is the ShelfLife API, client,
and database — not the host OS or network perimeter, which are the operator's
responsibility.

## Assets

- **Credentials & sessions** — who can act as whom.
- **Money & stock integrity** — balances, the append-only stock ledger, prices.
- **Business data** — products, suppliers, customers, invoices, expenses.

## Trust boundaries

- Browser (untrusted input) → API (the enforcement boundary) → database.
- The **API is the only enforcement point.** The SPA hides controls a user
  can't use, but never enforces — every protected route re-checks server-side.

## Threats & mitigations

| # | Threat | Mitigation in the system | Residual / operator action |
|---|---|---|---|
| 1 | **Credential stuffing / brute force** | Passwords hashed with argon2id (deliberately slow); login returns a generic error and does one hash even for unknown users, so timing doesn't reveal account existence | No lockout/rate-limit yet — put the API behind a rate limiter or WAF in production |
| 2 | **Privilege escalation** | RBAC is enforced on every protected route via `rbac(permission)`; the permission matrix is the single source of truth; only an admin may grant/revoke admin, and the last active admin can't be removed (checked inside the transaction) | — |
| 3 | **Session theft** | Session token is 32 random bytes; only its SHA-256 hash is stored; cookie is `httpOnly` + `SameSite=Lax`, and `Secure` when `NODE_ENV=production` | Terminate TLS in front of the API; set `NODE_ENV=production` |
| 4 | **CSRF** | `SameSite=Lax` blocks cross-site cookie use on unsafe methods; CORS is pinned to `CLIENT_ORIGIN` with credentials | Keep `CLIENT_ORIGIN` set to the real front-end origin; do not widen CORS |
| 5 | **Data-integrity / negative money or stock** | Money in integer cents / SQL `numeric` (round-once); stock never goes negative (conditional decrement + `CHECK`); ledger invariant enforced per transaction; overpayment and over-receipt rejected; published records are immutable (corrections are reversing entries) | — |
| 6 | **Injection** | All queries are parameterized through Drizzle; request bodies validated with Zod before reaching a service | — |
| 7 | **Sensitive-data exposure** | Password hashes are never serialized in any response; errors return a stable code + message, not internals | Don't log request bodies with credentials (the request logger logs metadata only) |
| 8 | **First-run takeover** | `POST /api/setup` is public only while the users table is empty and is concurrency-safe (serializable); 403 forever after | Complete setup immediately on deploy |
| 9 | **Deployment boundary** | Readiness endpoint reports DB reachability so a load balancer never routes to an instance that can't serve; secrets read from the environment, never committed | Restrict who can reach the DB port; keep `.env` off the host's public paths |

## Explicitly accepted for Release 1

- No login rate-limiting in-app (delegated to the edge/WAF).
- No self-service password reset (admin re-issues credentials).
- Single store, single currency, no multi-tenancy — so cross-tenant data
  leakage is out of scope by construction.

## Review

Revisit this model when adding: external integrations, payment processing,
multi-store, or any new public (unauthenticated) endpoint.

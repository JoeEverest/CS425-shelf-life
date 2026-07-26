# Backup & Restore Exercise — 2026-07-26

Evidence that the backup/restore procedure in `RELEASE.md` works and that a
restored database is byte-faithful and internally consistent.

## Procedure exercised

Against the seeded `shelflife` database (Postgres 17 in the `app-postgres-1`
container):

```bash
# 1. Back up (custom format)
docker exec app-postgres-1 pg_dump -U shelflife -d shelflife -Fc -f /tmp/shelflife.dump

# 2. Fresh target database
docker exec app-postgres-1 createdb -U shelflife shelflife_restore

# 3. Restore
docker exec app-postgres-1 pg_restore -U shelflife -d shelflife_restore /tmp/shelflife.dump
```

## Results

**Ledger-integrity check on the restored database** (the invariant from
`RELEASE.md` — `stock_levels.qty_units` must equal the sum of that product's
`stock_movements` deltas). A healthy restore returns **no rows / zero
mismatches**:

```
mismatches
-----------
        0
```

**Row-count parity (original → restored):**

| Table | Original | Restored |
|---|---|---|
| products | 6 | 6 |
| sales | 10 | 10 |
| sale_lines | 20 | 20 |
| stock_movements | 26 | 26 |
| invoices | 0 | 0 |

## Conclusion

The dump/restore round-trips the full application state, and the restored
database passes the ledger-integrity invariant with zero drift. The procedure
in `RELEASE.md` is verified.

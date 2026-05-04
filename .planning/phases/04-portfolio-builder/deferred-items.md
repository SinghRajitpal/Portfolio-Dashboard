# Phase 04 Portfolio Builder — Deferred Items

Out-of-scope discoveries logged during plan execution per the GSD scope boundary
rule. These are NOT bugs introduced by the current plan; they pre-existed.

## Discovered during 04-04-builder-components

### Pre-existing TS errors in Plan 04-03 deliverables (untracked files)

`src/app/dashboard/portfolios/_actions.ts` and
`src/app/dashboard/portfolios/_queries.ts` exist on disk (untracked) but were
not committed before 04-04 began. They produce 11 `tsc --noEmit` errors:

```
src/app/dashboard/portfolios/_actions.ts(50,87): error TS2345 — `save_portfolio` RPC argument typed as `undefined`
src/app/dashboard/portfolios/_queries.ts(206-208, 243-249): error TS2339 — accessing properties on `never`
```

Root cause: the typed Supabase client narrows `save_portfolio` RPC and
`from('instruments').select()` returns to `never` because the generated
`Database` type either omits the RPC signature (Plan 04-03 needed migration
00006 sync) or uses overly strict generic narrowing for the multi-column select.

**Workaround pattern (used in Plan 04-04 / `src/app/api/instruments/resolve/route.ts`):**
cast the typed client to `SupabaseClient` (untyped) — see
`src/lib/data/cache-prices.ts` for prior precedent. This sidesteps the generic
inference issue at the cost of type safety on those specific calls.

**Action:** Plan 04-03 owner should either (a) regenerate `src/types/database.ts`
post-migration-00006 so the `save_portfolio` RPC and instruments table types are
properly populated, or (b) apply the same `SupabaseClient` cast workaround.

These errors do NOT block Plan 04-04 — the new resolve route compiles cleanly
when filtered by path.

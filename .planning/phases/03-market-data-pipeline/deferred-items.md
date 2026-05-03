# Phase 03 — Deferred Items

Items discovered during Plan 10 execution that are OUT OF SCOPE but should be tracked.

---

## Item 1: Frankfurter v2 NDJSON format mismatch in seed:fx

**Found during:** Plan 10, Task 1 (pre-smoke re-seed)
**Severity:** Medium — FX seed CLI broken but smoke test passes via fixtures
**Root cause:**  
`src/lib/data/frankfurter.ts` uses `https://api.frankfurter.dev/v2/rates` with `Accept: application/x-ndjson`. The v2 endpoint returns one line per currency pair: `{"date":"...","base":"CHF","quote":"USD","rate":1.27}`. However, `parseNdjson` expects `{"date":"...","base":"...","rates":{"USD":...,"EUR":...}}` (v1 format). Zod validation fails for all v2 rows → 0 rows parsed.

**Evidence:**
```
npm run seed:fx
# → Parsed 0 daily rows, Upserted 0 fx_rate rows
```

**Not triggered in integration tests** because fx-seed.spec.ts mocks the Frankfurter API with a fixture file.

**Fix needed:**
Option A: Change `parseNdjson` to handle v2 format (one row per quote currency).  
Option B: Switch to v1 API endpoint (`/{from}..{to}?base=CHF&symbols=USD,EUR,GBP`) which returns JSON with `rates` object — matches current schema.

**Impact on Plan 10:** None — smoke test Criterion 2 uses direct fixture inserts. FX rates table is empty in production DB but this does not block Phase 4 UI work.

**Recommended fix in:** Plan 04-01 (or Phase 4 pre-requisite) before FX rates are needed for backtest display.

---

## Item 2: Stooq Swiss SIX coverage is zero

**Found during:** Plan 10, Task 1 (Stooq seed)
**Severity:** Low — documented workaround (Yahoo fallback for CH tickers) in place
**Root cause:** Stooq returns empty CSV for all 5 Swiss tickers: CSSPX.SW, 500E.SW, CHDVD.SW, SSAC.SW, NOVN.SW. This was flagged in STATE.md Blockers.

**Workaround implemented:** Yahoo fallback for all 5 Swiss tickers in Plan 10 (helper scripts). Seed process is now: Stooq for US/LSE, Yahoo for Swiss.

**Long-term fix:** Update seed-instruments-stooq.ts to auto-fall-back to YahooProvider for tickers that Stooq returns empty CSV. Alternatively, rename seed-instruments-stooq.ts to seed-prices.ts and make it dual-provider.

---

## Item 3: SPY Stooq data is cumulative-dividend-adjusted (backward)

**Found during:** Plan 10, Task 1 (SPY 2020-03-16 cross-check)
**Severity:** Medium — Stooq price data for SPY is cumulatively dividend-adjusted backward, making nominal close values incorrect (~7-8% below actual)
**Root cause:** Stooq adjusts historical prices backward using all future dividends up to today. SPY 2020-03-16 Stooq close = $221.68 vs Yahoo/public reference = $239.85 (7.6% difference).

**Fix applied in Plan 10:** SPY replaced with Yahoo data for full history (1993-01-29 → present, 8,371 rows). Yahoo returns nominal close and provides its own backward-adjusted adjclose.

**Long-term consideration:** Other Stooq-seeded tickers (AGG, VTI, BND, GLD, QQQ, EEM, VWRL, IWDA) may have the same backward-adjustment issue. YahooProvider should be used as the source of truth for close prices, with Stooq data validated against Yahoo spot-checks before use in production backtesting.

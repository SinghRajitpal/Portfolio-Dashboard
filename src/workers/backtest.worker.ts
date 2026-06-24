/**
 * Backtest Web Worker entry — postMessage RPC.
 *
 * Runs the full simulation off the main thread per CONTEXT D-06 (the entire
 * backtest simulation runs in a browser Web Worker; no server-side compute
 * path is created and the main thread is never blocked on simulate()).
 *
 * Wire shape (per RESEARCH §Pattern 1, lines 274-309):
 *   main → worker:  WorkerRequest { kind: 'run',  payload: BacktestInput }
 *   worker → main:  WorkerResponse
 *                     | { kind: 'done',  result, inputsHash }
 *                     | { kind: 'error', error: BacktestError }
 *
 * The worker is sandboxed — imports MUST come from `@/lib/backtest/*` only.
 * No Next.js, DOM, React, or Supabase imports (postMessage payloads are
 * structured-cloned at the message boundary; everything beyond is pure math).
 *
 * Worker bundling note (RESEARCH §Pitfall 10, lines 666-670):
 *   The consumer (use-backtest-worker.ts) constructs this worker via
 *   `new Worker(new URL('../../workers/backtest.worker.ts', import.meta.url),
 *               { type: 'module' })`
 *   using a RELATIVE path. Next.js 16 requires the worker file path to be a
 *   static string literal inside `new URL(...)`. Verify with
 *   `npm run build && npm run start` before declaring the worker shipped
 *   (Task 3 checkpoint enforces this).
 *
 * Hash is computed INSIDE the worker (RESEARCH anti-pattern, line 583):
 *   computing on the main thread would let UI mutate the payload between
 *   send and hash, so two semantically-different runs could collide.
 *
 * See:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-06, D-08)
 *   - .planning/phases/05-backtesting-engine/05-RESEARCH.md §Pattern 1, §Pitfall 10
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §backtest.worker.ts
 */
import { simulate } from '@/lib/backtest/simulate'
import { computeMetrics } from '@/lib/backtest/metrics'
import { hashInputs } from '@/lib/backtest/inputs-hash'
import { isBacktestError } from '@/lib/backtest/errors'
import type {
  BacktestOutput,
  WorkerRequest,
  WorkerResponse,
} from '@/lib/backtest/types'

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.kind !== 'run') return

  try {
    // 1) Simulate (pure). Returns BacktestError on no-overlap etc.
    const simResult = simulate(msg.payload)
    if (isBacktestError(simResult)) {
      const errResp: WorkerResponse = { kind: 'error', error: simResult }
      self.postMessage(errResp)
      return
    }

    // 2) Metrics from the equity curve + SNB rates.
    const metrics = computeMetrics({
      equity: simResult.equity,
      snbRates: msg.payload.snbRates,
      startDate: msg.payload.start,
      endDate: msg.payload.end,
    })

    // 3) Hash inside the worker (CONTEXT D-08, RESEARCH anti-pattern line 583).
    const inputsHash = await hashInputs(msg.payload)

    // 4) Assemble BacktestOutput. pricesVersion is supplied by the caller
    //    (the batch-data API computes MAX(updated_at) server-side per D-09).
    const inputWithVersion = msg.payload as typeof msg.payload & {
      pricesVersion?: number
    }
    const result: BacktestOutput = {
      equity: simResult.equity,
      benchmarkEquity: simResult.benchmarkEquity,
      annualBars: simResult.annualBars,
      metrics,
      warnings: simResult.warnings,
      pricesVersion: inputWithVersion.pricesVersion ?? 0,
    }

    const doneResp: WorkerResponse = { kind: 'done', result, inputsHash }
    self.postMessage(doneResp)
  } catch (err) {
    const errResp: WorkerResponse = {
      kind: 'error',
      error: { kind: 'unknown', message: (err as Error).message },
    }
    self.postMessage(errResp)
  }
}

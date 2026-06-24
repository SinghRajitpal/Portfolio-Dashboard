'use client'

/**
 * React hook wrapping the backtest Web Worker as a Promise-based RPC.
 *
 * Contract (consumed by Plan 06 UI):
 *   const { run, terminate, isRunning } = useBacktestWorker()
 *   const { result, inputsHash } = await run(input)
 *
 * Lifecycle:
 *   - Mount → spawn worker (per CONTEXT D-06 — browser Web Worker)
 *   - Unmount → terminate worker, null the ref
 *   - One in-flight call at a time — concurrent run() rejects with
 *     "Worker busy" (the v1 UX shows a single Run button so this is
 *     a guard, not a feature)
 *
 * Worker URL (RESEARCH §Pitfall 10, lines 666-670):
 *   `new Worker(new URL('../../workers/backtest.worker.ts', import.meta.url),
 *               { type: 'module' })`
 *   Relative path is intentional — Next.js 16 + Turbopack require the URL
 *   string to be a static literal; the `@/` alias has been observed to
 *   resolve in dev but not in prod. Plan 05-05 Task 3 verifies prod build.
 *
 * See:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-06)
 *   - .planning/phases/05-backtesting-engine/05-RESEARCH.md §Pattern 1, §Pitfall 10
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §backtest.worker.ts
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BacktestInput,
  BacktestOutput,
  WorkerRequest,
  WorkerResponse,
} from './types'

type RunResolved = { result: BacktestOutput; inputsHash: string }

type PendingResolver = {
  resolve: (v: RunResolved) => void
  reject: (e: Error) => void
}

export function useBacktestWorker(): {
  run: (input: BacktestInput) => Promise<RunResolved>
  terminate: () => void
  isRunning: boolean
} {
  const workerRef = useRef<Worker | null>(null)
  const pendingResolver = useRef<PendingResolver | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    // Static literal URL — see RESEARCH §Pitfall 10. Do NOT factor this URL
    // into a variable; the bundler statically resolves the path at build time.
    const worker = new Worker(
      new URL('../../workers/backtest.worker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      const pending = pendingResolver.current
      if (msg.kind === 'done') {
        pendingResolver.current = null
        setIsRunning(false)
        pending?.resolve({ result: msg.result, inputsHash: msg.inputsHash })
      } else if (msg.kind === 'error') {
        pendingResolver.current = null
        setIsRunning(false)
        // Surface the BacktestError as an Error with a stable .message; the
        // caller can re-parse the discriminant if it wants to render targeted
        // UI. (BacktestError is JSON-safe so we keep the kind in the message.)
        const e2 = new Error(msg.error.message)
        ;(e2 as Error & { backtestError?: typeof msg.error }).backtestError =
          msg.error
        pending?.reject(e2)
      }
      // 'progress' is ignored in v1 per CONTEXT D-12 (crosshair-only UX).
    }

    worker.onerror = (event: ErrorEvent) => {
      const pending = pendingResolver.current
      pendingResolver.current = null
      setIsRunning(false)
      pending?.reject(new Error(event.message || 'Worker errored'))
    }

    return () => {
      worker.terminate()
      workerRef.current = null
      // Reject any in-flight call so the consumer Promise doesn't hang.
      const pending = pendingResolver.current
      pendingResolver.current = null
      if (pending) pending.reject(new Error('Worker terminated'))
    }
  }, [])

  const run = useCallback((input: BacktestInput): Promise<RunResolved> => {
    return new Promise<RunResolved>((resolve, reject) => {
      const worker = workerRef.current
      if (!worker) {
        reject(new Error('Worker not ready'))
        return
      }
      if (pendingResolver.current) {
        reject(new Error('Worker busy'))
        return
      }
      pendingResolver.current = { resolve, reject }
      setIsRunning(true)
      const req: WorkerRequest = { kind: 'run', payload: input }
      worker.postMessage(req)
    })
  }, [])

  const terminate = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    const pending = pendingResolver.current
    pendingResolver.current = null
    setIsRunning(false)
    if (pending) pending.reject(new Error('Worker terminated'))
  }, [])

  return { run, terminate, isRunning }
}

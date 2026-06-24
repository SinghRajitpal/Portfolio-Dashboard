'use client'

/**
 * EquityCurveChart — TradingView Lightweight Charts v5.
 *
 * Renders the backtest portfolio curve (Area) + optional benchmark (Line)
 * with a custom HTML crosshair tooltip showing CHF values.
 *
 * Conventions (CONTEXT decisions, see 05-CONTEXT.md):
 *   D-04  Chart placement: equity curve sits at the top of the results panel.
 *   D-11  Charts use lightweight-charts v5 — Area (portfolio) + Line
 *         (benchmark) for the equity curve, Histogram for annual bars.
 *         No other charting library may be introduced.
 *   D-12  v1 interaction is crosshair + tooltip ONLY — no brush-to-zoom,
 *         no marker pinning, no shaded ranges.
 *
 * lightweight-charts v5 API caveats (RESEARCH §State of the Art):
 *   - chart.addSeries(AreaSeries, opts)  — v5 shape
 *   - v4-style imperative-add-series helpers (chart.add*Series methods) were
 *     removed in v5 — the definition-arg form is the only API now
 *   - localization.priceFormatter is wired with fmtCHF
 *   - subscribeCrosshairMove for tooltip per RESEARCH Pattern 2
 *
 * Lifecycle: useLayoutEffect (avoids first-paint flash per RESEARCH lines
 * 332-446). Effect deps include [portfolio, benchmark] — re-create the chart
 * on data change. RESEARCH Pattern 2 line 442 accepts this re-create cost
 * for simpler code than imperative updateData() bookkeeping.
 *
 * See:
 *   - .planning/phases/05-backtesting-engine/05-RESEARCH.md §Pattern 2 (lines 336-446)
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §EquityCurveChart
 */
import { useLayoutEffect, useRef } from 'react'
import {
  createChart,
  LineSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'
import { fmtCHF } from '@/lib/portfolio/chf-format'
import { cn } from '@/lib/utils'
import type { EquityPoint } from '@/lib/backtest/types'

const PORTFOLIO_COLOR = '#E3000F' // Swiss red — Phase 2 design token
const BENCHMARK_COLOR = '#666'

type EquityCurveChartProps = {
  portfolio: EquityPoint[]
  benchmark: EquityPoint[] | null
  height?: number
  className?: string
}

export function EquityCurveChart({
  portfolio,
  benchmark,
  height = 360,
  className,
}: EquityCurveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { color: 'transparent' },
        textColor: '#666',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: '#eee' },
      },
      localization: {
        priceFormatter: (v: number) => fmtCHF(v),
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: { mode: 1 },
      autoSize: false,
    })
    chartRef.current = chart

    // Portfolio — Area series (v5 API: addSeries(AreaSeries, ...))
    const portfolioSeries: ISeriesApi<'Area'> = chart.addSeries(AreaSeries, {
      lineColor: PORTFOLIO_COLOR,
      topColor: 'rgba(227,0,15,0.20)',
      bottomColor: 'rgba(227,0,15,0)',
      lineWidth: 2,
      priceLineVisible: false,
    })
    portfolioSeries.setData(
      portfolio.map(p => ({ time: p.date as Time, value: p.value })),
    )

    // Benchmark — optional Line series.
    let benchmarkSeries: ISeriesApi<'Line'> | null = null
    if (benchmark && benchmark.length > 0) {
      benchmarkSeries = chart.addSeries(LineSeries, {
        color: BENCHMARK_COLOR,
        lineWidth: 1,
        priceLineVisible: false,
      })
      benchmarkSeries.setData(
        benchmark.map(p => ({ time: p.date as Time, value: p.value })),
      )
    }

    chart.timeScale().fitContent()

    // Custom HTML tooltip. Position container relative so the absolute tip
    // anchors to the chart pane.
    const prevPosition = container.style.position
    container.style.position = 'relative'
    const tip = document.createElement('div')
    tip.className = [
      'absolute hidden pointer-events-none',
      'px-2 py-1 rounded text-xs',
      'bg-background border border-border shadow-sm z-10',
      'tabular-nums',
    ].join(' ')
    container.appendChild(tip)

    chart.subscribeCrosshairMove(p => {
      if (
        !p.point ||
        !p.time ||
        p.point.x < 0 ||
        p.point.y < 0 ||
        p.point.x > container.clientWidth
      ) {
        tip.style.display = 'none'
        return
      }
      const pVal = (p.seriesData.get(portfolioSeries) as { value?: number } | undefined)?.value
      const bVal = benchmarkSeries
        ? (p.seriesData.get(benchmarkSeries) as { value?: number } | undefined)?.value
        : undefined

      // T-5-05-XSS mitigation: every interpolated piece below is either a
      // string Time (ISO date from our own data, no user input) or fmtCHF()
      // output (numeric → de-CH currency string). No external user content
      // ever flows through this innerHTML.
      const dateStr = typeof p.time === 'string' ? p.time : String(p.time)
      tip.innerHTML =
        `<div><strong>${dateStr}</strong></div>` +
        `<div>Portfolio: ${pVal !== undefined ? fmtCHF(pVal) : '—'}</div>` +
        (bVal !== undefined ? `<div>Benchmark: ${fmtCHF(bVal)}</div>` : '')

      tip.style.display = 'block'
      // Clamp tooltip horizontally so it stays in-bounds at the right edge.
      const tipWidth = tip.offsetWidth || 120
      const left = Math.min(p.point.x + 12, container.clientWidth - tipWidth - 4)
      tip.style.left = `${Math.max(4, left)}px`
      tip.style.top = `${p.point.y + 12}px`
    })

    // ResizeObserver for width tracking.
    const ro = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return
      chart.applyOptions({ width: entry.contentRect.width })
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      chart.remove()
      tip.remove()
      container.style.position = prevPosition
      chartRef.current = null
    }
  }, [portfolio, benchmark, height])

  return (
    <div
      ref={containerRef}
      data-testid="equity-curve-chart"
      className={cn('w-full', className)}
      style={{ height }}
    />
  )
}

'use client'

/**
 * AnnualReturnsChart — TradingView Lightweight Charts v5 Histogram.
 *
 * Renders annual portfolio returns (+ optional benchmark) as bars. When the
 * benchmark is shown, we render TWO stacked Histogram charts (recommendation
 * (a) in RESEARCH §Pattern 3 lines 467-478) rather than overlay or
 * time-offset tricks — side-by-side at the same time index isn't natively
 * supported and stacked is the most readable option in v1.
 *
 * Conventions (CONTEXT decisions):
 *   D-04  Annual bars sit below the metrics strip in the results panel.
 *   D-11  lightweight-charts v5 only — Histogram series, no other lib.
 *   D-12  No brush/marker; crosshair only (chart-default).
 *
 * v5 API:
 *   - chart.addSeries(HistogramSeries, opts)
 *   - priceFormat.type = 'percent' for the axis labels
 *   - priceScaleId: '' overlay + scaleMargins { top:.1, bottom:.1 }
 *
 * Year → Time encoding: lightweight-charts accepts ISO date strings as Time.
 * We map year N → '{N}-01-02' (a stable non-weekend day) so bars align on
 * year boundaries and the time-axis displays the year cleanly.
 *
 * See:
 *   - .planning/phases/05-backtesting-engine/05-RESEARCH.md §Pattern 3 (lines 459-481)
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §AnnualReturnsChart
 */
import { useLayoutEffect, useRef } from 'react'
import {
  createChart,
  HistogramSeries,
  type IChartApi,
  type Time,
} from 'lightweight-charts'
import { cn } from '@/lib/utils'
import type { AnnualBar } from '@/lib/backtest/types'

const PORTFOLIO_COLOR = '#E3000F' // Swiss red
const BENCHMARK_COLOR = '#999'

type AnnualReturnsChartProps = {
  bars: AnnualBar[]
  showBenchmark: boolean
  height?: number
  className?: string
}

function yearToTime(year: number): Time {
  return `${year}-01-02` as Time
}

function buildHistogramChart(
  container: HTMLDivElement,
  height: number,
  color: string,
  data: { year: number; value: number }[],
): IChartApi {
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
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
    crosshair: { mode: 1 },
    autoSize: false,
  })

  const series = chart.addSeries(HistogramSeries, {
    color,
    priceFormat: { type: 'percent', precision: 2, minMove: 0.0001 },
    priceScaleId: '',
    priceLineVisible: false,
  })
  series.priceScale().applyOptions({
    scaleMargins: { top: 0.1, bottom: 0.1 },
  })

  series.setData(
    data.map(d => ({
      time: yearToTime(d.year),
      // priceFormat: 'percent' multiplies by 100 internally — pass the
      // decimal return (0.123 displays as "12.30%").
      value: d.value,
      color: d.value < 0
        ? // Slightly desaturate negatives so they read as "loss" but stay
          // distinguishable from the benchmark in the lower chart.
          color === PORTFOLIO_COLOR
            ? '#B30009'
            : '#666'
        : color,
    })),
  )

  chart.timeScale().fitContent()
  return chart
}

export function AnnualReturnsChart({
  bars,
  showBenchmark,
  height = 200,
  className,
}: AnnualReturnsChartProps) {
  const portfolioContainerRef = useRef<HTMLDivElement>(null)
  const benchmarkContainerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const pContainer = portfolioContainerRef.current
    if (!pContainer) return

    const portfolioData = bars.map(b => ({ year: b.year, value: b.portfolio }))
    const pChart = buildHistogramChart(pContainer, height, PORTFOLIO_COLOR, portfolioData)

    let bChart: IChartApi | null = null
    let bContainer: HTMLDivElement | null = null
    if (showBenchmark) {
      bContainer = benchmarkContainerRef.current
      if (bContainer) {
        const benchmarkData = bars
          .filter((b): b is AnnualBar & { benchmark: number } => b.benchmark !== null)
          .map(b => ({ year: b.year, value: b.benchmark }))
        bChart = buildHistogramChart(bContainer, height, BENCHMARK_COLOR, benchmarkData)
      }
    }

    // Shared ResizeObserver — track BOTH containers so each chart's width
    // tracks its own container (they live in separate divs but the page
    // layout may resize them simultaneously).
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === pContainer) {
          pChart.applyOptions({ width: entry.contentRect.width })
        } else if (bChart && bContainer && entry.target === bContainer) {
          bChart.applyOptions({ width: entry.contentRect.width })
        }
      }
    })
    ro.observe(pContainer)
    if (bChart && bContainer) ro.observe(bContainer)

    return () => {
      ro.disconnect()
      pChart.remove()
      bChart?.remove()
    }
  }, [bars, showBenchmark, height])

  return (
    <div
      data-testid="annual-returns-chart"
      className={cn('w-full space-y-3', className)}
    >
      <div className="space-y-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Portfolio
        </div>
        <div
          ref={portfolioContainerRef}
          data-testid="annual-returns-chart-portfolio"
          className="w-full"
          style={{ height }}
        />
      </div>
      {showBenchmark && (
        <div className="space-y-1">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Benchmark
          </div>
          <div
            ref={benchmarkContainerRef}
            data-testid="annual-returns-chart-benchmark"
            className="w-full"
            style={{ height }}
          />
        </div>
      )}
    </div>
  )
}

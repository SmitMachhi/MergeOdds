import type { ReactNode } from "react"
import { type ChartConfig, CommonChartContext } from "./common-context"
import { PieCanvas } from "./pie-canvas"
import { PieContext, sliceAtAngle, usePieState } from "./pie-context"
import { useChartDimensions } from "./use-chart-dimensions"

const MARGINS = { top: 22, right: 14, bottom: 14, left: 14 }

/**
 * Dithered donut chart: one slice per row of `data`, sized by `dataKey` and named by `nameKey` (looked up in
 * `config` for its colour). `innerRadius` is the hole's share of the radius. Put `<Tooltip>` inside.
 */
export function PieChart({ data, config, dataKey, nameKey, innerRadius, children }: {
  data: object[]; config: ChartConfig; dataKey: string; nameKey: string; innerRadius: number; children: ReactNode
}) {
  const { ref, size } = useChartDimensions<HTMLDivElement>()
  // Safe: the chart only reads row[dataKey] and row[nameKey].
  const ctx = usePieState(data as Record<string, unknown>[], config, dataKey, nameKey, innerRadius, size, MARGINS)

  const onMove = (clientX: number, clientY: number) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dx = clientX - rect.left - MARGINS.left - ctx.center.x
    const dy = clientY - rect.top - MARGINS.top - ctx.center.y
    const r = Math.hypot(dx, dy)
    const i = r <= ctx.outerRadius && r >= ctx.innerRadius ? sliceAtAngle(ctx.pie, Math.atan2(dy, dx)) : -1
    ctx.setHoverIndex(i >= 0 ? i : null)
    ctx.setCursor(clientX - rect.left, clientY - rect.top)
  }

  return (
    <PieContext value={ctx}>
      <CommonChartContext value={ctx.common}>
        <div
          ref={ref}
          className="relative h-full w-full"
          onPointerEnter={() => ctx.setMouseInChart(true)}
          onPointerMove={(e) => onMove(e.clientX, e.clientY)}
          onPointerLeave={() => {
            ctx.setMouseInChart(false)
            ctx.setHoverIndex(null)
          }}
        >
          <PieCanvas />
          {/* gives the chart its accessible name, as the bar chart's axes layer does */}
          {ctx.ready && <svg width={size.width} height={size.height} className="absolute inset-0" role="img" aria-label="Chart" />}
          {children}
        </div>
      </CommonChartContext>
    </PieContext>
  )
}

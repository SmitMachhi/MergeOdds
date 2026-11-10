import { Children, isValidElement, type ReactNode } from "react"
import { BarCanvas } from "./bar-canvas"
import { BarContext, useBarState } from "./bar-context"
import { type ChartConfig, CommonChartContext } from "./common-context"
import { useChartDimensions } from "./use-chart-dimensions"

const MARGINS = { top: 10, right: 12, bottom: 22, left: 36 }

/** DOM parts (`<Legend>`, `<Tooltip>`) set `chartLayer = "dom"`; the axes draw into the SVG on top of the canvas. */
const isDom = (node: ReactNode) => isValidElement(node) && typeof node.type !== "string" && (node.type as { chartLayer?: string }).chartLayer === "dom"

/**
 * Dithered bar chart, one stacked bar per row: each key in `config` is one series. Compose `<XAxis>`, `<YAxis>`,
 * `<Legend>` and `<Tooltip>` inside. Bars grow in a left-to-right wave, unless the visitor asks for reduced motion.
 */
export function BarChart({ data, config, children }: { data: object[]; config: ChartConfig; children: ReactNode }) {
  const { ref, size } = useChartDimensions<HTMLDivElement>()
  // Safe: the chart only reads row[key] for the configured series keys.
  const ctx = useBarState(data as Record<string, unknown>[], config, size, MARGINS)
  const svgChildren: ReactNode[] = []
  const domChildren: ReactNode[] = []
  Children.forEach(children, (child) => (isDom(child) ? domChildren : svgChildren).push(child))

  const onMove = (clientX: number) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    ctx.setHoverIndex(ctx.indexAtX(clientX - rect.left - MARGINS.left))
    ctx.setCursorX(clientX - rect.left)
  }

  return (
    <BarContext value={ctx}>
      <CommonChartContext value={ctx.common}>
        <div
          ref={ref}
          className="relative h-full w-full"
          onPointerEnter={() => ctx.setMouseInChart(true)}
          onPointerMove={(e) => onMove(e.clientX)}
          onPointerLeave={() => {
            ctx.setMouseInChart(false)
            ctx.setHoverIndex(null)
          }}
        >
          <BarCanvas />
          {ctx.ready && (
            <svg width={size.width} height={size.height} className="absolute inset-0 overflow-visible" role="img" aria-label="Chart">
              <g transform={`translate(${MARGINS.left},${MARGINS.top})`}>{svgChildren}</g>
            </svg>
          )}
          {domChildren}
        </div>
      </CommonChartContext>
    </BarContext>
  )
}

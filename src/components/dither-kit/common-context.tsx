import { createContext, use } from "react"
import type { Texture } from "./dither-paint"
import type { DitherColor, Seed } from "./palette"

/** Each series (bar chart) or slice (pie chart): its label and colour. Bars also take a texture, "gradient" by default. */
export type ChartConfig = Record<string, { label?: string; color: DitherColor; texture?: Texture }>

export type Margins = { top: number; right: number; bottom: number; left: number }

/** One tooltip row: one series (bar chart) or one slice (pie chart). */
export type TooltipItem = { name: string; label: string; value: number; seed: Seed }

/** What `<Legend>` and `<Tooltip>` read, so both work the same in the bar chart and the pie chart. */
export type CommonChart = {
  names: string[] // legend entries: series keys (bar) or slice names (pie)
  labelOf: (name: string) => string
  seedOf: (name: string) => Seed
  hoverIndex: number | null
  heading: (index: number, labelKey?: string) => string | null
  itemsAt: (index: number) => TooltipItem[]
  ready: boolean
  tooltipLeft: number // clamped px for the floating tooltip
  tooltipTop: number // px: follows the hovered bar (bar) or the cursor (pie)
}

export const CommonChartContext = createContext<CommonChart | null>(null)

export function useCommonChart() {
  const ctx = use(CommonChartContext)
  if (!ctx) throw new Error("<Legend /> and <Tooltip /> must be used within a chart.")
  return ctx
}

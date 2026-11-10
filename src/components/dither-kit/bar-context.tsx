import type { ScaleLinear } from "d3-scale"
import { createContext, use, useState } from "react"
import type { ChartConfig, CommonChart, Margins } from "./common-context"
import { type Seed, seedOfColor } from "./palette"
import { buildBandScale, buildYScale, computeBands, indexAtBand } from "./scales"

type Row = Record<string, unknown>

/** Everything the bar chart's parts read: the data, the geometry and the hover state. */
export type BarContextValue = {
  config: ChartConfig
  configKeys: string[] // series order: drives stacking and the legend
  data: Row[]
  margins: Margins
  plot: { width: number; height: number } // inner drawing area
  ready: boolean // true once measured
  xCenter: (index: number) => number // category centre px within the plot
  indexAtX: (px: number) => number // the category under a pointer x
  barSlot: (index: number) => { x: number; width: number } // bar geometry in plot px
  y: ScaleLinear<number, number> // value → px within the plot
  bands: Record<string, [number, number][]> // per-series [y0, y1] per row
  hoverIndex: number | null
  setHoverIndex: (index: number | null) => void
  setCursorX: (px: number) => void
  isMouseInChart: boolean
  setMouseInChart: (over: boolean) => void
  seedOf: (key: string) => Seed
  common: CommonChart // what <Legend> and <Tooltip> read
}

export const BarContext = createContext<BarContextValue | null>(null)

export function useBarChart() {
  const ctx = use(BarContext)
  if (!ctx) throw new Error("Bar chart parts must be used within <BarChart />.")
  return ctx
}

/** The bar chart's state for one measured size: scales, stacked bands and hover. */
export function useBarState(data: Row[], config: ChartConfig, size: { width: number; height: number }, margins: Margins): BarContextValue {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [cursorX, setCursorX] = useState(0)
  const [isMouseInChart, setMouseInChart] = useState(false)

  const configKeys = Object.keys(config)
  const width = Math.max(0, size.width - margins.left - margins.right)
  const height = Math.max(0, size.height - margins.top - margins.bottom)
  const ready = width > 0 && height > 0
  const { bands, max, min } = computeBands(data, configKeys)
  const xBand = buildBandScale(data.length, width)
  const y = buildYScale(min, max, height)
  const xCenter = (i: number) => (xBand(i) ?? 0) + xBand.bandwidth() / 2
  // stacked bars share their category's full slot, less a little air on each side
  const barSlot = (i: number) => {
    const w = xBand.bandwidth() * 0.9
    return { x: xCenter(i) - w / 2, width: w }
  }
  const seedOf = (key: string) => seedOfColor(config[key]?.color ?? "grey")

  // Follow the top of the hovered stack, with enough headroom that the card above it never clips the top.
  let tooltipTop = margins.top + 44
  if (hoverIndex != null) {
    const tops = configKeys.map((k) => bands[k]?.[hoverIndex]).filter((b) => b).map((b) => y(b[1]))
    if (tops.length) tooltipTop = Math.max(tooltipTop, margins.top + Math.min(...tops))
  }
  const common: CommonChart = {
    names: configKeys,
    labelOf: (n) => config[n]?.label ?? n,
    seedOf,
    hoverIndex,
    ready,
    tooltipLeft: Math.max(48, Math.min(width + margins.left - 48, cursorX)),
    tooltipTop,
    heading: (i, labelKey) => (labelKey ? String(data[i]?.[labelKey] ?? "") : null),
    itemsAt: (i) =>
      configKeys.map((name) => {
        const raw = data[i]?.[name]
        return { name, label: config[name]?.label ?? name, value: typeof raw === "number" ? raw : 0, seed: seedOf(name) }
      }),
  }

  return {
    config, configKeys, data, margins, plot: { width, height }, ready, xCenter,
    indexAtX: (px) => indexAtBand(px, data.length, width),
    barSlot, y, bands, hoverIndex, setHoverIndex, setCursorX, isMouseInChart, setMouseInChart, seedOf, common,
  }
}

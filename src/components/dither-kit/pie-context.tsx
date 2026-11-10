import { createContext, use, useState } from "react"
import type { ChartConfig, CommonChart, Margins } from "./common-context"
import { type Seed, seedOfColor } from "./palette"

type Row = Record<string, unknown>

const TOP = -Math.PI / 2
const TAU = Math.PI * 2

export type PieSlice = { name: string; value: number; start: number; end: number } // angles in radians

/** Slice angles from each row's value under `dataKey`, named by `nameKey`, clockwise from the top. */
function pieSlices(data: Row[], dataKey: string, nameKey: string): PieSlice[] {
  const vals = data.map((r) => Math.max(0, Number(r[dataKey]) || 0))
  const total = vals.reduce((a, b) => a + b, 0) || 1
  let a = TOP
  return data.map((r, i) => {
    const span = (vals[i] / total) * TAU
    const slice = { name: String(r[nameKey] ?? i), value: vals[i], start: a, end: a + span }
    a += span
    return slice
  })
}

/** Which slice a pointer angle falls in, or -1. */
export function sliceAtAngle(slices: PieSlice[], angle: number): number {
  // Normalize so comparisons against [start, end), which begin at TOP, work.
  let a = angle
  while (a < TOP) a += TAU
  while (a >= TOP + TAU) a -= TAU
  return slices.findIndex((s) => a >= s.start && a < s.end)
}

/** Everything the pie chart's parts read: the slices, the geometry and the hover state. */
export type PieContextValue = {
  margins: Margins
  plot: { width: number; height: number }
  ready: boolean
  pie: PieSlice[]
  center: { x: number; y: number }
  outerRadius: number
  innerRadius: number
  hoverIndex: number | null
  setHoverIndex: (i: number | null) => void
  setCursor: (px: number, py: number) => void
  isMouseInChart: boolean
  setMouseInChart: (over: boolean) => void
  seedOf: (key: string) => Seed
  common: CommonChart
}

export const PieContext = createContext<PieContextValue | null>(null)

export function usePieChart() {
  const ctx = use(PieContext)
  if (!ctx) throw new Error("Pie chart parts must be used within <PieChart />.")
  return ctx
}

/** The donut's state for one measured size. `innerRatio` is the hole's share of the radius. */
export function usePieState(
  data: Row[], config: ChartConfig, dataKey: string, nameKey: string, innerRatio: number,
  size: { width: number; height: number }, margins: Margins,
): PieContextValue {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [cursor, setCursorXY] = useState({ x: 0, y: 0 })
  const [isMouseInChart, setMouseInChart] = useState(false)

  const width = Math.max(0, size.width - margins.left - margins.right)
  const height = Math.max(0, size.height - margins.top - margins.bottom)
  const outerRadius = Math.max(0, Math.min(width, height) / 2 - 6)
  const pie = pieSlices(data, dataKey, nameKey)
  const seedOf = (key: string) => seedOfColor(config[key]?.color ?? "grey")
  const labelOf = (n: string) => config[n]?.label ?? n
  const common: CommonChart = {
    names: pie.map((s) => s.name),
    labelOf,
    seedOf,
    hoverIndex,
    ready: width > 0 && height > 0,
    tooltipLeft: Math.max(48, Math.min(width + margins.left - 48, cursor.x)),
    tooltipTop: Math.max(margins.top + 44, cursor.y),
    heading: (i) => pie[i]?.name ?? null,
    itemsAt: (i) => (pie[i] ? [{ name: pie[i].name, label: labelOf(pie[i].name), value: pie[i].value, seed: seedOf(pie[i].name) }] : []),
  }
  return {
    margins, plot: { width, height }, ready: common.ready, pie, center: { x: width / 2, y: height / 2 },
    outerRadius, innerRadius: outerRadius * innerRatio, hoverIndex, setHoverIndex,
    setCursor: (x, y) => setCursorXY({ x, y }), isMouseInChart, setMouseInChart, seedOf, common,
  }
}

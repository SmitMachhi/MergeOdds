import { scaleBand, scaleLinear } from "d3-scale"
import { stack as d3Stack } from "d3-shape"

type Row = Record<string, unknown>

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)

/**
 * Per-series [y0, y1] bands for every row, with the series stacked on top of each other by d3's stack layout.
 * `max`/`min` bound the value range for the y-scale.
 */
export function computeBands(data: Row[], keys: string[]): { bands: Record<string, [number, number][]>; max: number; min: number } {
  const series = d3Stack<Row>().keys(keys).value((row, key) => num(row[key]))(data)
  const bands: Record<string, [number, number][]> = {}
  let max = 0
  let min = 0
  series.forEach((layer) => {
    bands[layer.key] = layer.map((point) => {
      if (point[1] > max) max = point[1]
      if (point[0] < min) min = point[0]
      return [point[0], point[1]]
    })
  })
  const flat = max === 0 && min === 0
  return { bands, max: flat ? 1 : max, min }
}

/** Banded x for bar categories: each index owns a slot of `bandwidth` width. */
export function buildBandScale(length: number, plotWidth: number) {
  return scaleBand<number>()
    .domain(Array.from({ length }, (_, i) => i))
    .range([0, plotWidth])
    .paddingInner(0.28)
    .paddingOuter(0.18)
}

/** Index of the category whose band a horizontal pixel offset falls in. */
export function indexAtBand(px: number, length: number, plotWidth: number) {
  if (length <= 0 || plotWidth <= 0) return 0
  const t = Math.max(0, Math.min(0.999, px / plotWidth))
  return Math.min(length - 1, Math.floor(t * length))
}

/** value → vertical pixel. The domain always includes zero, so the plot bottom is the floor. */
export function buildYScale(min: number, max: number, plotHeight: number) {
  const lo = Math.min(0, min)
  const hi = Math.max(0, max)
  // Guard a zero-width domain so `nice()` and the range map stay finite when every value is zero.
  return scaleLinear()
    .domain([lo, hi === lo ? lo + 1 : hi])
    .nice()
    .range([plotHeight, 0])
}

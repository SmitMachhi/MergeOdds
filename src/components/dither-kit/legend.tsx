import { useCommonChart } from "./common-context"
import { rgb } from "./palette"

/** The series names and colours, pinned to the top right of the plot. Best for two or three entries. */
export function Legend() {
  const chart = useCommonChart()
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap justify-end gap-3 px-1">
      {chart.names.map((name) => (
        <span key={name} className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <span className="size-2 rounded-[1px]" style={{ backgroundColor: rgb(chart.seedOf(name).fill) }} />
          {chart.labelOf(name)}
        </span>
      ))}
    </div>
  )
}

Legend.chartLayer = "dom" as const

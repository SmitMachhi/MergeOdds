import { useBarChart } from "./bar-context"

/** Four value labels up the left side of the bars. */
export function YAxis() {
  const ctx = useBarChart()
  if (!ctx.ready) return null
  return (
    <g className="fill-current font-mono text-[10px] text-muted-foreground">
      {ctx.y.ticks(4).map((t) => (
        <text key={t} x={-8} y={ctx.y(t)} textAnchor="end" dominantBaseline="central" fill="currentColor">
          {t}
        </text>
      ))}
    </g>
  )
}

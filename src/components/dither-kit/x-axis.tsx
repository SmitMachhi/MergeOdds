import { useBarChart } from "./bar-context"

/** Category labels under the bars, from each row's `dataKey`. Shows at most `maxTicks` of them, evenly spaced. */
export function XAxis({ dataKey, maxTicks = 8 }: { dataKey: string; maxTicks?: number }) {
  const ctx = useBarChart()
  if (!ctx.ready) return null
  const step = Math.max(1, Math.ceil(ctx.data.length / maxTicks))
  return (
    <g className="fill-current font-mono text-[10px] text-muted-foreground">
      {ctx.data.map((row, i) =>
        i % step !== 0 ? null : (
          // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable x position
          <text key={i} x={ctx.xCenter(i)} y={ctx.plot.height + 8} textAnchor="middle" dominantBaseline="hanging" fill="currentColor">
            {String(row[dataKey] ?? "")}
          </text>
        ),
      )}
    </g>
  )
}

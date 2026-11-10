import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { useCommonChart } from "./common-context"
import { rgb } from "./palette"

/**
 * Floating hover tooltip, for the bar chart and the pie chart. It glides between points and fades in and out
 * instead of snapping. `labelKey` names the row field the bar chart shows as its heading.
 */
export function Tooltip({ labelKey }: { labelKey?: string }) {
  const chart = useCommonChart()
  const show = chart.ready && chart.hoverIndex != null

  // Retain the last hovered index so the card keeps its content while fading
  // out — adjust-state-during-render (no refs in render).
  const [lastIndex, setLastIndex] = useState(0)
  if (chart.hoverIndex != null && chart.hoverIndex !== lastIndex) {
    setLastIndex(chart.hoverIndex)
  }
  const index = chart.hoverIndex ?? lastIndex
  const heading = chart.heading(index, labelKey)
  const items = chart.itemsAt(index)
  const at = { x: "-50%", y: "-115%", top: chart.tooltipTop, left: chart.tooltipLeft }

  return (
    <AnimatePresence>
      {show && items.length > 0 && (
        <motion.div
          key="dither-tooltip"
          initial={{ opacity: 0, ...at }}
          animate={{ opacity: 1, ...at }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.6 }}
          className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2 py-1 shadow-sm"
        >
          {heading && <div className="mb-0.5 font-mono text-[10px] text-muted-foreground">{heading}</div>}
          <div className="flex flex-col gap-0.5">
            {items.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5 font-mono text-[11px] text-popover-foreground tabular-nums">
                <span className="size-2 rounded-[1px]" style={{ backgroundColor: rgb(item.seed.fill) }} />
                <span className="text-muted-foreground">{item.label}</span>
                <span className="ml-auto pl-2 text-foreground">{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

Tooltip.chartLayer = "dom" as const

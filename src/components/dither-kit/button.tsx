import { type ComponentProps, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { BAYER, clamp01, prefersReducedMotion } from "./dither-paint"
import { type DitherColor, PALETTE, rgb } from "./palette"

const CELL = 2 // css px per dither cell — same chunk as the charts

/**
 * Paint one frame of the button fill: the ordered dither, dense at the bottom and dissolving upward, capped by
 * a soft outline. `intensity` (0 rest, 1 hover, about 1.5 pressed) lifts density and alpha, as the charts do.
 */
function paintButton(ctx: CanvasRenderingContext2D, cols: number, rows: number, fill: [number, number, number], intensity: number) {
  ctx.clearRect(0, 0, cols, rows)
  for (let y = 0; y < rows; y++) {
    const density = 0.25 + 0.75 * ((y + 0.5) / rows)
    for (let x = 0; x < cols; x++) {
      const lit = density > BAYER[y & 3][x & 3] - 0.1 * intensity
      const k = (0.3 + density * 0.7) * (1 + 0.22 * intensity)
      ctx.fillStyle = rgb(fill, 1, clamp01(lit ? k : k * 0.4))
      ctx.fillRect(x, y, 1, 1)
    }
  }
  // Soft outline in the fill colour, brightening a touch on hover.
  ctx.fillStyle = rgb(fill, 1, clamp01(0.5 + 0.25 * intensity))
  ctx.fillRect(0, 0, cols, 1)
  ctx.fillRect(0, rows - 1, cols, 1)
  ctx.fillRect(0, 0, 1, rows)
  ctx.fillRect(cols - 1, 0, 1, rows)
}

/**
 * A native `<button>` whose background is the charts' dither fill on a low-res canvas. Hover eases the dither
 * denser and brighter; pressing lifts it further. With reduced motion it jumps instead of easing.
 */
export function DitherButton({ color = "blue", className, children, ...props }: ComponentProps<"button"> & { color?: DitherColor }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const button = buttonRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!button || !canvas || !ctx) return
    const fill = PALETTE[color].fill
    const reduce = prefersReducedMotion()
    let cols = 0
    let rows = 0
    let intensity = 0
    let target = 0
    let hovered = false
    let raf = 0

    const paint = () => paintButton(ctx, cols, rows, fill, intensity)
    const tick = () => {
      const d = target - intensity
      if (Math.abs(d) < 0.01) {
        intensity = target
        paint()
        raf = 0
        return
      }
      intensity += d * 0.16
      paint()
      raf = requestAnimationFrame(tick)
    }
    // Ease toward the new lift target. The loop only runs while settling.
    const setTarget = (t: number) => {
      target = t
      if (reduce) {
        intensity = t
        paint()
      } else if (!raf) {
        raf = requestAnimationFrame(tick)
      }
    }
    const resize = () => {
      const box = button.getBoundingClientRect()
      cols = Math.max(4, Math.round(box.width / CELL))
      rows = Math.max(4, Math.round(box.height / CELL))
      canvas.width = cols
      canvas.height = rows
      paint()
    }
    resize()

    const enter = () => {
      hovered = true
      setTarget(1)
    }
    const leave = () => {
      hovered = false
      setTarget(0)
    }
    const down = () => setTarget(1.5)
    const up = () => setTarget(hovered ? 1 : 0)
    button.addEventListener("pointerenter", enter)
    button.addEventListener("pointerleave", leave)
    button.addEventListener("pointerdown", down)
    button.addEventListener("pointerup", up)
    button.addEventListener("pointercancel", up)
    const ro = new ResizeObserver(resize)
    ro.observe(button)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      button.removeEventListener("pointerenter", enter)
      button.removeEventListener("pointerleave", leave)
      button.removeEventListener("pointerdown", down)
      button.removeEventListener("pointerup", up)
      button.removeEventListener("pointercancel", up)
      ro.disconnect()
    }
  }, [color])

  return (
    <button
      ref={buttonRef}
      type="button"
      className={cn(
        "relative isolate overflow-hidden rounded-md px-4 py-2 font-mono text-xs text-foreground transition-opacity focus-visible:ring-1 focus-visible:ring-foreground/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 -z-10 h-full w-full" style={{ imageRendering: "pixelated" }} />
      <span className="relative">{children}</span>
    </button>
  )
}

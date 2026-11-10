import { useEffect, useRef } from "react"
import { BAYER } from "./dither-paint"
import { type DitherColor, PALETTE, rgb } from "./palette"

const CELL = 3 // css px per dither cell
// Backing-resolution caps — a background wash never needs more cells than this.
const MAX_COLS = 960
const MAX_ROWS = 600

/**
 * Paint the ordered-dither ramp onto a low-res backing canvas sized from the
 * wrapper's box: solid `color` at the bottom, dissolving to transparent at the
 * top. Static — one paint per prop/size change, no animation loop.
 */
function paintGradient(canvas: HTMLCanvasElement, width: number, height: number, color: DitherColor, opacity: number) {
  const ctx = canvas.getContext("2d")
  if (!ctx || width <= 0 || height <= 0) return
  const cols = Math.min(MAX_COLS, Math.max(4, Math.round(width / CELL)))
  const rows = Math.min(MAX_ROWS, Math.max(4, Math.round(height / CELL)))
  canvas.width = cols
  canvas.height = rows
  const fill = PALETTE[color].fill
  for (let y = 0; y < rows; y++) {
    const density = (y + 0.5) / rows
    for (let x = 0; x < cols; x++) {
      // Lit cells carry the ramp, off cells keep a faint tint that also fades out, so the falloff reads smooth.
      const lit = density > BAYER[y & 3][x & 3]
      const alpha = (lit ? 0.35 + 0.65 * density : 0.12 * density) * opacity
      if (alpha <= 0.004) continue
      ctx.fillStyle = rgb(fill, 1, alpha)
      ctx.fillRect(x, y, 1, 1)
    }
  }
}

/** Dithered wash that rises from the bottom edge and fills its nearest positioned ancestor. */
export function DitherGradient({ from, opacity = 1 }: { from: DitherColor; opacity?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const paint = () => {
      const box = wrap.getBoundingClientRect()
      paintGradient(canvas, box.width, box.height, from, opacity)
    }
    paint()
    const ro = new ResizeObserver(paint)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [from, opacity])

  return (
    <div ref={wrapRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
    </div>
  )
}

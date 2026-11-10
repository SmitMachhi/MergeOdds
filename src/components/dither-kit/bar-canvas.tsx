import { useEffect, useMemo, useRef } from "react"
import { useBarChart } from "./bar-context"
import { BLOOM, backingSize, clamp01, easeOutCubic, paintColumn, prefersReducedMotion } from "./dither-paint"

type Bars = { top: number[]; base: number[] } // per data index, in backing rows

const DURATION = 900 // ms for the entrance wave
// Fraction of the timeline spent staggering bar starts — the rest is each bar's
// own grow window, so the rise sweeps across the chart as a wave.
const STAGGER = 0.55

/**
 * Dither canvas for the stacked bar chart. Every bar is filled with the shared {@link paintColumn} ordered dither.
 * Bars grow up from their base in a staggered left-to-right wave (eased), and the hovered category lifts while
 * the rest dim. A blurred copy on a second canvas gives the glow.
 */
export function BarCanvas() {
  const ctx = useBarChart()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bloomRef = useRef<HTMLCanvasElement>(null)

  const { width, height } = ctx.plot
  const { cols, rows } = backingSize(width, height)
  const { ready, configKeys, bands, y } = ctx

  // Per-series bar tops and bases, in backing rows, over the data indices.
  const targets = useMemo(() => {
    const out: Record<string, Bars> = {}
    if (!ready) return out
    const h = height || 1
    for (const key of configKeys) {
      const band = bands[key]
      if (!band) continue
      out[key] = {
        top: band.map((b) => (y(b[1]) / h) * (rows - 1)),
        base: band.map((b) => (y(b[0]) / h) * (rows - 1)),
      }
    }
    return out
  }, [ready, configKeys, bands, y, height, rows])

  // The RAF loop reads these through refs so it always sees the latest values;
  // refs are written in an effect (never during render) — mutating a ref
  // mid-render tears under Strict Mode / concurrent rendering.
  const state = useRef(ctx)
  const targetsRef = useRef(targets)
  useEffect(() => {
    state.current = ctx
    targetsRef.current = targets
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const c = canvas?.getContext("2d")
    const bloomCanvas = bloomRef.current
    const bloomCtx = bloomCanvas?.getContext("2d")
    if (!(canvas && c && bloomCanvas && bloomCtx) || cols <= 0 || rows <= 0) return
    canvas.width = bloomCanvas.width = cols
    canvas.height = bloomCanvas.height = rows

    const reduce = prefersReducedMotion()
    const fx = cols / Math.max(width, 1)

    // Eased grow factor for bar `i` at global progress `prog`.
    const barProgress = (i: number, len: number, prog: number) => {
      if (reduce) return 1
      const start = len > 1 ? (i / (len - 1)) * STAGGER : 0
      return easeOutCubic(clamp01((prog - start) / (1 - STAGGER)))
    }

    const paint = (prog: number) => {
      const s = state.current
      c.clearRect(0, 0, cols, rows)
      for (const key of s.configKeys) {
        const t = targetsRef.current[key]
        if (!t) continue
        const seed = s.seedOf(key)
        const variant = s.config[key]?.texture ?? "gradient"
        for (let i = 0; i < s.data.length; i++) {
          const bp = barProgress(i, s.data.length, prog)
          const base = t.base[i] ?? rows - 1
          const grown = base + ((t.top[i] ?? base) - base) * bp
          // paintColumn wants the higher edge first, so order the pair.
          const top = Math.min(grown, base)
          const bottom = Math.max(grown, base)
          const active = s.hoverIndex === i
          const dim = s.hoverIndex != null && !active && s.isMouseInChart ? 0.5 : 1
          const slot = s.barSlot(i)
          const c0 = Math.round(slot.x * fx)
          const c1 = Math.round((slot.x + slot.width) * fx)
          for (let x = c0; x < c1; x++) {
            paintColumn(c, x, top, bottom, seed, { variant, intensity: intensity + (active ? 0.4 : 0), dim, stacked: true })
          }
        }
      }
    }

    let raf = 0
    let animStart = 0
    let lastProg = -1
    let intensity = 0
    let needsFill = true
    let lastHover: number | null | undefined = Symbol() as never

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const s = state.current
      if (!s.ready) return
      bloomCtx.clearRect(0, 0, cols, rows)
      bloomCtx.drawImage(canvas, 0, 0)
      if (!animStart) animStart = now
      const prog = reduce ? 1 : Math.min(1, (now - animStart) / DURATION)
      if (prog !== lastProg) {
        lastProg = prog
        needsFill = true
      }
      if (s.hoverIndex !== lastHover) {
        lastHover = s.hoverIndex
        needsFill = true
      }
      const target = s.isMouseInChart ? 1 : 0
      if (Math.abs(intensity - target) > 0.001) {
        intensity += (target - intensity) * (reduce ? 1 : 0.16)
        needsFill = true
      } else intensity = target
      if (!needsFill) return
      paint(prog)
      needsFill = false
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [cols, rows, width])

  const pos = { left: ctx.margins.left, top: ctx.margins.top, width, height } as const
  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none absolute" style={{ ...pos, imageRendering: "pixelated" }} />
      <canvas ref={bloomRef} className="pointer-events-none absolute" style={{ ...pos, transition: "opacity 220ms ease", ...BLOOM }} />
    </>
  )
}

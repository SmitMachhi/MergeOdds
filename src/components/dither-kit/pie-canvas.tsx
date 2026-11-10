import { useEffect, useRef } from "react"
import { BAYER, BLOOM, backingSize, easeInOutCubic, OFF_TIER, prefersReducedMotion } from "./dither-paint"
import { rgb } from "./palette"
import { sliceAtAngle, usePieChart } from "./pie-context"

const TOP = -Math.PI / 2
const TAU = Math.PI * 2
const POP = 6 // px the hovered slice bulges outward
const DURATION = 900 // ms for the entrance sweep

/**
 * Dither canvas for the donut. Each backing pixel is mapped back to plot space, tested for its slice by angle,
 * and filled with the ordered-dither scatter, dense at the outer edge and thinning toward the centre, capped by
 * a bright arc on the rim. The ring sweeps in clockwise on mount; the hovered slice bulges outward.
 */
export function PieCanvas() {
  const ctx = usePieChart()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bloomRef = useRef<HTMLCanvasElement>(null)

  const { width, height } = ctx.plot
  const { cols, rows } = backingSize(width, height)

  // The RAF loop reads the latest ctx through a ref; written in an effect
  // (never during render) — mutating a ref mid-render tears under Strict Mode /
  // concurrent rendering.
  const state = useRef(ctx)
  useEffect(() => {
    state.current = ctx
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
    let raf = 0
    let animStart = 0
    let lastProg = -1
    let intensity = 0
    let popEase = 0 // eases the hovered slice's outward bulge
    let needsFill = true
    let lastHover: number | null | undefined = Symbol() as never

    const paint = (prog: number) => {
      const s = state.current
      c.clearRect(0, 0, cols, rows)
      const revealAngle = TOP + easeInOutCubic(prog) * TAU
      for (let y = 0; y < rows; y++) {
        const py = ((y + 0.5) * height) / rows
        for (let x = 0; x < cols; x++) {
          const px = ((x + 0.5) * width) / cols
          const dx = px - s.center.x
          const dy = py - s.center.y
          const r = Math.hypot(dx, dy)
          if (r < s.innerRadius) continue
          const angle = Math.atan2(dy, dx)
          let na = angle
          while (na < TOP) na += TAU
          while (na >= TOP + TAU) na -= TAU
          if (na > revealAngle) continue // clockwise sweep-in
          const si = sliceAtAngle(s.pie, angle)
          if (si < 0) continue
          const active = s.hoverIndex === si
          const outer = active ? s.outerRadius + POP * popEase : s.outerRadius
          if (r > outer) continue
          const seed = s.seedOf(s.pie[si].name)
          // Bright rim on the outer edge, thicker on the hovered slice.
          if (outer - r < (active ? 1.4 + popEase : 1.4)) {
            c.fillStyle = rgb(seed.fill, 1, 1)
            c.fillRect(x, y, 1, 1)
            continue
          }
          const it = intensity + (active ? 0.4 * popEase : 0)
          const density = (r - s.innerRadius) / Math.max(outer - s.innerRadius, 1)
          const lit = density > BAYER[y & 3][x & 3] - 0.1 * it
          // Density → opacity; off cells drop to a faint tier, never a hole to the background.
          const k = (0.35 + density * 0.65) * (1 + 0.22 * it)
          c.fillStyle = rgb(seed.fill, 1, Math.min(1, lit ? k : k * OFF_TIER))
          c.fillRect(x, y, 1, 1)
        }
      }
    }

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const s = state.current
      if (!s.ready) return
      bloomCtx.clearRect(0, 0, cols, rows)
      bloomCtx.drawImage(canvas, 0, 0)
      if (!animStart) animStart = now
      const prog = reduce ? 1 : Math.min(1, (now - animStart) / DURATION)
      if (s.hoverIndex !== lastHover) {
        lastHover = s.hoverIndex
        popEase = 0 // a freshly hovered slice bulges out from rest
        needsFill = true
      }
      const target = s.isMouseInChart ? 1 : 0
      if (Math.abs(intensity - target) > 0.001) {
        intensity += (target - intensity) * (reduce ? 1 : 0.16)
        needsFill = true
      } else intensity = target
      // Ease the hovered slice's bulge in, and back out when nothing is hovered.
      const popTarget = s.hoverIndex != null ? 1 : 0
      if (Math.abs(popEase - popTarget) > 0.001) {
        popEase += (popTarget - popEase) * (reduce ? 1 : 0.22)
        needsFill = true
      } else popEase = popTarget
      if (prog !== lastProg) {
        lastProg = prog
        needsFill = true
      }
      if (!needsFill) return
      paint(prog)
      needsFill = false
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [cols, rows, width, height])

  const pos = { left: ctx.margins.left, top: ctx.margins.top, width, height } as const
  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none absolute" style={{ ...pos, imageRendering: "pixelated" }} />
      <canvas ref={bloomRef} className="pointer-events-none absolute" style={{ ...pos, transition: "opacity 220ms ease", ...BLOOM }} />
    </>
  )
}

import { useEffect, useRef } from "react";
import { BAYER, OFF_TIER, prefersReducedMotion, rgb, type Rgb } from "@/components/dither-kit";

// The pull request icon from GitHub Octicons (git-pull-request-16). MIT License, Copyright (c) GitHub Inc.
// Same path as public/favicon.svg.
const PR =
  "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z";
// The accent green (emerald-400), the same as the favicon and the How it works link.
const GREEN: Rgb = [0, 212, 146];
const CELL = 2; // css px per dither cell, the same chunk as the charts and the Check button
const PERIOD = 5000; // ms for one wave to climb the icon
const FRAME = 50; // ms between paints: the dither moves in steps, so 20 a second is enough

/** The app's mark, big: the pull request icon filled with green dither, and a slow wave of density climbing it.
 *  It is square, and its class sets the size. With reduced motion it paints one still frame. */
export function PrMark({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const tiers = [rgb(GREEN, 1, OFF_TIER), rgb(GREEN)]; // an "off" cell keeps a faint tint, so the shape never breaks up
    const still = prefersReducedMotion();
    let cells: number[] = []; // x, y pairs of the cells inside the icon
    let n = 0;
    let raf = 0;
    let last = 0;

    const paint = (ms: number) => {
      ctx.clearRect(0, 0, n, n);
      const shift = 0.5 + (still ? 0 : ms / PERIOD); // 0.5 alone is the still frame: thin at the top, dense lower down
      for (let tier = 0; tier < 2; tier++) {
        ctx.fillStyle = tiers[tier];
        for (let i = 0; i < cells.length; i += 2) {
          const x = cells[i];
          const y = cells[i + 1];
          const density = 0.55 + 0.45 * Math.sin(2 * Math.PI * ((y + 0.3 * x) / n + shift));
          if (+(density > BAYER[y & 3][x & 3]) === tier) ctx.fillRect(x, y, 1, 1);
        }
      }
    };

    // Draw the icon once at cell resolution and keep the cells it covers.
    const size = () => {
      n = Math.max(16, Math.round(canvas.clientWidth / CELL));
      canvas.width = canvas.height = n;
      const mask = document.createElement("canvas");
      mask.width = mask.height = n;
      const m = mask.getContext("2d");
      if (!m) return;
      m.scale(n / 16, n / 16);
      m.fill(new Path2D(PR));
      const alpha = m.getImageData(0, 0, n, n).data;
      cells = [];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (alpha[(y * n + x) * 4 + 3] > 127) cells.push(x, y);
      paint(performance.now());
    };

    const tick = (ms: number) => {
      if (ms - last >= FRAME) {
        last = ms;
        paint(ms);
      }
      raf = requestAnimationFrame(tick);
    };

    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas);
    if (!still) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} style={{ imageRendering: "pixelated" }} />;
}

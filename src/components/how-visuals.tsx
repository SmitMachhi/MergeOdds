import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { GradeTile } from "@/components/card";
import { draw, EASE, enter, Reveal, VIEW } from "@/components/how-layout";
import { cn } from "@/lib/utils";
import type { Grade } from "../../shared/types";

// One real check, used as the running example on this page: vitejs/vite on 10 November 2026.
// Every number below, the question counts in REQUESTS and the question in <Question> come from that single run.
// To change the example, run one check of the new repo and replace all of them together.
export const EX = {
  repo: "vitejs/vite",
  name: "Vite",
  days: 34,
  read: { merged: 152, closed: 93 },
  outside: { merged: 30, closed: 82 },
  newcomers: { merged: 26, rejected: 46, stuck: 21 },
  stuckAfterDays: 25,
  odds: 28,
  range: [21, 36],
  grades: [["Merge rate", "C"], ["First reply", "B"], ["Time to merge", "B"], ["Left hanging", "C"], ["They say why", "B"], ["Guide", "A"]] as [string, Grade][],
};
export const TRIED = EX.newcomers.merged + EX.newcomers.rejected + EX.newcomers.stuck;
export const READ = EX.read.merged + EX.read.closed;


// The pictures next to each step, all drawn from the example check above.

// ---- steps 1 and 2: one square per PR ----

type Cell = { kind: "merged" | "closed" | "empty"; outside: boolean };

/** 400 squares, one per PR we can read. The order is shuffled once, with a fixed seed, so it never flickers. */
function useCells(): Cell[] {
  return useMemo(() => {
    const cells: Cell[] = [];
    const push = (kind: Cell["kind"], total: number, outside: number) => {
      for (let i = 0; i < total; i++) cells.push({ kind, outside: i < outside });
    };
    push("merged", EX.read.merged, EX.outside.merged);
    push("closed", EX.read.closed, EX.outside.closed);
    let seed = 7;
    for (let i = cells.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const j = seed % (i + 1);
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    while (cells.length < 400) cells.push({ kind: "empty", outside: false });
    return cells;
  }, []);
}

const CELL = { merged: "bg-emerald-400", closed: "bg-red-400", empty: "text-white/20 dither-25" };

/** `mode="read"`: the squares arrive in a wave. `mode="outside"`: staff and bot PRs dim, outsiders stay lit. */
export function PixelGrid({ mode }: { mode: "read" | "outside" }) {
  const cells = useCells();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, VIEW);
  return (
    <div ref={ref} aria-hidden className="grid w-fit grid-cols-[repeat(25,minmax(0,1fr))] gap-1">
      {cells.map((c, i) => {
        const opacity = mode === "read" ? (seen ? 1 : 0) : seen && !c.outside ? 0.12 : 1;
        return <span key={i} className={cn("size-2 transition-opacity duration-300 motion-reduce:transition-none sm:size-3", CELL[c.kind])} style={{ opacity, transitionDelay: `${i * 1.5}ms` }} />;
      })}
    </div>
  );
}

// ---- step 3: the three outcomes ----

export function Outcomes() {
  const parts = [
    { label: "merged", count: EX.newcomers.merged, fill: "bg-emerald-400" },
    { label: "rejected", count: EX.newcomers.rejected, fill: "bg-red-400" },
    { label: "stuck open", count: EX.newcomers.stuck, fill: "text-zinc-400 dither-50" },
  ];
  return (
    <div>
      <motion.div className="flex h-4 origin-left gap-0.5" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={VIEW} transition={draw}>
        {parts.map((p) => (
          <div key={p.label} className={cn("h-full", p.fill)} style={{ flex: `${p.count} 0 0` }} />
        ))}
      </motion.div>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {parts.map((p, i) => (
          <motion.li key={p.label} className="inline-flex items-center gap-2" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={VIEW} transition={{ ...enter, delay: 0.2 + i * 0.05 }}>
            <span className={cn("size-2", p.fill)} />
            <span className="text-foreground">{p.count}</span> {p.label}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

// ---- step 4: one real question and its answer ----

export function Question() {
  const rows: [string, ReactNode][] = [
    ["Jev reads", <>PR #23901. Open less than 1 day. One maintainer closed it. Last comment: "This will be fixed by #23603"</>],
    ["We ask", "Why was this pull request closed without being merged?"],
    ["Options", "Went stale, merged another way, someone else fixed it, maintainers said no, broke the rules, low effort, author withdrew it, no reason given"],
  ];
  return (
    <div className="rounded-xl border bg-card px-5">
      <p className="border-b border-border/60 py-3 text-xs text-muted-foreground">Example: one real close-reason question</p>
      <dl className="divide-y divide-border/60">
        {rows.map(([term, text]) => (
          <div key={term} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[5rem_1fr]">
            <dt className="text-xs text-muted-foreground sm:pt-1">{term}</dt>
            <dd className="text-sm leading-6 text-pretty">{text}</dd>
          </div>
        ))}
        <div className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[5rem_1fr]">
          <dt className="text-xs text-muted-foreground sm:pt-1">Jev says</dt>
          <dd className="text-sm">
            <span className="flex items-baseline justify-between gap-4">
              <span className="text-emerald-400">Someone else fixed it</span>
              <span>99% sure</span>
            </span>
            <span className="mt-2 block h-2 text-white/20 dither-25">
              <motion.span className="block h-full origin-left bg-emerald-400" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={VIEW} transition={{ ...draw, delay: 0.2 }} />
            </span>
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ---- step 5: the sum ----

function Count({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, VIEW);
  const v = useMotionValue(0);
  const text = useTransform(v, (x) => Math.round(x).toString());
  const still = useReducedMotion();
  useEffect(() => {
    if (!seen) return;
    if (still) return v.set(to);
    const c = animate(v, to, { duration: 0.8, ease: EASE });
    return () => c.stop();
  }, [seen, still, to, v]);
  return <motion.span ref={ref}>{text}</motion.span>;
}

export function Sum() {
  return (
    <Reveal className="rounded-xl border bg-card p-6">
      <p className="text-xs text-muted-foreground">Example: {EX.name}</p>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2 text-2xl sm:text-3xl">
        <span>
          ({EX.newcomers.merged} + 1) ÷ ({TRIED} + 2)
        </span>
        <span className="text-muted-foreground">=</span>
        <span className="text-5xl font-semibold tracking-tighter text-emerald-400 sm:text-6xl">
          <Count to={EX.odds} />%
        </span>
      </p>
    </Reveal>
  );
}

// ---- step 6: the grades ----

export function Grades() {
  const ref = useRef<HTMLUListElement>(null);
  const seen = useInView(ref, VIEW);
  return (
    <ul ref={ref} className="grid grid-cols-3 gap-x-4 gap-y-6">
      {EX.grades.map(([label, grade]) => (
        <li key={label} className="flex flex-col items-start gap-2">
          {/* the tile plays its fill when it mounts, so mount it once the row is on screen */}
          <span className="grid size-10">{seen && <GradeTile grade={grade} />}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </li>
      ))}
    </ul>
  );
}

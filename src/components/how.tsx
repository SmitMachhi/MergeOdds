import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { DitherButton } from "@/components/dither-kit";
import { Frame } from "@/components/frame";
import { GradeTile, Rule2 } from "@/components/report";
import { BRAND } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { BEST_FIRST, OUTCOMES } from "../../shared/outcomes";
import { CUTS, VERDICTS } from "../../shared/rules";
import type { Grade } from "../../shared/types";

// One real check, used as the running example on this page: vitejs/vite on 10 November 2026.
// Every number below, the question counts in REQUESTS and the question in <Question> come from that single run.
// To change the example, run one check of the new repo and replace all of them together.
// `outside` is what GitHub shows before Jev reads anything. Of those 82 closed PRs, the author closed 11.
// This is the one page that names Jev: it exists to say how the app works.
const EX = {
  repo: "vitejs/vite",
  name: "Vite",
  days: 34,
  read: { merged: 152, closed: 93 },
  outside: { merged: 30, closed: 82 },
  withdrawn: 11,
  newcomers: { merged: 26, rejected: 46, stuck: 21 },
  stuckAfterDays: 25,
  odds: 28,
  range: [21, 36],
  grades: [["Merge rate", "C"], ["First reply", "B"], ["Time to merge", "B"], ["Left hanging", "C"], ["They say why", "B"], ["Guide", "A"]] as [string, Grade][],
};
const TRIED = EX.newcomers.merged + EX.newcomers.rejected + EX.newcomers.stuck;
const READ = EX.read.merged + EX.read.closed;

// The five Jev requests of that check, with its question counts. Vite has no AI policy file and no workflow
// that closes PRs, so the rules request held 12 rule questions, not 14.
const REQUESTS = [
  { name: "Rules", reads: "The guide and the PR template", asks: "12 yes or no questions about rules, and 2 ratings", count: 14 },
  { name: "Requirements", reads: "120 lines from the guide", asks: "Must contributors do this? Which of 7 topics is it?", count: 240 },
  { name: "Quotes", reads: "The same 120 lines", asks: "Which of 12 rules does this line state, if any?", count: 120 },
  { name: "PR kinds", reads: "90 PR titles", asks: "Which of 6 kinds of change is it?", count: 90 },
  { name: "Close reasons", reads: "The newest 60 closed outside PRs: title, days open, who closed it, last 3 comments", asks: "Which of 8 reasons closed it?", count: 60 },
];
const QUESTIONS = REQUESTS.reduce((s, r) => s + r.count, 0);

// The tables come from shared/rules.ts and shared/outcomes.ts, the same ones the worker decides with, so this page
// cannot drift from the code.
const bar = (x: number, unit: string) => (unit === "%" ? `${x}%` : unit === "days" ? `${x}d` : unit === "hours" ? (x < 48 ? `${x}h` : `${x / 24}d`) : `${x}`);
const CUT_ROWS = Object.values(CUTS).map((c) => [c.label, ...c.cuts.map((x) => bar(x, c.unit)), c.more ? "or more" : "or less"]);
// In the order the code checks them: the first row that fits wins.
const VERDICT_ROWS = VERDICTS.map((v) => [v.title, v.when]);
const GROUP = { merged: "Merged", rejected: "Rejected", stuck: "Stuck" };
const SOURCE = { github: "GitHub", classifier: "Jev" };
const OUTCOME_ROWS = OUTCOMES.map((o) => [o.when, o.end ? GROUP[o.end] : "Not counted", SOURCE[o.by]]);

const LIMITS = [
  "On busy repos, the 400 PRs we read can span 2 days",
  "Under 10 newcomers, the range is wide",
  "Jev can answer one borderline case two ways on two runs",
  "Jev reads the newest 60 closed outside PRs. Older PRs the author closed still count as rejected",
  "We keep each result for 7 days, so numbers can be 7 days old",
];

const EASE = [0.16, 1, 0.3, 1] as const;
const enter = { duration: 0.5, ease: EASE };
const draw = { duration: 0.6, ease: EASE };
const VIEW = { once: true, amount: 0.5 } as const;

/** Fades and lifts its children once, the first time they scroll into view. */
function Reveal({ delay = 0, className, children }: { delay?: number; className?: string; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ ...enter, delay }} className={className}>
      {children}
    </motion.div>
  );
}

/** A step is a numbered title, one plain sentence, a short list of facts, one visual, and an optional full-width
 *  table under both. The titles and the sentences alone tell the whole story. The Example row holds the numbers
 *  of the example check, so it reads in the main text colour. */
function Step({ n, title, lead, facts, visual, caption, children }: { n: number; title: string; lead: string; facts: [string, ReactNode][]; visual: ReactNode; caption?: string; children?: ReactNode }) {
  return (
    <section className="py-16">
      <div className="grid gap-x-16 gap-y-8 md:grid-cols-2 md:items-center">
        <Reveal>
          <h2 className="flex items-center gap-3 text-2xl font-medium tracking-tight">
            <span className="grid size-6 shrink-0 place-items-center rounded-sm border text-xs tracking-normal">{n}</span>
            {title}
          </h2>
          <p className="mt-4 leading-7 text-pretty">{lead}</p>
          <dl className="mt-4 divide-y divide-border/60">
            {facts.map(([term, text]) => (
              <div key={term} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[7rem_1fr]">
                <dt className="text-sm text-muted-foreground">{term}</dt>
                <dd className={cn("text-sm leading-6 text-pretty", term !== "Example" && "text-muted-foreground")}>{text}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
        <div>
          {visual}
          {caption && <p className="mt-4 text-xs text-muted-foreground">{caption}</p>}
        </div>
      </div>
      {children && <Reveal className="mt-12">{children}</Reveal>}
    </section>
  );
}

/** A plain table that turns into stacked rows on a phone. `head` names the columns; the first column leads.
 *  A last column of numbers sits on the right. `compact` keeps short values on one line on a phone.
 *  `ordered` is for the tables where the first row that fits wins: their rows arrive one after another, top to
 *  bottom, the way the code checks them. The other tables arrive as one block, so the order means something. */
function Table({ head, rows, cols, compact, ordered }: { head: string[]; rows: (string | number)[][]; cols: string; compact?: boolean; ordered?: boolean }) {
  const body = useRef<HTMLDivElement>(null);
  const seen = useInView(body, { once: true, amount: 0.3 });
  return (
    <div className="rounded-xl border bg-card px-5">
      <div className={cn("hidden gap-x-6 border-b border-border/60 py-3 text-xs text-muted-foreground md:grid", cols)}>
        {head.map((h, i) => <span key={h} className={cn(i === head.length - 1 && typeof rows[0]?.[i] === "number" && "text-right")}>{h}</span>)}
      </div>
      <div ref={body} data-ordered={ordered ? "" : undefined} className="divide-y divide-border/60">
        {rows.map((row, r) => {
          const line = cn("gap-x-6 gap-y-1 py-3 text-sm md:items-baseline", compact ? "flex flex-wrap gap-x-4 md:grid md:gap-x-6" : "grid", cols);
          const cells = row.map((cell, i) => (
            <span key={i} className={cn("text-pretty", i === 0 ? "text-foreground" : "text-muted-foreground", compact && i === 0 && "w-full md:w-auto", i === row.length - 1 && typeof cell === "number" && "md:text-right")}>
              {i > 0 && head[i] && <span className="mr-2 text-xs md:hidden">{head[i]}</span>}
              {cell}
            </span>
          ));
          if (!ordered) return <div key={r} className={line}>{cells}</div>;
          return (
            <motion.div key={r} data-row initial={{ opacity: 0, y: 6 }} animate={seen ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }} transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: seen ? r * 0.04 : 0 }} className={line}>
              {cells}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

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
function PixelGrid({ mode }: { mode: "read" | "outside" }) {
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

function Outcomes() {
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

function Question() {
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

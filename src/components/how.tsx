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

function Sum() {
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

function Grades() {
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

export function How() {
  return (
    <Frame>
      <main className="relative mx-auto max-w-5xl px-4 pb-56">
        <header className="flex h-16 items-center justify-between">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-medium">
            <img src="/favicon.svg" alt="" className="size-4" />
            Merge Odds
          </a>
          <a href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Check repos</a>
        </header>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={enter} className="pt-12 pb-8">
          <h1 className="text-4xl font-medium tracking-tight sm:text-6xl">How it works</h1>
          <p className="mt-4 max-w-prose leading-7 text-pretty text-muted-foreground">
            Each check takes about 4 seconds. Lines marked Example come from one real check: {EX.repo} on 10 November 2026.
          </p>
        </motion.div>

        <Rule2 />
        <Step
          n={1}
          title="Fetch the repo"
          visual={<PixelGrid mode="read" />}
          lead="We ask GitHub for the recent pull requests and the contributor docs."
          caption={`Example: one square per PR, ${EX.read.merged} merged, ${EX.read.closed} closed`}
          facts={[
            ["PRs", "Up to 200 merged and 200 closed from the last 90 days, cut to the days both lists cover"],
            ["Docs", "CONTRIBUTING.md (the guide), AI_POLICY.md, the PR template and the workflow files"],
            ["Example", `${EX.name}: ${READ} PRs from the last ${EX.days} days`],
          ]}
        />
        <Rule2 />
        <Step
          n={2}
          title="Split staff from outsiders"
          visual={<PixelGrid mode="outside" />}
          lead="We keep the PRs from outsiders and drop the ones from staff and bots."
          caption="Example: staff and bot PRs dim, outside PRs stay lit"
          facts={[
            ["Staff", "Anyone who pressed merge on PRs here, plus anyone GitHub lists as owner, member or collaborator"],
            ["Outsiders", "Everyone else, minus bots"],
            ["Example", `${EX.name}: ${EX.outside.merged + EX.outside.closed} of the ${READ} PRs came from outsiders, ${EX.outside.merged} merged and ${EX.outside.closed} closed`],
          ]}
        />
        <Rule2 />
        <Step
          n={3}
          title="Find the newcomers"
          visual={<Outcomes />}
          lead="Newcomers are outsiders who had no merged PR in this repo before the days we read. Each one goes into one of three groups."
          caption={`Example: ${EX.name}, ${TRIED} newcomers`}
          facts={[
            ["How we know", "One GitHub search per author"],
            ["Groups", "Merged, rejected or stuck. The first row that fits in the table decides"],
            ["Not counted", "PRs the author closed. They say nothing about maintainers"],
            ["Once each", `Each newcomer counts once, with their best ending: ${BEST_FIRST[0]} beats ${BEST_FIRST[1]}, ${BEST_FIRST[1]} beats ${BEST_FIRST[2]}`],
            ["Deadline", `The time 9 in 10 merged outside PRs took to merge. Example: ${EX.stuckAfterDays} days for ${EX.name}`],
          ]}
        >
          <Table compact ordered head={["How the PR ended", "Group", "Source"]} rows={OUTCOME_ROWS} cols="md:grid-cols-[1fr_8rem_6rem]" />
        </Step>
        <Rule2 />
        <Step
          n={4}
          title="Ask Jev"
          lead="Some facts sit in text, like the guide and PR comments. Jev reads that text and answers the same set of questions each time."
          visual={<Question />}
          facts={[
            ["Jev", "The classifier TypeSafe makes. It picks one answer and says how sure it is. It writes no text"],
            ["Questions", "Three kinds: yes or no, pick one option, give one rating"],
            ["Yes", "Counts when Jev is 70% sure or more"],
            ["Example", `${EX.name}: ${QUESTIONS} questions in 5 requests`],
          ]}
        >
          <p className="mb-3 text-xs text-muted-foreground">Example: the 5 requests for {EX.name}</p>
          <Table head={["Request", "Jev reads", "We ask", "Questions"]} rows={REQUESTS.map((r) => [r.name, r.reads, r.asks, r.count])} cols="md:grid-cols-[9rem_1fr_1fr_5rem]" />
        </Step>
        <Rule2 />
        <Step
          n={5}
          title="Do the sum"
          lead="The odds are the share of newcomers who got merged, adjusted for small samples."
          visual={<Sum />}
          facts={[
            ["Formula", "(merged + 1) ÷ (tried + 2). The +1 and +2 add one merged PR and one unmerged PR, so 3 lucky PRs do not read as 100%"],
            ["Range", `Fewer newcomers, wider range. We are 90% sure the real odds sit inside it (Wilson interval). Example: ${TRIED} newcomers gives ${EX.range[0]}% to ${EX.range[1]}%`],
            ["From Jev", `PRs merged another way count as merged. PRs the author closed do not count. Example: 0 and ${EX.withdrawn} of the 60 closed outside PRs Jev read for ${EX.name}`],
          ]}
        />
        <Rule2 />
        <Step
          n={6}
          title="Grade and decide"
          lead="Two tables, the same for each repo, turn the numbers into six grades and one verdict."
          visual={<Grades />}
          caption={`Example: the six grades for ${EX.name}`}
          facts={[
            ["Grades", "Six numbers, each graded A to F by the first table. Below the D mark means F"],
            ["Verdict", "The first row that fits in the second table wins. It uses the odds and Jev's answers. No AI writes it"],
          ]}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
            <Table compact head={["Metric", "A", "B", "C", "D", ""]} rows={CUT_ROWS} cols="md:grid-cols-[7rem_1fr_1fr_1fr_1fr_4rem] md:gap-x-4" />
            <Table ordered head={["Verdict", "When"]} rows={VERDICT_ROWS} cols="md:grid-cols-[10rem_1fr]" />
          </div>
        </Step>
        <Rule2 />

        <section className="grid gap-x-16 gap-y-8 py-16 md:grid-cols-2">
          <Reveal>
            <h2 className="text-2xl font-medium tracking-tight">Limits</h2>
            <ul className="mt-6 space-y-3">
              {LIMITS.map((l) => (
                <li key={l} className="flex gap-3 text-sm text-pretty text-muted-foreground">
                  <span className="mt-1.5 size-2 shrink-0 bg-current" />
                  {l}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1} className="md:justify-self-end md:self-end">
            <DitherButton color={BRAND} variant="gradient" onClick={() => location.assign("/")} className="h-12 rounded-lg px-6 text-sm font-medium transition-transform active:scale-[0.97]">
              Check repos
            </DitherButton>
          </Reveal>
        </section>
      </main>
    </Frame>
  );
}

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { ArrowUpRight, Ban, Check, GitFork, Star, TriangleAlert } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Bar, BarChart, DitherGradient, Legend, PALETTE, Pie, PieChart, Tooltip, XAxis, YAxis, type ChartConfig,
} from "@/components/dither-kit";
import { CATEGORY, compact, GRADE, PHASES, REASON_COLOR, TIER } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { checkedAgo, plural } from "../../shared/text";
import type { Analysis, Metric, Rule, Slice } from "../../shared/types";

const rise = {
  hidden: { opacity: 0, y: 14, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring" as const, duration: 0.6, bounce: 0 } },
};
const spring = { type: "spring" as const, duration: 0.9, bounce: 0 };

/** A 2px dithered line: the page's divider. */
export function Rule2({ className }: { className?: string }) {
  return <div aria-hidden className={cn("h-0.5 text-white/15 dither-50", className)} />;
}

function Card({ title, hint, className, children }: { title?: string; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <motion.section variants={rise} className={cn("relative overflow-hidden rounded-xl border bg-card p-5", className)}>
      {title && (
        <header className="mb-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">{title}</h2>
            {hint && <span className="text-right text-xs text-muted-foreground">{hint}</span>}
          </div>
          <Rule2 className="mt-3" />
        </header>
      )}
      {children}
    </motion.section>
  );
}

function CountUp({ to }: { to: number }) {
  const v = useMotionValue(0);
  const text = useTransform(v, (x) => Math.round(x).toString());
  useEffect(() => {
    const c = animate(v, to, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [to, v]);
  return <motion.span>{text}</motion.span>;
}

/** The headline number, its range, and the three outcomes behind it. Text sits on a flat background;
 *  the dither stays in a strip at the bottom. */
function Verdict({ a }: { a: Analysis }) {
  const t = TIER[a.verdict.tier];
  const n = a.newcomers;
  const total = n.merged + n.rejected + n.ignored;
  const parts = [
    { label: "merged", count: n.merged, fill: "bg-emerald-400" },
    { label: "rejected", count: n.rejected, fill: "bg-red-400" },
    { label: "stuck open", count: n.ignored, fill: "text-zinc-400 dither-50" },
  ];
  const caption =
    a.odds === null ? "Too few outside PRs to measure"
    : a.verdict.tier === "closed" ? "of newcomers get merged under the current rules"
    : `of newcomers got a PR merged${n.low !== null ? `. A sample of ${total} puts the range at ${n.low}% to ${n.high}%` : ""}`;
  return (
    <Card className="pb-20 md:col-span-2">
      <p className={cn("text-sm font-medium", t.text)}>{a.verdict.title}</p>
      <p className="mt-2 text-7xl leading-none font-semibold tracking-tighter sm:text-8xl">
        {a.odds === null ? "?" : <CountUp to={a.odds} />}
        {a.odds !== null && <span className="text-4xl text-muted-foreground">%</span>}
      </p>
      <p className="mt-3 text-sm text-pretty text-muted-foreground">{caption}</p>

      {total > 0 && (
        <div className="mt-5">
          <motion.div className="flex h-3 origin-left gap-0.5" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...spring, delay: 0.2 }}>
            {parts.filter((p) => p.count > 0).map((p) => (
              <div key={p.label} className={cn("h-full", p.fill)} style={{ flex: `${p.count} 0 0` }} />
            ))}
          </motion.div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {parts.map((p) => (
              <li key={p.label} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2", p.fill)} />
                <span className="text-foreground">{p.count}</span> {p.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {plural(total, "newcomer")} tried in the last {plural(a.window.days, "day")}
          </p>
        </div>
      )}

      <ul className="mt-5 space-y-2 text-sm">
        {a.verdict.reasons.map((r) => (
          <li key={r} className="flex gap-3 text-pretty">
            <span className={cn("mt-1.5 size-2 shrink-0 bg-current", t.text)} />
            {r}
          </li>
        ))}
      </ul>

      <div aria-hidden className="absolute inset-x-0 bottom-0 h-14">
        <DitherGradient from={t.color} opacity={0.5} />
      </div>
    </Card>
  );
}

/** A grade as a level meter: the dither fill climbs with the grade, and the letter sits on a solid plate in the middle. */
export function GradeTile({ grade }: { grade: Metric["grade"] }) {
  const g = grade ? GRADE[grade] : null;
  return (
    <span className={cn("relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-current/40", g ? g.text : "text-zinc-500")}>
      <motion.span
        aria-hidden
        className={cn("absolute inset-x-0 bottom-0 origin-bottom opacity-60", g ? g.fill : "dither-25")}
        style={{ height: g ? g.height : "100%" }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ ...spring, delay: 0.3 }}
      />
      {/* the plate is a deeper shade of the grade's colour, so the white letter reads on every grade */}
      <span className={cn("relative grid size-6 place-items-center rounded-sm text-lg leading-none font-semibold text-white", g ? g.plate : "bg-zinc-600")}>
        {grade ?? "?"}
      </span>
    </span>
  );
}

function MetricRow({ m }: { m: Metric }) {
  return (
    <li className="flex items-center gap-4 py-3">
      <GradeTile grade={m.grade} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">{m.label}</p>
        <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{m.math}</p>
      </div>
      <span className="shrink-0 text-base font-medium">{m.value}</span>
    </li>
  );
}

function Scorecard({ a }: { a: Analysis }) {
  return (
    <Card title="Scorecard" hint={`outside PRs, last ${plural(a.window.days, "day")}`} className="md:col-span-3">
      <ul className="-my-3 divide-y divide-border/60">{a.scorecard.map((m) => <MetricRow key={m.id} m={m} />)}</ul>
    </Card>
  );
}

function Slices({ title, by, rows }: { title: string; by: string; rows: Slice[] }) {
  return (
    <div>
      <h3 className="mb-3 flex items-baseline justify-between text-xs text-muted-foreground">
        <span>{title}</span>
        <span>{by}</span>
      </h3>
      {rows.length === 0 && <p className="py-2 text-sm text-muted-foreground">Too few PRs to split</p>}
      <ul className="space-y-3">
        {rows.map((r, i) => {
          const rate = Math.round((100 * r.merged) / r.total);
          return (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span>
                  {r.label}
                  {r.best && <span className="ml-2 rounded-sm border border-emerald-400/40 px-1 text-xs text-emerald-300">best bet</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.merged}/{r.total} <span className="ml-2 text-sm text-foreground">{rate}%</span>
                </span>
              </div>
              <div className="mt-2 h-2 text-white/20 dither-25">
                <motion.div
                  className={cn("h-full origin-left", r.best ? "bg-emerald-400" : "bg-foreground/75")}
                  style={{ width: `${rate}%` }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ ...spring, delay: 0.25 + i * 0.05 }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Merged({ a }: { a: Analysis }) {
  return (
    <Card title="PRs that get merged here" hint="share of outside PRs maintainers merged">
      <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
        <Slices title="By kind of change" by="from each PR title" rows={a.byType} />
        <Slices title="By size" by="lines changed" rows={a.bySize} />
      </div>
    </Card>
  );
}

function Flow({ a }: { a: Analysis }) {
  const config: ChartConfig = { merged: { label: "Merged", color: "green" }, closed: { label: "Rejected", color: "red" } };
  return (
    <Card title="Outside PRs over time" hint={`${a.outside.merged} merged, ${a.outside.closed} rejected`}>
      <div className="h-56">
        <BarChart data={a.series} config={config} stackType="stacked" bloom="low">
          <XAxis dataKey="label" maxTicks={5} />
          <YAxis />
          <Legend />
          <Tooltip labelKey="label" />
          <Bar dataKey="merged" variant="gradient" />
          <Bar dataKey="closed" variant="hatched" />
        </BarChart>
      </div>
    </Card>
  );
}

function Reasons({ a }: { a: Analysis }) {
  const title = "Reasons outside PRs got closed";
  if (!a.closeReasons.length)
    return (
      <Card title={title}>
        <p className="grid h-56 place-items-center text-sm text-muted-foreground">No closed outside PRs to read</p>
      </Card>
    );
  const config: ChartConfig = Object.fromEntries(a.closeReasons.map((r) => [r.reason, { label: r.label, color: REASON_COLOR[r.reason] }]));
  const total = a.closeReasons.reduce((s, r) => s + r.count, 0);
  return (
    <Card title={title} hint={`from ${plural(total, "closing thread")}`}>
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <div className="size-48 shrink-0">
          <PieChart data={a.closeReasons} config={config} dataKey="count" nameKey="reason" innerRadius={0.55} bloom="low">
            <Tooltip />
            <Pie variant="gradient" />
          </PieChart>
        </div>
        <ul className="w-full space-y-2 text-sm">
          {a.closeReasons.map((r) => (
            <li key={r.reason} className="flex items-center gap-3">
              <span className="size-2 shrink-0" style={{ background: `rgb(${PALETTE[REASON_COLOR[r.reason]].line.join(" ")})` }} />
              <span className="flex-1">{r.label}</span>
              <span className="text-xs text-muted-foreground">{r.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

const RULE_ICON = { blocker: Ban, warning: TriangleAlert, todo: Check };
const RULE_TONE = { blocker: "text-red-400", warning: "text-orange-400", todo: "text-muted-foreground" };

function RuleItem({ r }: { r: Rule }) {
  const Icon = RULE_ICON[r.kind];
  return (
    <li>
      <p className="flex gap-2 text-sm font-medium">
        <Icon strokeWidth={1.5} className={cn("mt-0.5 size-4 shrink-0", RULE_TONE[r.kind])} />
        {r.label}
      </p>
      {r.quote && <p className="mt-2 ml-6 max-w-prose border-l-2 border-border pl-3 text-sm leading-6 text-pretty text-muted-foreground">{r.quote}</p>}
    </li>
  );
}

/** One line of the guide list: a short label on the left, the content on the right. Stacks on a phone. */
function GuideRow({ label, step, children }: { label: string; step?: number; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[10rem_1fr]">
      <h3 className="flex items-center gap-2 self-start text-xs text-muted-foreground sm:pt-0.5">
        {step !== undefined && <span className="grid size-5 place-items-center rounded-sm border text-xs text-foreground">{step}</span>}
        {label}
      </h3>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** The contributing guide as one list you can scan top to bottom: the rules in the order you meet them,
 *  then the other requirements, grouped by topic. Steps with no rule are left out. */
function Guide({ a }: { a: Analysis }) {
  const title = "Their contributing guide, step by step";
  const steps = PHASES.map(([phase, label]) => ({ label, rules: a.rules.filter((r) => r.phase === phase) })).filter((s) => s.rules.length);
  const topics = Object.entries(CATEGORY)
    .map(([key, label]) => ({ label, lines: a.points.filter((p) => p.category === key) }))
    .filter((t) => t.lines.length);
  const link = a.repo.guideUrl && (
    <a href={a.repo.guideUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
      {a.repo.guidePath} <ArrowUpRight strokeWidth={1.5} className="size-4" />
    </a>
  );
  if (!a.rules.length && !a.points.length)
    return (
      <Card title={title} hint={link}>
        <p className="py-4 text-sm text-pretty text-muted-foreground">
          {a.failed
            ? "We could not read their guide this time. Check again in a minute"
            : "This repo has no contributing guide or PR template. Read a few merged PRs to see what gets through"}
        </p>
      </Card>
    );
  return (
    <Card title={title} hint={link}>
      {steps.length > 0 && (
        <div className="divide-y divide-border/60">
          {steps.map((s, i) => (
            <GuideRow key={s.label} label={s.label} step={i + 1}>
              <ul className="space-y-4">{s.rules.map((r) => <RuleItem key={r.id} r={r} />)}</ul>
            </GuideRow>
          ))}
        </div>
      )}
      {topics.length > 0 && (
        <div className={cn(steps.length > 0 && "mt-6")}>
          {steps.length > 0 && <Rule2 />}
          <p className={cn("mb-4 text-xs text-muted-foreground", steps.length > 0 && "mt-4")}>Also in their guide</p>
          <div className="divide-y divide-border/60">
            {topics.map((t) => (
              <GuideRow key={t.label} label={t.label}>
                <ul className="space-y-2">
                  {t.lines.map((p) => (
                    <li key={p.text} className="max-w-prose text-sm leading-6 text-pretty">{p.text}</li>
                  ))}
                </ul>
              </GuideRow>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/** The repo owner's picture on a grey square. It fades in when it arrives, so it never pops in.
 *  One the browser already holds shows at once. */
function Avatar({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<"waiting" | "held" | "arrived">("waiting");
  useLayoutEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth > 0) setState("held");
  }, []);
  return (
    <span className="size-13 shrink-0 overflow-hidden rounded-lg bg-muted outline outline-1 -outline-offset-1 outline-white/10">
      <img
        ref={ref}
        src={src}
        alt=""
        width={52}
        height={52}
        onLoad={() => setState((s) => (s === "waiting" ? "arrived" : s))}
        className={cn("size-full", state === "waiting" && "opacity-0", state === "arrived" && "transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]")}
      />
    </span>
  );
}

export function Report({ a }: { a: Analysis }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      // leaves with the same short fade as the home headline, so a new check or Back never cuts a full page of cards
      exit={{ opacity: 0, transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] } }}
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className="space-y-4"
    >
      <motion.header variants={rise} className="flex items-center gap-4">
        <Avatar src={`${a.repo.avatar}${a.repo.avatar.includes("?") ? "&" : "?"}s=112`} />
        <div className="min-w-0 flex-1">
          <a href={a.repo.url} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1 text-lg font-medium">
            {a.repo.name}
            <ArrowUpRight strokeWidth={1.5} className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          </a>
          <p className="truncate text-sm text-muted-foreground">{a.repo.description}</p>
        </div>
        <div className="hidden shrink-0 items-center gap-4 text-xs text-muted-foreground sm:flex">
          <span className="inline-flex items-center gap-1"><Star strokeWidth={1.5} className="size-4" />{compact(a.repo.stars)}</span>
          <span className="inline-flex items-center gap-1"><GitFork strokeWidth={1.5} className="size-4" />{compact(a.repo.forks)}</span>
          {a.repo.language && <span>{a.repo.language}</span>}
        </div>
      </motion.header>

      <div className="grid gap-4 md:grid-cols-5">
        <Verdict a={a} />
        <Scorecard a={a} />
      </div>
      <Merged a={a} />
      <Guide a={a} />
      <div className="grid gap-4 md:grid-cols-2">
        <Flow a={a} />
        <Reasons a={a} />
      </div>

      {/* pb-80 keeps this line above the page's dither wash, which is 18rem tall */}
      <motion.footer variants={rise} className="px-1 pt-2 pb-80 text-xs text-muted-foreground">
        <Rule2 className="mb-3" />
        {checkedAgo(a.generatedAt)}. Read {plural(a.window.merged + a.window.closed, "PR")} and answered {plural(a.checks, "question")} about them in {(a.tookMs / 1000).toFixed(1)}s
      </motion.footer>
    </motion.div>
  );
}

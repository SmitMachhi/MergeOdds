import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { ArrowUpRight, Ban, Check, GitFork, Star, TriangleAlert } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Bar, BarChart, DitherGradient, Legend, Pie, PieChart, Tooltip, XAxis, YAxis, type ChartConfig,
} from "@/components/dither-kit";
import { PALETTE } from "@/components/dither-kit/palette";
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
        <DitherGradient from={t.color} direction="up" opacity={0.5} />
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

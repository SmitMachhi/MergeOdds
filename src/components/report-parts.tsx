import { ArrowUpRight, Ban, Check, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Bar, BarChart, Legend, PALETTE, Pie, PieChart, Tooltip, XAxis, YAxis, type ChartConfig } from "@/components/dither-kit";
import { Card, Rule2, spring } from "@/components/card";
import { CATEGORY, PHASES, REASON_COLOR } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { plural } from "../../shared/text";
import type { Analysis, Rule, Slice } from "../../shared/types";

// The report's lower cards: what gets merged, the contributing guide, and the two charts.

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

export function Merged({ a }: { a: Analysis }) {
  return (
    <Card title="PRs that get merged here" hint="share of outside PRs maintainers merged">
      <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
        <Slices title="By kind of change" by="from each PR title" rows={a.byType} />
        <Slices title="By size" by="lines changed" rows={a.bySize} />
      </div>
    </Card>
  );
}

export function Flow({ a }: { a: Analysis }) {
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

export function Reasons({ a }: { a: Analysis }) {
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
export function Guide({ a }: { a: Analysis }) {
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

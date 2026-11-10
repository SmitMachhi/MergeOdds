import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { ArrowUpRight, GitFork, Star } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DitherGradient } from "@/components/dither-kit";
import { Card, GradeTile, rise, Rule2, spring } from "@/components/card";
import { Flow, Guide, Merged, Reasons } from "@/components/report-parts";
import { compact, TIER } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { checkedAgo, plural } from "../../shared/text";
import type { Analysis, Metric } from "../../shared/types";

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

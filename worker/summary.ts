// Turns the counted numbers and Jev's answers into the parts of the report: scorecard rows, merge-rate slices,
// the guide's rules and requirements, the verdict's reasons, and the weekly chart. Plain functions, no reads.
import type { CloseReason, Metric, Phase, Point, PointCategory, Rule, RuleId, Slice } from "../shared/types";
import { grade, type VerdictId } from "../shared/rules";
import { halfOf, plural } from "../shared/text";
import { PR_TYPES, REASONS, type Answer, type JevResult, type PRType } from "./jev";
import { RULES } from "./jev-rules";

const YES = 0.7; // Jev's own suggested starting threshold for a Noul
const PHASE: Record<RuleId, Phase> = {
  closed_to_outsiders: "before", invite_only: "before", issue_first: "before", assignment: "before", discuss_big: "before",
  tests: "coding", commit_format: "coding", changelog: "coding", ai_banned: "coding",
  cla: "pr", dco: "pr", ai_disclosure: "pr",
  stale_bot: "after", auto_close_newcomers: "after",
};
const SIZES: [string, string, number][] = [
  ["tiny", "Under 20 lines", 20], ["small", "20 to 100 lines", 100], ["medium", "100 to 500 lines", 500], ["large", "Over 500 lines", Infinity],
];

export const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const noul = (a?: Answer) => (a?.type === "noul" ? a.noul : null);
export const score = (a?: Answer) => (a?.type === "score" ? a.score : null);

/** 90% Wilson interval for k wins in n tries: the honest range for a small sample. */
export function wilson(k: number, n: number): [number, number] {
  const z = 1.645, p = k / n, d = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, Math.round(100 * (mid - half))), Math.min(100, Math.round(100 * (mid + half)))];
}

function span(h: number) {
  if (h < 1) return "under 1 hour";
  if (h < 48) return plural(Math.round(h), "hour");
  return plural(Math.round(h / 24), "day");
}

/** The six graded rows. Each one prints its own sum. */
export function scorecard(n: {
  odds: number | null; tried: number; nIn: number; nRejected: number; nStuck: number; replyH: number | null; replies: number;
  mergeMedian: number | null; merges: number; stallDays: number; stuckPRs: number; finished: number; closedByMaintainers: number;
  explained: number; clarity: number | null; welcoming: number | null; failed: boolean;
}): Metric[] {
  const { odds, tried, replyH, mergeMedian, stallDays, stuckPRs, finished, explained, clarity, welcoming } = n;
  const closed = n.closedByMaintainers;
  return [
    {
      id: "odds", label: "Newcomer merge rate", value: odds === null ? "n/a" : `${odds}%`,
      grade: odds === null ? null : grade("odds", odds),
      math: tried ? `${n.nIn} of ${plural(tried, "newcomer")} got merged. Maintainers rejected ${n.nRejected} and left ${n.nStuck} open.` : "No newcomer sent a PR in this window.",
    },
    {
      id: "reply", label: "First reply", value: replyH === null ? "n/a" : span(replyH),
      grade: replyH === null ? null : grade("reply", replyH),
      math: n.replies ? `${halfOf(n.replies, "finished outside PR")} we sampled got a human reply within this time.` : "No outside PRs to time.",
    },
    {
      id: "merge_time", label: "Time to merge", value: mergeMedian === null ? "n/a" : span(mergeMedian * 24),
      grade: mergeMedian === null ? null : grade("merge_time", mergeMedian),
      math: n.merges ? `${halfOf(n.merges, "merged outside PR")} landed within this time.${n.merges >= 5 ? ` 9 in 10 landed within ${plural(stallDays, "day")}.` : ""}` : "Maintainers merged no outside PRs in this window.",
    },
    {
      id: "stuck", label: "Left hanging", value: finished ? `${pct(stuckPRs, finished)}%` : "n/a",
      grade: finished ? grade("stuck", pct(stuckPRs, finished)) : null,
      math: `${stuckPRs} of ${plural(finished, "outside PR")} sat open past ${plural(stallDays, "day")} with no decision.`,
    },
    {
      id: "explained", label: "They say why", value: closed >= 3 ? `${pct(explained, closed)}%` : "n/a",
      grade: closed >= 3 ? grade("explained", pct(explained, closed)) : null,
      math: closed >= 3 ? `Maintainers gave a reason on ${explained} of the ${closed} PRs they closed.` : "Maintainers closed too few PRs to tell.",
    },
    {
      id: "guide", label: "Contributing guide", value: clarity === null ? "None" : `${Math.round((clarity / 3) * 100)}/100`,
      grade: clarity === null ? (n.failed ? null : "D") : grade("guide", (clarity / 3) * 100),
      math: clarity === null
        ? (n.failed ? "We could not read the guide this time." : "This repo has no contributing guide.")
        : `Scores how well the guide explains getting a PR merged.${welcoming === null ? "" : ` Its welcome to newcomers scores ${Math.round((welcoming / 3) * 100)}/100.`}`,
    },
  ];
}

/** Merge rate by kind of change (Jev reads the title) and by lines changed. `overall` is the repo's own rate. */
export function slices(prs: { won: boolean; type: string | null; lines: number | null }[], overall: number) {
  type Row = { label: string; merged: number; total: number };
  const types = new Map<string, Row>();
  const sizes = new Map<string, Row>(SIZES.map(([k, label]) => [k, { label, merged: 0, total: 0 }]));
  for (const { won, type, lines } of prs) {
    if (type !== null) {
      const row = types.get(type) ?? { label: PR_TYPES[type as PRType]?.label ?? type, merged: 0, total: 0 };
      row.total++; if (won) row.merged++;
      types.set(type, row);
    }
    if (lines !== null) {
      const row = sizes.get(SIZES.find(([, , max]) => lines < max)![0])!;
      row.total++; if (won) row.merged++;
    }
  }
  const keep = (rows: Map<string, Row>): Slice[] => [...rows].map(([key, v]) => ({ key, ...v })).filter((s) => s.total >= 2);
  // "Best bet" = the slice we are most sure about (highest low end of its range), and only if it clearly beats the average
  const markBest = (rows: Slice[]) => {
    const top = rows.filter((r) => r.total >= 4).sort((a, b) => wilson(b.merged, b.total)[0] - wilson(a.merged, a.total)[0])[0];
    if (top && pct(top.merged, top.total) >= overall + 10) top.best = true;
    return rows;
  };
  return {
    byType: markBest(keep(types).sort((a, b) => b.merged / b.total - a.merged / a.total || b.total - a.total)),
    bySize: markBest(keep(sizes)),
  };
}

/** The repo's rules, each with the sentence in the guide that states it, and the other lines that are real requirements. */
export function readGuide(lines: string[], rulesR: JevResult | null, evidenceR: JevResult | null, pointsR: JevResult | null) {
  const prob = {} as Record<RuleId, number | null>;
  const rules: Rule[] = [];
  const quoted = new Set<number>();
  for (const [id, r] of Object.entries(RULES) as [RuleId, (typeof RULES)[RuleId]][]) {
    prob[id] = noul(rulesR?.answers[id]);
    if ((prob[id] ?? 0) < YES) continue;
    let best = -1, bestP = 0.5;
    lines.forEach((_, i) => {
      const a = evidenceR?.answers[`rule_${i}`];
      if (a?.type === "choice" && a.choice === id && (a.probabilities[id] ?? 0) > bestP) { best = i; bestP = a.probabilities[id]; }
    });
    if (best >= 0) quoted.add(best);
    rules.push({ id, label: r.label, kind: r.kind, p: prob[id]!, phase: PHASE[id], quote: best >= 0 ? lines[best] : null });
  }
  const order = { blocker: 0, warning: 1, todo: 2 };
  rules.sort((a, b) => order[a.kind] - order[b.kind] || b.p - a.p);

  const points: Point[] = [];
  lines.forEach((text, i) => {
    const must = noul(pointsR?.answers[`must_${i}`]);
    const cat = pointsR?.answers[`cat_${i}`];
    if (quoted.has(i) || must === null || must < YES || cat?.type !== "choice") return;
    points.push({ text, p: must, category: cat.choice as PointCategory });
  });
  points.sort((a, b) => b.p - a.p);
  const perCat = new Map<string, number>();
  const topPoints = points.filter((p) => {
    const n = perCat.get(p.category) ?? 0;
    perCat.set(p.category, n + 1);
    return n < 2;
  }).slice(0, 6);
  return { rules, points: topPoints, is: (id: RuleId) => (prob[id] ?? 0) >= YES };
}

/** Up to five plain reasons under the verdict, with this repo's numbers. */
export function verdictReasons(n: {
  ruling: VerdictId; open: boolean; is: (id: RuleId) => boolean; nIn: number; days: number; outsideFinished: number;
  nRejected: number; nStuck: number; best: Slice | undefined; replyH: number | null; finished: number; stuckPRs: number;
  tried: number; failed: boolean;
}) {
  const { ruling, open, is, nIn, days, replyH, finished, stuckPRs, tried } = n;
  const reasons: string[] = [];
  // the rows that close the door, or cannot call it, say why
  if (ruling === "archived") reasons.push("The owners archived this repo, so they merge nothing.");
  if (ruling === "banned") {
    reasons.push("Their guide says they do not accept outside PRs.");
    if (nIn > 0) reasons.push(`They merged ${plural(nIn, "newcomer")} in the last ${plural(days, "day")}, so the rule looks new.`);
  }
  if (ruling === "no_pulse") reasons.push(`Maintainers merged or closed no PRs in the last ${plural(days, "day")}.`);
  if (ruling === "quiet") reasons.push(`${plural(n.outsideFinished, "outside PR")} finished in ${plural(days, "day")}. That is too few to measure.`);
  if (ruling === "none_merged") reasons.push(`${plural(n.nRejected + n.nStuck, "newcomer")} tried in the last ${plural(days, "day")}. Maintainers merged none.`);
  if (is("auto_close_newcomers")) reasons.push("A bot closes PRs from new contributors.");
  if (is("invite_only")) reasons.push("Maintainers close PRs they did not ask for.");
  if (is("ai_banned")) reasons.push("They reject PRs written by AI.");
  if (open && n.best) reasons.push(`${n.best.label} do best here: maintainers merged ${n.best.merged} of ${n.best.total}.`);
  if (replyH !== null && replyH > 336) reasons.push("Half of outside PRs wait over two weeks for a reply.");
  else if (open && replyH !== null && replyH <= 24) reasons.push("Half of outside PRs get a human reply within a day.");
  if (open && finished && pct(stuckPRs, finished) >= 30) reasons.push(`Maintainers leave ${pct(stuckPRs, finished)}% of outside PRs open with no decision.`);
  if (open && tried < 10) reasons.push(`${plural(tried, "newcomer")} in ${plural(days, "day")} is a small sample, so the range is wide.`);
  if (n.failed) reasons.push("We could not read their guide this time, so the rules are missing.");
  return reasons;
}

/** Outside PRs merged and rejected per week, or per day when the window is under four weeks. */
export function series(prs: { closedAt: string; won: boolean }[], start: number, now: number) {
  const DAY = 86400_000;
  const days = Math.max(1, Math.round((now - start) / DAY));
  const byWeek = days >= 28;
  const bucket = byWeek ? 7 * DAY : DAY;
  const n = Math.max(1, Math.min(byWeek ? 13 : 14, Math.ceil((now - start) / bucket)));
  const out = Array.from({ length: n }, (_, i) => {
    const d = new Date(now - (n - i) * bucket + (byWeek ? 0 : bucket / 2));
    return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), merged: 0, closed: 0 };
  });
  for (const p of prs) {
    const i = Math.floor((Date.parse(p.closedAt) - (now - n * bucket)) / bucket);
    if (i >= 0 && i < n) out[i][p.won ? "merged" : "closed"]++;
  }
  return out;
}

/** How often Jev gave each close reason, most common first. */
export function closeReasons(reasons: Iterable<CloseReason>) {
  const counts = new Map<CloseReason, number>();
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count, label: REASONS[reason].label, avoidable: REASONS[reason].avoidable }));
}

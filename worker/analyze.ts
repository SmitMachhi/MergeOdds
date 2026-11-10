// Numbers come from GitHub. Judgments come from Jev. The decisions (odds, grades, verdict) are plain code, right here.
//
// The model, from first principles. A newcomer's PR ends one of three ways:
//   merged   - the merge button, a merge bot, or a maintainer who landed the commits another way (Jev reads that)
//   rejected - closed without merging, unless the author closed it: that PR counts in no group
//   stuck    - still open after the time by which 90% of merged outside PRs had merged
// shared/outcomes.ts holds those rules as one table, and counts each newcomer once.
// odds = merged / (merged + rejected + stuck), counted per newcomer, with a 90% Wilson interval for the sample size.
import type {
  Analysis, CloseReason, Grade, Metric, Phase, Point, PointCategory, Rule, RuleId, Slice, Tier,
} from "../shared/types";
import { deadlineDays, outcomeOf, quantile, tally, type PRFacts } from "../shared/outcomes";
import { grade, verdictFor } from "../shared/rules";
import { halfOf, noPeriod, plural } from "../shared/text";
import {
  fetchDetails, fetchMeta, fetchPRs, fetchStillOpen, firstTimers, isBot, policyTexts, prClosingWorkflows,
  type Actor, type Detail, type PR, type Want,
} from "./github";
import {
  ask, candidateLines, evidenceRequest, pointsRequest, reasonsRequest, rulesRequest, typesRequest, PR_TYPES, REASONS, RULES,
  type Answer, type ClosedPR, type JevResult, type PRType,
} from "./jev";

const DAY = 86400_000;
const YES = 0.7; // Jev's own suggested starting threshold for a Noul
const STAFF = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const NEWCOMER = new Set(["NONE", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER"]);
const MAX_NEWCOMER_CHECKS = 60;
const MAX_CLOSED_JUDGED = 60;
const MAX_MERGED_TYPED = 60;
const MAX_RESPONSE_SAMPLE = 40;
const MAX_CLOSER_CHECKS = 160;

const PHASE: Record<RuleId, Phase> = {
  closed_to_outsiders: "before", invite_only: "before", issue_first: "before", assignment: "before", discuss_big: "before",
  tests: "coding", commit_format: "coding", changelog: "coding", ai_banned: "coding",
  cla: "pr", dco: "pr", ai_disclosure: "pr",
  stale_bot: "after", auto_close_newcomers: "after",
};
const SIZES: [string, string, number][] = [
  ["tiny", "Under 20 lines", 20], ["small", "20 to 100 lines", 100], ["medium", "100 to 500 lines", 500], ["large", "Over 500 lines", Infinity],
];

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const noul = (a?: Answer) => (a?.type === "noul" ? a.noul : null);
const score = (a?: Answer) => (a?.type === "score" ? a.score : null);

/** 90% Wilson interval for k wins in n tries: the honest range for a small sample. */
function wilson(k: number, n: number): [number, number] {
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

function who(a: Actor, pr: PR, staff: Set<string>): "the author" | "a maintainer" | "a bot" | "someone else" {
  if (!a || isBot(a)) return "a bot";
  if (a.login === pr.author?.login) return "the author";
  return staff.has(a.login) ? "a maintainer" : "someone else";
}

export async function analyze(env: { GITHUB_TOKEN: string; TYPESAFE_API_KEY: string }, owner: string, name: string): Promise<Analysis> {
  const t0 = Date.now();
  const gh = env.GITHUB_TOKEN;
  const jev = { model: null as string | null, calls: 0, questions: 0, inputTokens: 0, ms: 0, error: null as string | null };
  const run = async (req: { state: unknown; questions: Parameters<typeof ask>[2] } | null): Promise<JevResult | null> => {
    if (!req) return null;
    const t = Date.now();
    try {
      const r = await ask(env.TYPESAFE_API_KEY, req.state, req.questions);
      jev.model = r.model; jev.calls++; jev.questions += r.questions; jev.inputTokens += r.inputTokens;
      return r;
    } catch (e) {
      jev.error = (e as Error).message; // a failed call is an error, never a "no"
      return null;
    } finally {
      jev.ms = Math.max(jev.ms, Date.now() - t);
    }
  };

  // ---- stage 1: the repo, its rules text, and its recent PRs. Jev reads the guide as soon as it arrives. ----
  const metaP = fetchMeta(gh, owner, name);
  const docsP = metaP.then((meta) => {
    const docs = policyTexts(meta);
    const guide = docs.guide || docs.template;
    const lines = candidateLines([docs.guide, docs.aiPolicy, docs.template].filter(Boolean).join("\n\n"));
    return Promise.all([
      docs, lines,
      run(rulesRequest(meta.nameWithOwner, docs, prClosingWorkflows(meta))),
      run(pointsRequest(meta.nameWithOwner, guide, lines)),
      run(evidenceRequest(meta.nameWithOwner, guide, lines)),
    ]);
  });
  docsP.catch(() => {}); // the await below reports it
  const [meta, prs] = await Promise.all([metaP, fetchPRs(gh, owner, name)]);
  const repo = meta.nameWithOwner;
  const now = Date.now();

  // ---- who is staff, who is outside ----
  const staff = new Set<string>([owner]);
  for (const p of [...prs.merged, ...prs.closed]) {
    if (p.mergedBy) staff.add(p.mergedBy.login);
    if (p.author && STAFF.has(p.authorAssociation)) staff.add(p.author.login);
  }
  const outsider = (a: Actor) => !isBot(a) && !staff.has(a!.login);
  const byRecent = (a: PR, b: PR) => Date.parse(b.closedAt) - Date.parse(a.closedAt);
  const outMerged = prs.merged.filter((p) => outsider(p.author)).sort(byRecent);
  const outClosedAll = prs.closed.filter((p) => outsider(p.author)).sort(byRecent);
  const judged = outClosedAll.slice(0, MAX_CLOSED_JUDGED);
  const since = new Date(prs.start).toISOString().slice(0, 10);

  // "Stuck" needs a deadline. Use this repo's own pace: the day by which 90% of merged outside PRs had merged.
  const mergeDays = outMerged.map((p) => (Date.parse(p.mergedAt!) - Date.parse(p.createdAt)) / DAY);
  const stallDays = deadlineDays(mergeDays);

  // ---- stage 2: details for outside PRs only, newcomer checks, PRs left open, and Jev on PR titles ----
  const wants = new Map<number, Want>();
  const want = (p: PR, w: Partial<Want>) => wants.set(p.number, { ...wants.get(p.number), ...w, number: p.number });
  const typed = [...outMerged.slice(0, MAX_MERGED_TYPED), ...judged];
  typed.forEach((p) => want(p, { size: true }));
  judged.forEach((p) => want(p, { comments: true, closer: true }));
  outClosedAll.slice(0, MAX_CLOSER_CHECKS).forEach((p) => want(p, { closer: true }));
  [...outMerged, ...outClosedAll].sort(byRecent).slice(0, MAX_RESPONSE_SAMPLE).forEach((p) => want(p, { response: true }));
  // GitHub's association settles the easy half: an author with no commits in the repo has never been merged.
  // Everyone else (merged in the window, or CONTRIBUTOR) needs a search: did they have a merged PR before it?
  const hasCommits = [...new Set([...outMerged, ...outClosedAll.filter((p) => !NEWCOMER.has(p.authorAssociation))].map((p) => p.author!.login))];
  const checked = hasCommits.slice(0, MAX_NEWCOMER_CHECKS);
  const [details, ftMerged, stillOpen, typesR] = await Promise.all([
    fetchDetails(gh, owner, name, [...wants.values()]),
    firstTimers(gh, repo, checked, since, false),
    // a PR "got stuck" inside the window if it passed the deadline during it
    fetchStillOpen(gh, repo, prs.start - stallDays * DAY, now - stallDays * DAY),
    run(typesRequest(repo, meta.description ?? "", typed)),
  ]);
  const detail = (p: PR): Detail => details.get(p.number) ?? {};

  // a merge bot or script landed these outside GitHub's merge button (pytorch, apache/spark): they did merge
  const closedByCommit = (p: PR) => detail(p).timelineItems?.nodes?.[0]?.closer?.__typename === "Commit";
  const landed = outClosedAll.filter(closedByCommit);
  const botMerge = landed.length > outMerged.length;
  const outM = [...outMerged, ...landed];
  const outC = outClosedAll.filter((p) => !closedByCommit(p));
  const landedAt = (p: PR) => (p.merged ? p.mergedAt : closedByCommit(p) ? p.closedAt : null);
  for (const p of [...outM, ...outC])
    for (const n of [...(detail(p).early?.nodes ?? []), ...(detail(p).reviews?.nodes ?? []), ...(detail(p).last?.nodes ?? [])])
      if (n.author && STAFF.has(n.authorAssociation)) staff.add(n.author.login);

  // ---- stage 3: Jev reads why each outside PR was closed ----
  const toJudge = judged.filter((p) => !closedByCommit(p));
  const closedPRs: ClosedPR[] = toJudge.map((p) => {
    const closer = detail(p).timelineItems?.nodes?.[0]?.actor ?? null;
    const by = closer ? who(closer, p, staff) : "unknown";
    return {
      number: p.number, title: p.title.slice(0, 200),
      daysOpen: Math.max(0, Math.round((Date.parse(p.closedAt) - Date.parse(p.createdAt)) / DAY)),
      closedBy: by === "someone else" ? "a maintainer" : by, // only people with write access can close another person's PR
      lastComments: (detail(p).last?.nodes ?? []).filter((n) => n.bodyText?.trim())
        .map((n) => ({ from: who(n.author, p, staff), text: n.bodyText!.trim().slice(0, 500) })),
    };
  });
  const [reasonsR, ft, [docs, lines, rulesR, pointsR, evidenceR]] = await Promise.all([
    run(reasonsRequest(repo, closedPRs)),
    // GitHub search does not see bot-landed PRs as merged. On such repos ask instead: did they ever finish a PR here before?
    botMerge ? firstTimers(gh, repo, checked, since, true) : ftMerged,
    docsP,
  ]);

  const reasonOf = new Map<number, CloseReason>();
  for (const p of toJudge) {
    const a = reasonsR?.answers[`why_${p.number}`];
    if (a?.type === "choice") reasonOf.set(p.number, a.choice as CloseReason);
  }
  // ---- how each outside PR ended: the table in shared/outcomes.ts. The first row that fits wins. ----
  const facts = (p: PR): PRFacts => ({ open: false, merged: p.merged, closedByCommit: closedByCommit(p), reason: reasonOf.get(p.number) ?? null });
  const outcome = (p: PR) => outcomeOf(facts(p));
  const gotIn = (p: PR) => outcome(p).end === "merged";
  // a PR the author closed is in neither list: it says nothing about what maintainers do
  const wins = [...outM, ...outC.filter(gotIn)], losses = outC.filter((p) => outcome(p).end === "rejected");

  // ---- the three groups, per newcomer: one person counts once ----
  const person = (p: { author: Actor; authorAssociation: string }) =>
    ({ author: p.author!.login, noCommits: NEWCOMER.has(p.authorAssociation), noEarlierMerge: ft.get(p.author!.login) ?? false });
  const stuck = stillOpen.prs.filter((p) => outsider(p.author));
  const scale = stillOpen.prs.length ? stillOpen.total / stillOpen.prs.length : 1; // search returns 100 at most
  const counted = tally([
    ...[...outM, ...outC].map((p) => ({ ...facts(p), ...person(p) })),
    ...stuck.map((p) => ({ open: true, merged: false, closedByCommit: false, reason: null, ...person(p) })),
  ]);
  const nIn = counted.newcomers.merged, nRejected = counted.newcomers.rejected;
  const nStuck = Math.round(counted.newcomers.stuck * scale);
  const tried = nIn + nRejected + nStuck;
  // one extra win and one extra loss keep tiny samples away from 0% and 100%
  const odds = tried >= 3 ? Math.round((100 * (nIn + 1)) / (tried + 2)) : null;
  const [low, high] = tried >= 3 ? wilson(nIn, tried) : [null, null];
  const days = Math.max(1, Math.round((now - prs.start) / DAY));

  // ---- the same outcomes per PR, for the scorecard ----
  const stuckPRs = Math.round(stuck.length * scale);
  const finished = wins.length + losses.length + stuckPRs;
  const waits: number[] = [];
  for (const p of [...outM, ...outC]) {
    const d = detail(p);
    if (!d.early) continue;
    const t = [...d.early.nodes, ...(d.reviews?.nodes ?? [])]
      .filter((n) => n.author && !isBot(n.author) && n.author.login !== p.author!.login && n.createdAt)
      .map((n) => Date.parse(n.createdAt!));
    const at = landedAt(p);
    if (at) t.push(Date.parse(at));
    if (t.length) waits.push((Math.min(...t) - Date.parse(p.createdAt)) / 3600_000);
  }
  const replyH = quantile(waits, 0.5);
  // bot-landed PRs count too, so repos like apache/spark still get a merge time
  const mergeTimes = outM.map((p) => (Date.parse(landedAt(p)!) - Date.parse(p.createdAt)) / DAY);
  const mergeMedian = quantile(mergeTimes, 0.5);
  // "They say why" looks at the closed PRs Jev read that ended as rejected: maintainers closed those
  const byMaintainer = toJudge.filter((p) => reasonOf.has(p.number) && outcome(p).id === "rejected").map((p) => reasonOf.get(p.number)!);
  const explained = byMaintainer.filter((r) => r !== "no_explanation").length;
  const clarity = score(rulesR?.answers.clarity), welcoming = score(rulesR?.answers.welcoming);

  const scorecard: Metric[] = [
    {
      id: "odds", label: "Newcomer merge rate", value: odds === null ? "n/a" : `${odds}%`,
      grade: odds === null ? null : grade("odds", odds),
      math: tried ? `${nIn} of ${plural(tried, "newcomer")} got merged. Maintainers rejected ${nRejected} and left ${nStuck} open.` : "No newcomer sent a PR in this window.",
    },
    {
      id: "reply", label: "First reply", value: replyH === null ? "n/a" : span(replyH),
      grade: replyH === null ? null : grade("reply", replyH),
      math: waits.length ? `${halfOf(waits.length, "finished outside PR")} we sampled got a human reply within this time.` : "No outside PRs to time.",
    },
    {
      id: "merge_time", label: "Time to merge", value: mergeMedian === null ? "n/a" : span(mergeMedian * 24),
      grade: mergeMedian === null ? null : grade("merge_time", mergeMedian),
      math: mergeTimes.length ? `${halfOf(mergeTimes.length, "merged outside PR")} landed within this time.${mergeTimes.length >= 5 ? ` 9 in 10 landed within ${plural(stallDays, "day")}.` : ""}` : "Maintainers merged no outside PRs in this window.",
    },
    {
      id: "stuck", label: "Left hanging", value: finished ? `${pct(stuckPRs, finished)}%` : "n/a",
      grade: finished ? grade("stuck", pct(stuckPRs, finished)) : null,
      math: `${stuckPRs} of ${plural(finished, "outside PR")} sat open past ${plural(stallDays, "day")} with no decision.`,
    },
    {
      id: "explained", label: "They say why", value: byMaintainer.length >= 3 ? `${pct(explained, byMaintainer.length)}%` : "n/a",
      grade: byMaintainer.length >= 3 ? grade("explained", pct(explained, byMaintainer.length)) : null,
      math: byMaintainer.length >= 3 ? `Maintainers gave a reason on ${explained} of the ${byMaintainer.length} PRs they closed.` : "Maintainers closed too few PRs to tell.",
    },
    {
      id: "guide", label: "Contributing guide", value: clarity === null ? "None" : `${Math.round((clarity / 3) * 100)}/100`,
      grade: clarity === null ? (jev.error ? null : "D") : grade("guide", (clarity / 3) * 100),
      math: clarity === null
        ? (jev.error ? "We could not read the guide this time." : "This repo has no contributing guide.")
        : `Scores how well the guide explains getting a PR merged.${welcoming === null ? "" : ` Its welcome to newcomers scores ${Math.round((welcoming / 3) * 100)}/100.`}`,
    },
  ];

  // ---- what gets merged: merge rate by kind of change (Jev) and by size (code) ----
  const slice = (rows: Map<string, { label: string; merged: number; total: number }>): Slice[] =>
    [...rows].map(([key, v]) => ({ key, ...v })).filter((s) => s.total >= 2);
  const types = new Map<string, { label: string; merged: number; total: number }>();
  const sizes = new Map<string, { label: string; merged: number; total: number }>(SIZES.map(([k, label]) => [k, { label, merged: 0, total: 0 }]));
  for (const p of typed) {
    if (outcome(p).id === "withdrawn") continue; // the author pulled it: says nothing about maintainers
    const won = gotIn(p);
    const a = typesR?.answers[`type_${p.number}`];
    if (a?.type === "choice") {
      const row = types.get(a.choice) ?? { label: PR_TYPES[a.choice as PRType]?.label ?? a.choice, merged: 0, total: 0 };
      row.total++; if (won) row.merged++;
      types.set(a.choice, row);
    }
    const d = detail(p);
    if (d.additions !== undefined && d.deletions !== undefined) {
      const row = sizes.get(SIZES.find(([, , max]) => d.additions! + d.deletions! < max)![0])!;
      row.total++; if (won) row.merged++;
    }
  }
  // "Best bet" = the slice we are most sure about (highest low end of its range), and only if it clearly beats the average
  const overall = pct(wins.length, wins.length + losses.length);
  const markBest = (rows: Slice[]) => {
    const top = rows.filter((r) => r.total >= 4).sort((a, b) => wilson(b.merged, b.total)[0] - wilson(a.merged, a.total)[0])[0];
    if (top && pct(top.merged, top.total) >= overall + 10) top.best = true;
    return rows;
  };
  const byType = markBest(slice(types).sort((a, b) => b.merged / b.total - a.merged / a.total || b.total - a.total));
  const bySize = markBest(slice(sizes));

  // ---- the repo's rules (Jev), each with the sentence in the guide that states it ----
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

  // ---- other lines of the guide that are real requirements (Jev picks, we quote) ----
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

  // ---- verdict: the table in shared/rules.ts, over the numbers and Jev's answers. The first row that fits wins. ----
  const is = (id: RuleId) => (prob[id] ?? 0) >= YES;
  const ruling = verdictFor({
    archived: meta.isArchived, guideBansOutsiders: is("closed_to_outsiders"), prsFinished: prs.merged.length + prs.closed.length,
    outsideFinished: wins.length + losses.length, odds, newcomersMerged: nIn, inviteOnly: is("invite_only"), botClosesNewcomers: is("auto_close_newcomers"),
  });
  const { tier, title } = ruling;
  // the rows that close the door, or cannot call it, say why with this repo's numbers
  const reasons: string[] = [];
  if (ruling.id === "archived") reasons.push("The owners archived this repo, so they merge nothing.");
  if (ruling.id === "banned") {
    reasons.push("Their guide says they do not accept outside PRs.");
    if (nIn > 0) reasons.push(`They merged ${plural(nIn, "newcomer")} in the last ${plural(days, "day")}, so the rule looks new.`);
  }
  if (ruling.id === "no_pulse") reasons.push(`Maintainers merged or closed no PRs in the last ${plural(days, "day")}.`);
  if (ruling.id === "quiet") reasons.push(`${plural(wins.length + losses.length, "outside PR")} finished in ${plural(days, "day")}. That is too few to measure.`);
  if (ruling.id === "none_merged") reasons.push(`${plural(nRejected + nStuck, "newcomer")} tried in the last ${plural(days, "day")}. Maintainers merged none.`);
  const open = tier !== "closed" && tier !== "unknown";
  if (is("auto_close_newcomers")) reasons.push("A bot closes PRs from new contributors.");
  if (is("invite_only")) reasons.push("Maintainers close PRs they did not ask for.");
  if (is("ai_banned")) reasons.push("They reject PRs written by AI.");
  const best = byType.find((s) => s.best);
  if (open && best)
    reasons.push(`${best.label} do best here: maintainers merged ${best.merged} of ${best.total}.`);
  if (replyH !== null && replyH > 336) reasons.push("Half of outside PRs wait over two weeks for a reply.");
  else if (open && replyH !== null && replyH <= 24) reasons.push("Half of outside PRs get a human reply within a day.");
  if (open && finished && pct(stuckPRs, finished) >= 30) reasons.push(`Maintainers leave ${pct(stuckPRs, finished)}% of outside PRs open with no decision.`);
  if (open && tried < 10) reasons.push(`${plural(tried, "newcomer")} in ${plural(days, "day")} is a small sample, so the range is wide.`);
  if (jev.error) reasons.push("We could not read their guide this time, so the rules are missing.");

  // ---- outside PRs over time ----
  const byWeek = days >= 28;
  const bucket = byWeek ? 7 * DAY : DAY;
  const n = Math.max(1, Math.min(byWeek ? 13 : 14, Math.ceil((now - prs.start) / bucket)));
  const series = Array.from({ length: n }, (_, i) => {
    const d = new Date(now - (n - i) * bucket + (byWeek ? 0 : bucket / 2));
    return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), merged: 0, closed: 0 };
  });
  for (const p of [...wins, ...losses]) {
    const i = Math.floor((Date.parse(p.closedAt) - (now - n * bucket)) / bucket);
    if (i >= 0 && i < n) series[i][gotIn(p) ? "merged" : "closed"]++;
  }

  const counts = new Map<CloseReason, number>();
  for (const r of reasonOf.values()) counts.set(r, (counts.get(r) ?? 0) + 1);
  const closeReasons = [...counts].sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count, label: REASONS[reason].label, avoidable: REASONS[reason].avoidable }));

  return {
    repo: {
      name: repo, url: meta.url, description: meta.description ?? "", stars: meta.stargazerCount, forks: meta.forkCount,
      language: meta.primaryLanguage?.name ?? null, license: meta.licenseInfo?.spdxId ?? null, archived: meta.isArchived,
      pushedAt: meta.pushedAt, avatar: meta.owner.avatarUrl, openIssues: meta.openIssues.totalCount,
      openPRs: meta.openPRs.totalCount, goodFirstIssues: meta.gfi.totalCount, helpWanted: meta.helpWanted.totalCount,
      guidePath: docs.guidePath, guideUrl: docs.guidePath ? `${meta.url}/blob/HEAD/${docs.guidePath}` : "",
    },
    window: { days, merged: prs.merged.length + landed.length, closed: prs.closed.length - landed.length, capped: prs.capped, stallDays },
    newcomers: { merged: nIn, rejected: nRejected, ignored: nStuck, low, high },
    outside: { merged: wins.length, closed: losses.length, ignored: stuckPRs },
    outcomes: { ...counted.outcomes, stuck: stuckPRs },
    odds: tier === "closed" ? 0 : odds,
    verdict: { tier, title, reasons: reasons.slice(0, 5).map(noPeriod) },
    scorecard: scorecard.map((m) => ({ ...m, math: noPeriod(m.math) })), byType, bySize, rules, points: topPoints, closeReasons, series,
    checks: jev.questions, failed: jev.error !== null,
    tookMs: Date.now() - t0, generatedAt: new Date().toISOString(),
  };
}

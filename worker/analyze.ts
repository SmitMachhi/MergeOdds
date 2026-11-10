// One check of one repo. Numbers come from GitHub and judgments from Jev (gather.ts reads both). The decisions
// (odds, grades, verdict) are plain code, here and in summary.ts.
//
// The model, from first principles. A newcomer's PR ends one of three ways:
//   merged   - the merge button, a merge bot, or a maintainer who landed the commits another way (Jev reads that)
//   rejected - closed without merging, unless the author closed it: that PR counts in no group
//   stuck    - still open after the time by which 90% of merged outside PRs had merged
// shared/outcomes.ts holds those rules as one table, and counts each newcomer once.
// odds = (merged + 1) / (tried + 2), counted per newcomer, with a 90% Wilson interval for the sample size.
import type { Analysis } from "../shared/types";
import { outcomeOf, quantile, tally, type PRFacts } from "../shared/outcomes";
import { verdictFor } from "../shared/rules";
import { noPeriod } from "../shared/text";
import { isBot, type Actor, type PR } from "./github";
import { DAY, gather, NEWCOMER } from "./gather";
import { closeReasons, pct, readGuide, scorecard, score, series, slices, verdictReasons, wilson } from "./summary";

export async function analyze(env: { GITHUB_TOKEN: string; TYPESAFE_API_KEY: string }, owner: string, name: string): Promise<Analysis> {
  const t0 = Date.now();
  const g = await gather(env, owner, name);
  const { meta, prs, now, reasonOf, detail, outM, outC, closedByCommit } = g;

  // ---- how each outside PR ended: the table in shared/outcomes.ts. The first row that fits wins. ----
  const facts = (p: PR): PRFacts => ({ open: false, merged: p.merged, closedByCommit: closedByCommit(p), reason: reasonOf.get(p.number) ?? null });
  const outcome = (p: PR) => outcomeOf(facts(p));
  const gotIn = (p: PR) => outcome(p).end === "merged";
  // a PR the author closed is in neither list: it says nothing about what maintainers do
  const wins = [...outM, ...outC.filter(gotIn)], losses = outC.filter((p) => outcome(p).end === "rejected");
  const landedAt = (p: PR) => (p.merged ? p.mergedAt : closedByCommit(p) ? p.closedAt : null);

  // ---- the three groups, per newcomer: one person counts once ----
  const person = (p: { author: Actor; authorAssociation: string }) =>
    ({ author: p.author!.login, noCommits: NEWCOMER.has(p.authorAssociation), noEarlierMerge: g.ft.get(p.author!.login) ?? false });
  const counted = tally([
    ...[...outM, ...outC].map((p) => ({ ...facts(p), ...person(p) })),
    ...g.stuck.map((p) => ({ open: true, merged: false, closedByCommit: false, reason: null, ...person(p) })),
  ]);
  const nIn = counted.newcomers.merged, nRejected = counted.newcomers.rejected;
  const nStuck = Math.round(counted.newcomers.stuck * g.stuckScale);
  const tried = nIn + nRejected + nStuck;
  // one extra win and one extra loss keep tiny samples away from 0% and 100%
  const odds = tried >= 3 ? Math.round((100 * (nIn + 1)) / (tried + 2)) : null;
  const [low, high] = tried >= 3 ? wilson(nIn, tried) : [null, null];
  const days = Math.max(1, Math.round((now - prs.start) / DAY));

  // ---- the same outcomes per PR, for the scorecard ----
  const stuckPRs = Math.round(g.stuck.length * g.stuckScale);
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
  const byMaintainer = g.toJudge.filter((p) => reasonOf.has(p.number) && outcome(p).id === "rejected").map((p) => reasonOf.get(p.number)!);
  const failed = g.jev.error !== null;
  const card = scorecard({
    odds, tried, nIn, nRejected, nStuck, replyH, replies: waits.length, mergeMedian, merges: mergeTimes.length, stallDays: g.stallDays,
    stuckPRs, finished, closedByMaintainers: byMaintainer.length, explained: byMaintainer.filter((r) => r !== "no_explanation").length,
    clarity: score(g.rulesR?.answers.clarity), welcoming: score(g.rulesR?.answers.welcoming), failed,
  });

  // ---- what gets merged: by kind of change (Jev) and by size (code). The author's own closes say nothing. ----
  const { byType, bySize } = slices(g.typed.filter((p) => outcome(p).id !== "withdrawn").map((p) => {
    const a = g.typesR?.answers[`type_${p.number}`];
    const d = detail(p);
    return {
      won: gotIn(p), type: a?.type === "choice" ? a.choice : null,
      lines: d.additions !== undefined && d.deletions !== undefined ? d.additions + d.deletions : null,
    };
  }), pct(wins.length, wins.length + losses.length));

  // ---- the guide, then the verdict: the table in shared/rules.ts. The first row that fits wins. ----
  const guide = readGuide(g.lines, g.rulesR, g.evidenceR, g.pointsR);
  const ruling = verdictFor({
    archived: meta.isArchived, guideBansOutsiders: guide.is("closed_to_outsiders"), prsFinished: prs.merged.length + prs.closed.length,
    outsideFinished: wins.length + losses.length, odds, newcomersMerged: nIn, inviteOnly: guide.is("invite_only"),
    botClosesNewcomers: guide.is("auto_close_newcomers"),
  });
  const { tier, title } = ruling;
  const reasons = verdictReasons({
    ruling: ruling.id, open: tier !== "closed" && tier !== "unknown", is: guide.is, nIn, days, outsideFinished: wins.length + losses.length,
    nRejected, nStuck, best: byType.find((s) => s.best), replyH, finished, stuckPRs, tried, failed,
  });

  return {
    repo: {
      name: g.repo, url: meta.url, description: meta.description ?? "", stars: meta.stargazerCount, forks: meta.forkCount,
      language: meta.primaryLanguage?.name ?? null, license: meta.licenseInfo?.spdxId ?? null, archived: meta.isArchived,
      pushedAt: meta.pushedAt, avatar: meta.owner.avatarUrl, openIssues: meta.openIssues.totalCount,
      openPRs: meta.openPRs.totalCount, goodFirstIssues: meta.gfi.totalCount, helpWanted: meta.helpWanted.totalCount,
      guidePath: g.docs.guidePath, guideUrl: g.docs.guidePath ? `${meta.url}/blob/HEAD/${g.docs.guidePath}` : "",
    },
    window: { days, merged: prs.merged.length + g.landed.length, closed: prs.closed.length - g.landed.length, capped: prs.capped, stallDays: g.stallDays },
    newcomers: { merged: nIn, rejected: nRejected, ignored: nStuck, low, high },
    outside: { merged: wins.length, closed: losses.length, ignored: stuckPRs },
    outcomes: { ...counted.outcomes, stuck: stuckPRs },
    odds: tier === "closed" ? 0 : odds,
    verdict: { tier, title, reasons: reasons.slice(0, 5).map(noPeriod) },
    scorecard: card.map((m) => ({ ...m, math: noPeriod(m.math) })), byType, bySize, rules: guide.rules, points: guide.points,
    closeReasons: closeReasons(reasonOf.values()),
    series: series([...wins, ...losses].map((p) => ({ closedAt: p.closedAt, won: gotIn(p) })), prs.start, now),
    checks: g.jev.questions, failed,
    tookMs: Date.now() - t0, generatedAt: new Date().toISOString(),
  };
}

// Every read for one check, GitHub first, then Jev, ordered so the slow parts overlap. It reads and sorts; it
// decides nothing. analyze.ts counts what this returns.
import type { CloseReason } from "../shared/types";
import { deadlineDays } from "../shared/outcomes";
import {
  fetchDetails, fetchMeta, fetchPRs, fetchStillOpen, firstTimers, isBot, policyTexts, prClosingWorkflows,
  type Actor, type Detail, type PR, type Want,
} from "./github";
import { ask, candidateLines, pointsRequest, reasonsRequest, typesRequest, type ClosedPR, type JevResult } from "./jev";
import { evidenceRequest, rulesRequest } from "./jev-rules";

export const DAY = 86400_000;
const STAFF = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
export const NEWCOMER = new Set(["NONE", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER"]);
const MAX_NEWCOMER_CHECKS = 60;
const MAX_CLOSED_JUDGED = 60;
const MAX_MERGED_TYPED = 60;
const MAX_RESPONSE_SAMPLE = 40;
const MAX_CLOSER_CHECKS = 160;

function who(a: Actor, pr: PR, staff: Set<string>): "the author" | "a maintainer" | "a bot" | "someone else" {
  if (!a || isBot(a)) return "a bot";
  if (a.login === pr.author?.login) return "the author";
  return staff.has(a.login) ? "a maintainer" : "someone else";
}

export async function gather(env: { GITHUB_TOKEN: string; TYPESAFE_API_KEY: string }, owner: string, name: string) {
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
  // open PRs from outsiders, read after the staff list above is complete
  const stuck = stillOpen.prs.filter((p) => outsider(p.author));
  const stuckScale = stillOpen.prs.length ? stillOpen.total / stillOpen.prs.length : 1; // search returns 100 at most

  return {
    jev, meta, prs, repo, now, docs, lines, rulesR, pointsR, evidenceR, typesR, reasonOf, ft, detail,
    outM, outC, landed, toJudge, typed, stuck, stuckScale, stallDays, closedByCommit,
  };
}

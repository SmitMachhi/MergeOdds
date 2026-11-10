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

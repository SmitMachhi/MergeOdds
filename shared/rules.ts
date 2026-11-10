// The two decision tables of the app: how a number becomes a grade, and how the numbers become a verdict.
// The worker decides with them, and the How it works page prints them, so the page cannot drift from the code.
import type { Grade, Tier } from "./types";

type Cut = { label: string; cuts: readonly [number, number, number, number]; more: boolean; unit: "%" | "hours" | "days" | "points" };

/** The A, B, C and D bars for each scorecard number, keyed by the metric id. Past the D bar is an F.
 *  `more: true` means a higher number is better. */
export const CUTS = {
  odds: { label: "Merge rate", cuts: [60, 40, 25, 10], more: true, unit: "%" },
  reply: { label: "First reply", cuts: [24, 72, 168, 336], more: false, unit: "hours" },
  merge_time: { label: "Time to merge", cuts: [2, 7, 14, 30], more: false, unit: "days" },
  stuck: { label: "Left hanging", cuts: [5, 15, 30, 50], more: false, unit: "%" },
  explained: { label: "They say why", cuts: [85, 70, 50, 30], more: true, unit: "%" },
  guide: { label: "Guide", cuts: [80, 60, 40, 20], more: true, unit: "points" },
} as const satisfies Record<string, Cut>;

export type MetricId = keyof typeof CUTS;

const LETTERS: Grade[] = ["A", "B", "C", "D", "F"];

export function grade(id: MetricId, x: number): Grade {
  const { cuts, more } = CUTS[id];
  const i = cuts.findIndex((c) => (more ? x >= c : x <= c));
  return LETTERS[i === -1 ? 4 : i];
}

/** Everything the verdict looks at. */
export type Facts = {
  archived: boolean;
  /** The classifier read in the guide that outside PRs are not accepted. */
  guideBansOutsiders: boolean;
  /** PRs merged or closed in the days we read, by anyone. */
  prsFinished: number;
  /** Outside PRs merged or closed in those days. */
  outsideFinished: number;
  /** Null when fewer than 3 newcomers tried. */
  odds: number | null;
  newcomersMerged: number;
  inviteOnly: boolean;
  botClosesNewcomers: boolean;
};

export type VerdictId = "archived" | "banned" | "no_pulse" | "quiet" | "none_merged" | "go" | "maybe" | "hard";

/** In order: the first row that fits wins. `when` is the row as the How it works page prints it. */
export const VERDICTS: { id: VerdictId; title: string; tier: Tier; when: string; fits: (f: Facts) => boolean }[] = [
  { id: "archived", title: "Archived", tier: "closed", when: "The owners archived the repo", fits: (f) => f.archived },
  { id: "banned", title: "Closed door", tier: "closed", when: "The guide bans outside PRs", fits: (f) => f.guideBansOutsiders },
  { id: "no_pulse", title: "No pulse", tier: "closed", when: "No PR merged or closed in the days we read", fits: (f) => f.prsFinished === 0 },
  { id: "quiet", title: "Too quiet to call", tier: "unknown", when: "Fewer than 5 outside PRs merged or closed, or fewer than 3 newcomers tried", fits: (f) => f.odds === null || f.outsideFinished < 5 },
  { id: "none_merged", title: "Closed door", tier: "closed", when: "No newcomer got merged", fits: (f) => f.newcomersMerged === 0 },
  {
    id: "go", title: "Go for it", tier: "go", when: "Odds of 40% or more, at least 5 newcomers merged, no rule that PRs need invites, no bot that closes newcomer PRs",
    fits: (f) => (f.odds ?? 0) >= 40 && f.newcomersMerged >= 5 && !f.inviteOnly && !f.botClosesNewcomers,
  },
  { id: "maybe", title: "Worth a shot", tier: "maybe", when: "Odds of 25% or more", fits: (f) => (f.odds ?? 0) >= 25 },
  { id: "hard", title: "Tough crowd", tier: "hard", when: "Odds under 25%", fits: () => true },
];

export const verdictFor = (f: Facts) => VERDICTS.find((v) => v.fits(f))!;

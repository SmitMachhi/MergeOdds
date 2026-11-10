// How one outside PR ended, and how those endings add up per newcomer.
// The worker counts with this file, and the How it works page prints the table, so the page cannot drift from the code.
import type { CloseReason } from "./types";

/** The three groups the odds are made of. */
export type End = "merged" | "rejected" | "stuck";
export type OutcomeId = "merged" | "bot_merged" | "merged_elsewhere" | "withdrawn" | "rejected" | "stuck";

/** What we know about one outside PR. */
export type PRFacts = {
  /** Still open past the deadline. */
  open: boolean;
  /** GitHub shows it as merged. */
  merged: boolean;
  /** Its close event points at one commit: merge bots and scripts land PRs this way. */
  closedByCommit: boolean;
  /** Why it was closed, for the closed PRs the classifier read. Null for the rest. */
  reason: CloseReason | null;
};

/** In order: the first row that fits wins. `when` is the row as the How it works page prints it.
 *  `by` says who settles the row: GitHub's own data, or the classifier's reading of the PR's last comments.
 *  `end` is the group the PR counts in. Null means it counts in none: the author closed it, so it says nothing
 *  about what maintainers do with outside PRs. */
export const OUTCOMES: { id: OutcomeId; end: End | null; by: "github" | "classifier"; when: string; fits: (f: PRFacts) => boolean }[] = [
  { id: "merged", end: "merged", by: "github", when: "GitHub shows it as merged", fits: (f) => f.merged },
  { id: "bot_merged", end: "merged", by: "github", when: "Closed by commit, as merge bots do", fits: (f) => f.closedByCommit },
  { id: "merged_elsewhere", end: "merged", by: "classifier", when: "Maintainers merged the same changes another way", fits: (f) => f.reason === "landed_elsewhere" },
  { id: "withdrawn", end: null, by: "classifier", when: "The author closed it", fits: (f) => f.reason === "author_withdrew" },
  { id: "rejected", end: "rejected", by: "github", when: "Closed for any other reason", fits: (f) => !f.open },
  { id: "stuck", end: "stuck", by: "github", when: "Still open past the deadline", fits: () => true },
];

export const outcomeOf = (f: PRFacts) => OUTCOMES.find((o) => o.fits(f))!;

/** One PR, with what GitHub says about its author. */
export type OutsidePR = PRFacts & {
  author: string;
  /** GitHub says the author has no commits in the repo. */
  noCommits: boolean;
  /** The search found no merged PR by the author before the days we read. False when we did not search. */
  noEarlierMerge: boolean;
};

/** One person counts once, with their best ending: merged beats rejected, and rejected beats stuck. */
export const BEST_FIRST: End[] = ["merged", "rejected", "stuck"];

/** Who is new. A merge gives the author commits, so the search decides there. Authors of open PRs get no
 *  search, so GitHub's answer decides alone. */
const NEW: Record<End, (p: OutsidePR) => boolean> = {
  merged: (p) => p.noEarlierMerge,
  rejected: (p) => p.noCommits || p.noEarlierMerge,
  stuck: (p) => p.noCommits,
};

/** PRs per outcome, and newcomers per group. */
export function tally(prs: OutsidePR[]) {
  const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o.id, 0])) as Record<OutcomeId, number>;
  const people = new Map<string, { end: End; isNew: boolean }>();
  for (const p of prs) {
    const { id, end } = outcomeOf(p);
    outcomes[id]++;
    if (!end) continue;
    const isNew = NEW[end](p);
    if (end === "stuck" && !isNew) continue; // an open PR from someone with commits here says nothing about newcomers
    const was = people.get(p.author);
    // when one person has several PRs with their best ending, the last one in the list says if they are new
    if (!was || BEST_FIRST.indexOf(end) <= BEST_FIRST.indexOf(was.end)) people.set(p.author, { end, isNew });
  }
  const newcomers: Record<End, number> = { merged: 0, rejected: 0, stuck: 0 };
  for (const who of people.values()) if (who.isNew) newcomers[who.end]++;
  return { outcomes, newcomers };
}

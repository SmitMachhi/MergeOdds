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

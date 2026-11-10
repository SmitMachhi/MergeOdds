import type { OutcomeId } from "./outcomes";

export type Tier = "go" | "maybe" | "hard" | "closed" | "unknown";
export type Grade = "A" | "B" | "C" | "D" | "F";

export type RuleId =
  | "issue_first" | "assignment" | "discuss_big" | "tests" | "commit_format" | "changelog"
  | "cla" | "dco" | "ai_disclosure" | "ai_banned" | "invite_only" | "closed_to_outsiders"
  | "auto_close_newcomers" | "stale_bot";

export type Phase = "before" | "coding" | "pr" | "after";

/** One thing the repo asks of you. `quote` is the sentence in their guide that says so. */
export type Rule = { id: RuleId; label: string; p: number; kind: "todo" | "warning" | "blocker"; phase: Phase; quote: string | null };

export type PointCategory =
  | "before_coding" | "code_quality" | "pr_format" | "legal" | "ai_use" | "setup" | "community";

export type Point = { text: string; p: number; category: PointCategory };

export type CloseReason =
  | "inactive" | "landed_elsewhere" | "superseded" | "not_wanted" | "broke_rules" | "low_quality"
  | "author_withdrew" | "no_explanation";

/** One row of the scorecard. `math` spells out how the value was worked out, with the real numbers. */
export type Metric = { id: string; label: string; value: string; grade: Grade | null; math: string };

/** Merge rate for one slice of outside PRs (a kind of change, or a size). */
export type Slice = { key: string; label: string; merged: number; total: number; best?: boolean };

export type Analysis = {
  repo: {
    name: string; url: string; description: string; stars: number; forks: number; language: string | null;
    license: string | null; archived: boolean; pushedAt: string; avatar: string; openIssues: number;
    openPRs: number; goodFirstIssues: number; helpWanted: number; guidePath: string; guideUrl: string;
  };
  window: { days: number; merged: number; closed: number; capped: boolean; stallDays: number };
  /** Newcomers who tried in the window, by how it ended. odds = merged / (merged + rejected + ignored).
   *  Someone whose PRs were all closed by the author is in none of the three. */
  newcomers: { merged: number; rejected: number; ignored: number; low: number | null; high: number | null };
  /** Outside PRs maintainers decided on, or left open. `closed` leaves out the PRs the author closed. */
  outside: { merged: number; closed: number; ignored: number };
  /** Outside PRs by how each one ended, as the table in shared/outcomes.ts sorts them. The merged kinds add up to
   *  `outside.merged`, `rejected` is `outside.closed`, and `withdrawn` counts in neither. */
  outcomes: Record<OutcomeId, number>;
  odds: number | null;
  verdict: { tier: Tier; title: string; reasons: string[] };
  scorecard: Metric[];
  byType: Slice[];
  bySize: Slice[];
  rules: Rule[];
  points: Point[];
  closeReasons: { reason: CloseReason; label: string; count: number; avoidable: boolean }[];
  series: { label: string; merged: number; closed: number }[];
  /** How many questions about the repo were answered, and whether reading its text failed this time. */
  checks: number;
  failed: boolean;
  tookMs: number;
  generatedAt: string;
};

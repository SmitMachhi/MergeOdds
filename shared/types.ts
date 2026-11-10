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

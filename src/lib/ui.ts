import type { DitherColor } from "@/components/dither-kit";
import type { Analysis, CloseReason, Grade, Phase, PointCategory, Tier } from "../../shared/types";

/** Brand color: buttons and the page wash. Outcome colors (green merged, red rejected) stay as they are. */
export const BRAND: DitherColor = "red";

export const TIER: Record<Tier, { color: DitherColor; text: string }> = {
  go: { color: "green", text: "text-emerald-400" },
  maybe: { color: "blue", text: "text-sky-400" },
  hard: { color: "orange", text: "text-orange-400" },
  closed: { color: "red", text: "text-red-400" },
  unknown: { color: "grey", text: "text-zinc-400" },
};

/** A grade tile fills from the bottom, like a level meter: taller and denser for a better grade. */
/** `plate` is the solid square behind the letter: a deeper shade of the grade colour, so a white letter reads on it. */
export const GRADE: Record<Grade, { text: string; fill: string; height: string; plate: string }> = {
  A: { text: "text-emerald-400", fill: "dither-75", height: "100%", plate: "bg-emerald-700" },
  B: { text: "text-emerald-400", fill: "dither-50", height: "80%", plate: "bg-emerald-700" },
  C: { text: "text-amber-400", fill: "dither-50", height: "60%", plate: "bg-amber-700" },
  D: { text: "text-orange-400", fill: "dither-50", height: "40%", plate: "bg-orange-700" },
  F: { text: "text-red-400", fill: "dither-50", height: "20%", plate: "bg-red-600" },
};

export const PHASES: [Phase, string][] = [
  ["before", "Before you code"], ["coding", "While you code"], ["pr", "Opening the PR"], ["after", "After it's open"],
];

export const REASON_COLOR: Record<CloseReason, DitherColor> = {
  landed_elsewhere: "green", superseded: "blue", not_wanted: "red", inactive: "orange",
  author_withdrew: "purple", broke_rules: "pink", low_quality: "pink", no_explanation: "grey",
};

export const CATEGORY: Record<PointCategory, string> = {
  before_coding: "Before coding", code_quality: "Code", pr_format: "PR format",
  legal: "Legal", ai_use: "AI tools", setup: "Setup", community: "Community",
};

export const compact = (n: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export async function fetchAnalysis(repo: string, signal?: AbortSignal): Promise<Analysis> {
  const res = await fetch(`/api/analyze?repo=${encodeURIComponent(repo)}`, { signal });
  const body = (await res.json()) as Analysis | { error: string };
  if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : `Request failed (${res.status})`);
  return body;
}

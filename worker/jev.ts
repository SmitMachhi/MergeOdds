// The one seam to Jev, the classifier: the client, and the questions about single guide lines and single PRs.
// The questions about the repo's rules are in jev-rules.ts. Jev makes the judgments; analyze.ts decides what they mean.
import type { CloseReason, PointCategory } from "../shared/types";

type Noul = { type: "noul"; instructions: unknown; criteria?: { true?: string; false?: string } };
type Choice = { type: "choice"; instructions: unknown; criteria: Record<string, string | null> };
type Score = { type: "score"; instructions: unknown; criteria: string[] };
export type Question = Noul | Choice | Score;

export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; probabilities: Record<string, number> };

export type JevResult = { answers: Record<string, Answer>; model: string; inputTokens: number; questions: number };

export async function ask(key: string, state: unknown, questions: Record<string, Question>): Promise<JevResult> {
  const body = JSON.stringify({ model: "jev-latest", state, questions });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body,
    });
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * Number(res.headers.get("retry-after") ?? 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const r = (await res.json()) as { model: string; answers: Record<string, Answer>; usage?: { input_tokens?: number } };
    return { answers: r.answers, model: r.model, inputTokens: r.usage?.input_tokens ?? 0, questions: Object.keys(questions).length };
  }
}

// ---------- 2. Which lines of the guide matter ----------

const CATEGORY_CRITERIA: Record<PointCategory, string> = {
  before_coding: "Opening, finding, or claiming an issue, or talking to maintainers before starting work",
  code_quality: "Tests, linting, formatting, type checks, or coding style",
  pr_format: "How the pull request, its title, its description, or its commits must look",
  legal: "License agreements, sign-offs, or copyright",
  ai_use: "Use or disclosure of AI coding tools",
  setup: "Installing dependencies, building, or running the project locally",
  community: "Conduct, communication channels, or how to ask for help",
};

/** Lines a person could act on: prose or bullets, not headings, code, tables or bare links. */
export function candidateLines(markdown: string, max = 120): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let inCode = false;
  for (const raw of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(raw)) { inCode = !inCode; continue; }
    if (inCode || /^\s*(#|\||<|!\[|-{3,}|={3,})/.test(raw)) continue;
    const line = raw
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`]{1,3}/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();
    // split long paragraphs into sentences so one rule = one question
    for (const s of line.length > 240 ? line.split(/(?<=[.!?])\s+(?=[A-Z])/) : [line]) {
      const t = s.trim();
      if (t.length < 35 || t.length > 320 || seen.has(t.toLowerCase())) continue;
      // "Those need a go-ahead first" means nothing without the sentence before it
      if (/^(Those|These|They) (need|are|were|will|must|should|can|may|do|have)\b/.test(t)) continue;
      seen.add(t.toLowerCase());
      out.push(t);
      if (out.length >= max) return out;
    }
  }
  return out;
}

export function pointsRequest(repo: string, guide: string, lines: string[]) {
  if (!lines.length) return null;
  const questions: Record<string, Question> = {};
  lines.forEach((line, i) => {
    questions[`must_${i}`] = {
      type: "noul",
      instructions: `Does this line from the contributing guide state something a contributor must do, or must not do, for their pull request to be merged? Line: "${line}"`,
      criteria: {
        true: "The line is a concrete requirement or a concrete prohibition for contributors",
        false: "The line is background, a description of the project, a greeting, or optional advice",
      },
    };
    questions[`cat_${i}`] = {
      type: "choice",
      instructions: `What is this line from the contributing guide about? Line: "${line}"`,
      criteria: CATEGORY_CRITERIA,
    };
  });
  return { state: { repository: repo, contributing_guide: guide.slice(0, 60_000) }, questions };
}

// ---------- 3. What kind of PR each one is ----------

export const PR_TYPES = {
  bug_fix: { label: "Bug fixes", when: "Fixes a bug, crash, regression, or wrong behavior" },
  new_feature: { label: "New features", when: "Adds a new capability, option, integration, or API" },
  documentation: { label: "Docs", when: "Changes documentation, comments, examples, or translations only" },
  tests: { label: "Tests", when: "Adds or fixes tests only" },
  refactor: { label: "Refactors", when: "Restructures, cleans up, or speeds up code without changing what it does" },
  build_or_deps: { label: "Build and deps", when: "Changes dependencies, CI, build scripts, or tooling" },
} as const;
export type PRType = keyof typeof PR_TYPES;

export function typesRequest(repo: string, description: string, prs: { number: number; title: string }[]) {
  if (!prs.length) return null;
  const criteria = Object.fromEntries(Object.entries(PR_TYPES).map(([k, v]) => [k, v.when]));
  const questions: Record<string, Question> = {};
  for (const pr of prs) {
    questions[`type_${pr.number}`] = {
      type: "choice",
      instructions: `What kind of change does a pull request with this title make? Title: "${pr.title.slice(0, 200)}"`,
      criteria,
    };
  }
  return { state: { repository: repo, about: description }, questions };
}

// ---------- 4. Why outside PRs got closed ----------

export const REASONS: Record<CloseReason, { label: string; avoidable: boolean; when: string }> = {
  inactive: { label: "Went stale", avoidable: true, when: "Closed because nobody worked on it for a long time, often by a stale bot" },
  author_withdrew: { label: "Author withdrew it", avoidable: true, when: "The author closed it themself, for example to redo it, or because it was opened by mistake" },
  broke_rules: { label: "Broke a rule", avoidable: true, when: "Closed because it broke a contribution rule, such as no linked issue, no assignment, an unsigned CLA, or an AI policy" },
  low_quality: { label: "Low effort or spam", avoidable: true, when: "Closed as spam, a trivial change, or low-effort work" },
  // LocalAI does this a lot: a maintainer bundles the commits into their own PR, keeps the authorship, closes the original
  landed_elsewhere: { label: "Merged another way", avoidable: false, when: "A maintainer took this pull request's own commits and merged them through a different pull request or directly, keeping the author's credit" },
  superseded: { label: "Someone else fixed it", avoidable: false, when: "Closed because someone else's separate pull request or commit already solved the same problem" },
  not_wanted: { label: "Maintainers said no", avoidable: false, when: "Maintainers decided they do not want this change in the project" },
  no_explanation: { label: "No reason given", avoidable: false, when: "Nothing in the pull request says why it was closed" },
};

export type ClosedPR = {
  number: number; title: string; daysOpen: number; closedBy: "the author" | "a maintainer" | "a bot" | "unknown";
  lastComments: { from: "the author" | "a maintainer" | "a bot" | "someone else"; text: string }[];
};

export function reasonsRequest(repo: string, prs: ClosedPR[]) {
  if (!prs.length) return null;
  const questions: Record<string, Question> = {};
  const criteria = Object.fromEntries(Object.entries(REASONS).map(([k, v]) => [k, v.when]));
  for (const pr of prs) {
    questions[`why_${pr.number}`] = {
      type: "choice",
      instructions: {
        question: "Why was this pull request closed without being merged?",
        pull_request: { title: pr.title, days_open: pr.daysOpen, closed_by: pr.closedBy, last_comments: pr.lastComments },
      },
      criteria,
    };
  }
  return {
    state: { repository: repo, note: "Each question describes one pull request from an outside contributor that was closed without merging." },
    questions,
  };
}

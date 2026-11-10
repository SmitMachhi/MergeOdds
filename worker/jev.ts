// Every question Jev is asked lives in this file. Jev makes the judgments; analyze.ts decides what they mean.
import type { CloseReason, PointCategory, RuleId } from "../shared/types";

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

// ---------- 1. The repo's rules ----------

export const RULES: Record<RuleId, { label: string; kind: "todo" | "warning" | "blocker"; from: "docs" | "workflows"; q: string; yes: string; no: string }> = {
  issue_first: {
    label: "Open or find an issue before you send a PR", kind: "todo", from: "docs",
    q: "Do the contribution rules require a pull request to be linked to an existing issue?",
    yes: "The rules say a pull request must reference or link an issue, or that an issue must exist first",
    no: "The rules let a contributor open a pull request without any issue",
  },
  assignment: {
    label: "Ask a maintainer to assign you the issue first", kind: "todo", from: "docs",
    q: "Do the contribution rules require a contributor to be assigned to an issue, or to get a maintainer's approval, before working on it?",
    yes: "The rules say to wait for assignment or maintainer approval before starting work",
    no: "The rules let anyone start work without assignment or approval",
  },
  discuss_big: {
    label: "Discuss big changes with maintainers first", kind: "todo", from: "docs",
    q: "Do the contribution rules ask contributors to discuss large changes or new features with maintainers before writing code?",
    yes: "The rules ask for a discussion, proposal, or RFC before large changes",
    no: "The rules do not mention discussing changes before writing code",
  },
  tests: {
    label: "Add tests with your change", kind: "todo", from: "docs",
    q: "Do the contribution rules require pull requests to include tests?",
    yes: "The rules say code changes must come with new or updated tests",
    no: "The rules do not ask contributors to add tests",
  },
  commit_format: {
    label: "Follow the commit or PR title format", kind: "todo", from: "docs",
    q: "Do the contribution rules require a specific format for commit messages or pull request titles?",
    yes: "The rules name a required format such as Conventional Commits or a title prefix",
    no: "The rules do not set a format for commit messages or pull request titles",
  },
  changelog: {
    label: "Add a changelog entry", kind: "todo", from: "docs",
    q: "Do the contribution rules require contributors to add a changelog entry, changeset, or release note?",
    yes: "The rules say to add a changelog entry, changeset file, or release note",
    no: "The rules do not ask for a changelog entry",
  },
  cla: {
    label: "Sign the Contributor License Agreement", kind: "todo", from: "docs",
    q: "Must contributors sign a Contributor License Agreement (CLA)?",
    yes: "The rules say contributors must sign a CLA",
    no: "The rules do not mention a CLA",
  },
  dco: {
    label: "Sign off your commits (DCO)", kind: "todo", from: "docs",
    q: "Must commits carry a Signed-off-by line (Developer Certificate of Origin)?",
    yes: "The rules require a DCO sign-off on commits",
    no: "The rules do not mention a DCO sign-off",
  },
  ai_disclosure: {
    label: "Say so if you used AI tools", kind: "todo", from: "docs",
    q: "Do the contribution rules require contributors to disclose their use of AI tools?",
    yes: "The rules say AI assistance must be disclosed in the pull request",
    no: "The rules do not ask contributors to disclose AI use",
  },
  ai_banned: {
    label: "They reject AI-written PRs", kind: "warning", from: "docs",
    q: "Do the contribution rules forbid pull requests written by AI tools or AI agents?",
    yes: "The rules say AI-generated or agent-submitted pull requests are rejected or not allowed",
    no: "The rules allow AI-assisted contributions, or do not mention AI",
  },
  invite_only: {
    label: "Send a PR after a maintainer asks for it", kind: "warning", from: "docs",
    q: "Do the contribution rules say pull requests are only accepted when a maintainer has asked for or approved the work in advance?",
    yes: "The rules say unsolicited pull requests will be closed or are not wanted",
    no: "The rules welcome pull requests from anyone",
  },
  closed_to_outsiders: {
    label: "This project does not take outside PRs", kind: "blocker", from: "docs",
    q: "Do the contribution rules say the project does not accept pull requests from outside contributors?",
    yes: "The rules say outside pull requests are not accepted or are disabled",
    no: "The rules accept pull requests from outside contributors",
  },
  auto_close_newcomers: {
    label: "A bot closes PRs from new contributors", kind: "blocker", from: "workflows",
    q: "Does any workflow in `pr_closing_workflows` automatically close pull requests because of who the author is, such as first-time or non-member contributors?",
    yes: "A workflow closes pull requests based on the author's association or contribution history",
    no: "Workflows only close pull requests for other reasons, such as inactivity",
  },
  stale_bot: {
    label: "Keep your PR moving: a bot closes quiet ones", kind: "todo", from: "workflows",
    q: "Does any workflow in `pr_closing_workflows` automatically close pull requests after a period of inactivity?",
    yes: "A workflow marks pull requests stale and closes them after inactivity",
    no: "No workflow closes pull requests for inactivity",
  },
};

export function rulesRequest(repo: string, docs: { guide: string; template: string; aiPolicy: string }, workflows: Record<string, string>) {
  const hasDocs = !!(docs.guide || docs.template || docs.aiPolicy);
  const hasWf = Object.keys(workflows).length > 0;
  if (!hasDocs && !hasWf) return null;
  // Leave out empty fields: the model can read an empty value as a signal.
  const state: Record<string, unknown> = { repository: repo };
  if (docs.guide) state.contributing_guide = docs.guide.slice(0, 60_000);
  if (docs.aiPolicy) state.ai_policy = docs.aiPolicy.slice(0, 12_000);
  if (docs.template) state.pull_request_template = docs.template.slice(0, 6_000);
  if (hasWf) state.pr_closing_workflows = workflows;
  const questions: Record<string, Question> = {};
  for (const [id, r] of Object.entries(RULES)) {
    if (r.from === "docs" ? !hasDocs : !hasWf) continue;
    questions[id] = { type: "noul", instructions: r.q, criteria: { true: r.yes, false: r.no } };
  }
  if (docs.guide) {
    questions.welcoming = {
      type: "score", instructions: "How welcoming is `contributing_guide` toward first-time outside contributors?",
      criteria: [
        "The guide discourages outside contributors or warns them off",
        "The guide lists rules but says nothing to welcome newcomers",
        "The guide says contributions are welcome and explains how to start",
        "The guide actively invites newcomers, points them to starter issues, and offers help",
      ],
    };
    questions.clarity = {
      type: "score", instructions: "How clearly does `contributing_guide` explain the steps to get a pull request merged?",
      criteria: [
        "The guide gives no concrete steps",
        "The guide gives a few steps but leaves out setup or the review process",
        "The guide covers setup, coding rules, and how to submit a pull request",
        "The guide walks through every step from setup to merge, with commands and examples",
      ],
    };
  }
  return { state, questions };
}

// ---------- 2. Which lines of the guide matter ----------

export const CATEGORY_LABEL: Record<PointCategory, string> = {
  before_coding: "Before you code", code_quality: "Code quality", pr_format: "PR format",
  legal: "Legal", ai_use: "AI tools", setup: "Setup", community: "Community",
};

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

/** For each line: which rule, if any, does it state? Lets every checklist item show the sentence behind it. */
export function evidenceRequest(repo: string, guide: string, lines: string[]) {
  if (!lines.length) return null;
  const criteria: Record<string, string> = { no_rule: "The line states none of these rules" };
  for (const [id, r] of Object.entries(RULES)) if (r.from === "docs") criteria[id] = r.yes;
  const questions: Record<string, Question> = {};
  lines.forEach((line, i) => {
    questions[`rule_${i}`] = {
      type: "choice",
      instructions: `Which contribution rule does this line from the contributing guide state? Line: "${line}"`,
      criteria,
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

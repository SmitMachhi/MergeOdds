// The questions Jev answers about the repo's rules: one yes or no per rule, two ratings of the guide, and which
// rule each guide line states. jev.ts holds the client and the other questions.
import type { RuleId } from "../shared/types";
import type { Question } from "./jev";

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

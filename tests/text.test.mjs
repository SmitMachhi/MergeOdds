// Guards the words the app shows. Run with: npm test
//
// It reads the source files, pulls out the text a visitor can see, and fails on the writing habits we ruled out:
// em dashes, exclamation marks, "-ly" adverbs, filler words, and the name of the engine behind the answers.
// Quotes from a repo's own contributing guide are shown word for word, so they are out of scope.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkedAgo, halfOf, noPeriod, plural } from "../shared/text.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Every string and every piece of JSX text in these files reaches the page.
const PAGE_FILES = ["index.html", "src/App.tsx", "src/components/report.tsx", "src/components/report-parts.tsx", "src/components/card.tsx", "src/components/loading.tsx", "src/components/how.tsx", "src/components/how-layout.tsx", "src/components/how-visuals.tsx", "src/components/frame.tsx", "src/lib/ui.ts", "shared/types.ts", "shared/text.ts", "shared/check.ts", "shared/rules.ts", "shared/outcomes.ts"];
// In the worker only some lines reach the page: labels, scorecard sums, verdict titles and reasons.
const WORKER_FILES = { "worker/summary.ts": /\b(label|value|math|title)\s*[:=]|reasons\.push\(/, "worker/jev.ts": /\blabel:/, "worker/jev-rules.ts": /\blabel:/, "worker/index.ts": /error:/, "worker/budget.ts": /^export const [A-Z_]+ = "/ };

// Words ending in "ly" that are not adverbs.
// "likely" is on the list for "how likely": there it is an adjective. Do not write "will likely".
const NOT_ADVERBS = new Set(["reply", "apply", "supply", "rely", "family", "assembly", "fly", "july", "italy", "early", "ally", "likely"]);
const FILLER = ["really", "just", "actually", "simply", "very", "basically", "seamless", "leverage", "delve", "crucial", "robust"];

/** String literals and JSX text in a chunk of source. Class lists and identifiers are skipped. */
function visibleText(source) {
  const found = [];
  const patterns = [/"((?:[^"\\\n]|\\.)*)"/g, /'((?:[^'\\\n]|\\.)*)'/g, /`((?:[^`\\]|\\.)*)`/g, />([^<>{}]+)</g];
  for (const re of patterns) for (const m of source.matchAll(re)) found.push(m[1]);
  return found
    .map((s) => s.replace(/\$\{[^}]*\}/g, "N").trim()) // template holes read as a number
    .filter((s) => /[a-zA-Z]{2,} [a-zA-Z]{2,}/.test(s)) // at least two words
    .filter((s) => {
      const tokens = s.split(/\s+/);
      const classy = tokens.filter((t) => /^[a-z0-9:[\]/.%!-]*[-:[][a-z0-9[\]/.%-]+$/.test(t)).length;
      return classy < tokens.length / 2; // mostly Tailwind classes: not prose
    });
}

// The "How it works" page is the one place allowed to name the engine: it exists to explain it.
const MAY_NAME_ENGINE = new Set(["src/components/how.tsx", "src/components/how-visuals.tsx"]);
// That page is also written without "a" and "an". A grade letter ("A to F") is not an article, and a quote from
// a GitHub thread keeps its own words.
// shared/rules.ts and shared/outcomes.ts hold the table rows that page prints.
const NO_ARTICLES = new Set(["src/components/how.tsx", "src/components/how-layout.tsx", "src/components/how-visuals.tsx", "shared/rules.ts", "shared/outcomes.ts"]);
const article = (text) => /(^|[.:?] )An? [a-z]|\b(a|an) /.test(text.replace(/"[^"]*"/g, ""));

function problems(text, file) {
  const out = [];
  if (/[—–]/.test(text)) out.push("em or en dash");
  if (/!(?!=)/.test(text)) out.push("exclamation mark");
  if (!MAY_NAME_ENGINE.has(file) && /\bjev\b|typesafe/i.test(text)) out.push("names the engine");
  if (NO_ARTICLES.has(file) && article(text)) out.push("indefinite article");
  for (const w of text.toLowerCase().match(/[a-z']+/g) ?? []) {
    if (w.endsWith("ly") && w.length > 3 && !NOT_ADVERBS.has(w)) out.push(`adverb "${w}"`);
    if (FILLER.includes(w)) out.push(`filler "${w}"`);
  }
  return out;
}

test("page text follows the writing rules", () => {
  const bad = [];
  for (const file of PAGE_FILES) {
    for (const text of visibleText(read(file))) for (const p of problems(text, file)) bad.push(`${file}: ${p} in "${text}"`);
  }
  for (const [file, visible] of Object.entries(WORKER_FILES)) {
    const lines = read(file).split("\n").filter((l) => visible.test(l));
    // The jev files put a label next to each question they ask the engine. Only the label reaches the page.
    const texts = file.startsWith("worker/jev")
      ? lines.flatMap((l) => [...l.matchAll(/\blabel:\s*"([^"]*)"/g)].map((m) => m[1]))
      : visibleText(lines.join("\n"));
    for (const text of texts) for (const p of problems(text, file)) bad.push(`${file}: ${p} in "${text}"`);
  }
  assert.deepEqual(bad, []);
});

test("the page never names the engine, even in comments or field names", () => {
  for (const file of PAGE_FILES) if (!MAY_NAME_ENGINE.has(file)) assert.doesNotMatch(read(file), /jev|typesafe/i, file);
});

test("counts of one read as singular", () => {
  assert.equal(plural(1, "newcomer"), "1 newcomer");
  assert.equal(plural(0, "newcomer"), "0 newcomers");
  assert.equal(plural(21, "day"), "21 days");
  assert.equal(halfOf(1, "merged outside PR"), "The one merged outside PR");
  assert.equal(halfOf(14, "merged outside PR"), "Half of the 14 merged outside PRs");
});

test("captions drop the last period and keep the ones between sentences", () => {
  assert.equal(noPeriod("16 of 21 got merged. Maintainers rejected 2."), "16 of 21 got merged. Maintainers rejected 2");
  assert.equal(noPeriod("No rules here"), "No rules here");
});

test("a stored result says how old it is", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  assert.equal(checkedAgo("2026-11-09T08:00:00Z", now), "Checked today");
  assert.equal(checkedAgo("2026-11-08T08:00:00Z", now), "Checked 1 day ago");
  assert.equal(checkedAgo("2026-11-03T08:00:00Z", now), "Checked 6 days ago");
});

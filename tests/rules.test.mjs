// Checks the grade and verdict tables (shared/rules.ts). Run with: npm test
//
// The tables replaced an if-chain and six lists of cut-offs inside the worker. `oldVerdict` and `oldGrade` below are
// that code, kept word for word, and the tests compare the tables with it on thousands of made-up repos.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CUTS, grade, VERDICTS, verdictFor } from "../shared/rules.ts";

function oldVerdict(f) {
  if (f.archived) return ["closed", "Archived"];
  if (f.guideBansOutsiders) return ["closed", "Closed door"];
  if (f.prsFinished === 0) return ["closed", "No pulse"];
  if (f.odds === null || f.outsideFinished < 5) return ["unknown", "Too quiet to call"];
  if (f.newcomersMerged === 0) return ["closed", "Closed door"];
  if (f.odds >= 40 && f.newcomersMerged >= 5 && !f.inviteOnly && !f.botClosesNewcomers) return ["go", "Go for it"];
  if (f.odds >= 25) return ["maybe", "Worth a shot"];
  return ["hard", "Tough crowd"];
}

function oldGrade(x, cuts, higherIsBetter = true) {
  const i = cuts.findIndex((c) => (higherIsBetter ? x >= c : x <= c));
  return ["A", "B", "C", "D", "F"][i === -1 ? 4 : i];
}
const OLD_CUTS = {
  odds: [[60, 40, 25, 10], true], reply: [[24, 72, 168, 336], false], merge_time: [[2, 7, 14, 30], false],
  stuck: [[5, 15, 30, 50], false], explained: [[85, 70, 50, 30], true], guide: [[80, 60, 40, 20], true],
};

// a small fixed-seed generator, so a failure repeats
let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (...xs) => xs[Math.floor(rand() * xs.length)];
const yes = (p) => rand() < p;

test("the verdict table decides like the code it replaced", () => {
  for (let i = 0; i < 20000; i++) {
    const f = {
      archived: yes(0.05), guideBansOutsiders: yes(0.1), prsFinished: pick(0, 1, 40, 400), outsideFinished: pick(0, 3, 4, 5, 6, 80),
      odds: pick(null, 0, 3, 24, 25, 26, 39, 40, 41, 74, 100), newcomersMerged: pick(0, 1, 4, 5, 6, 30), inviteOnly: yes(0.15), botClosesNewcomers: yes(0.15),
    };
    const v = verdictFor(f);
    assert.deepEqual([v.tier, v.title], oldVerdict(f), JSON.stringify(f));
  }
});

test("each verdict row can win, and the last row takes what is left", () => {
  const base = { archived: false, guideBansOutsiders: false, prsFinished: 100, outsideFinished: 40, odds: 50, newcomersMerged: 10, inviteOnly: false, botClosesNewcomers: false };
  const cases = {
    archived: { archived: true }, banned: { guideBansOutsiders: true }, no_pulse: { prsFinished: 0 }, quiet: { outsideFinished: 4 },
    none_merged: { newcomersMerged: 0 }, go: {}, maybe: { inviteOnly: true }, hard: { odds: 10 },
  };
  assert.deepEqual(Object.keys(cases), VERDICTS.map((v) => v.id));
  for (const [id, change] of Object.entries(cases)) assert.equal(verdictFor({ ...base, ...change }).id, id);
  assert.equal(verdictFor({ ...base, odds: null }).id, "quiet"); // fewer than 3 newcomers tried
});

test("the grade table grades like the code it replaced", () => {
  assert.deepEqual(Object.keys(CUTS), Object.keys(OLD_CUTS));
  for (const [id, [cuts, more]] of Object.entries(OLD_CUTS)) {
    for (let x = -5; x <= 400; x += 0.5) assert.equal(grade(id, x), oldGrade(x, cuts, more), `${id} at ${x}`);
  }
});

test("a number on the bar gets the bar's grade", () => {
  assert.equal(grade("odds", 60), "A");
  assert.equal(grade("odds", 59), "B");
  assert.equal(grade("odds", 9), "F");
  assert.equal(grade("reply", 24), "A");
  assert.equal(grade("reply", 25), "B");
  assert.equal(grade("stuck", 51), "F");
});

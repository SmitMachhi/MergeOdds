// Checks how PRs are sorted into outcomes and counted per newcomer (shared/outcomes.ts). Run with: npm test
//
// The table replaced checks that were spread over the worker. `oldCount` and `oldDeadline` below are that code, kept
// as it was, and the tests compare the table with it three ways: on each mix of facts one PR can have, on thousands
// of made-up repos, and on real PRs from 7 checks saved in tests/fixtures/outcomes.json.
//
// One rule changed on purpose after that, on 10 November 2026: a PR the author closed counts in no group, where the
// old code counted it as rejected. So the tests give the old code the same PRs without those.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BEST_FIRST, deadlineDays, outcomeOf, OUTCOMES, tally } from "../shared/outcomes.ts";

const REASONS = ["inactive", "landed_elsewhere", "superseded", "not_wanted", "broke_rules", "low_quality", "author_withdrew", "no_explanation"];

/** The worker's old way, on the same list of PRs: who got in, who lost, and one group per newcomer. */
function oldCount(prs) {
  const closed = prs.filter((p) => !p.open);
  const landedBy = (p) => p.closedByCommit;
  const outMerged = closed.filter((p) => p.merged);
  const outClosedAll = closed.filter((p) => !p.merged);
  const outM = [...outMerged, ...outClosedAll.filter(landedBy)];
  const outC = outClosedAll.filter((p) => !landedBy(p));
  const viaOther = new Set(outC.filter((p) => p.reason === "landed_elsewhere"));
  const gotIn = (p) => p.merged || viaOther.has(p);
  const wins = [...outM, ...outC.filter(gotIn)], losses = outC.filter((p) => !gotIn(p));

  const isNew = (l) => prs.find((p) => p.author === l).noEarlierMerge; // one search per author
  const mergedAuthors = new Set(wins.map((p) => p.author));
  const rejectedAuthors = new Map();
  for (const p of losses) if (!mergedAuthors.has(p.author)) rejectedAuthors.set(p.author, p.noCommits || isNew(p.author));
  const stuck = prs.filter((p) => p.open);
  const stuckNew = new Set(stuck.filter((p) => p.noCommits).map((p) => p.author).filter((l) => !mergedAuthors.has(l) && !rejectedAuthors.has(l)));
  return {
    wins: wins.length, losses: losses.length, stuck: stuck.length,
    newcomers: { merged: [...mergedAuthors].filter(isNew).length, rejected: [...rejectedAuthors.values()].filter(Boolean).length, stuck: stuckNew.size },
  };
}

function oldDeadline(mergeDays) {
  const quantile = (xs, q) => {
    const s = [...xs].sort((a, b) => a - b);
    const i = (s.length - 1) * q, lo = Math.floor(i);
    return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
  };
  return mergeDays.length >= 5 ? Math.min(60, Math.max(7, Math.ceil(quantile(mergeDays, 0.9)))) : 30;
}

const sum = (o, ids) => ids.reduce((s, id) => s + o[id], 0);
const MERGED = OUTCOMES.filter((o) => o.end === "merged").map((o) => o.id);
const withdrawn = (p) => !p.open && !p.merged && !p.closedByCommit && p.reason === "author_withdrew";

// a small fixed-seed generator, so a failure repeats
let seed = 7;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const yes = (p) => rand() < p;

test("each outcome row can win, in the order the table lists them", () => {
  const closed = { open: false, merged: false, closedByCommit: false, reason: null };
  const cases = {
    merged: { ...closed, merged: true }, bot_merged: { ...closed, closedByCommit: true }, merged_elsewhere: { ...closed, reason: "landed_elsewhere" },
    withdrawn: { ...closed, reason: "author_withdrew" }, rejected: { ...closed, reason: "not_wanted" }, stuck: { ...closed, open: true },
  };
  assert.deepEqual(Object.keys(cases), OUTCOMES.map((o) => o.id));
  for (const [id, facts] of Object.entries(cases)) assert.equal(outcomeOf(facts).id, id);
  assert.equal(outcomeOf(closed).id, "rejected"); // a closed PR the classifier did not read
  assert.equal(outcomeOf({ ...closed, merged: true, reason: "author_withdrew" }).id, "merged"); // an earlier row wins
  assert.deepEqual(OUTCOMES.map((o) => o.end), ["merged", "merged", "merged", null, "rejected", "stuck"]); // null: counts in no group
});

test("the table sorts each mix of facts like the code it replaced", () => {
  for (const merged of [true, false]) for (const closedByCommit of [true, false]) for (const reason of [null, ...REASONS]) {
    const f = { open: false, merged, closedByCommit, reason };
    const o = outcomeOf(f), note = JSON.stringify(f);
    assert.equal(o.end === "merged", merged || closedByCommit || reason === "landed_elsewhere", note); // old: gotIn(p) || landedBy(p)
    assert.equal(o.id === "withdrawn", !merged && !closedByCommit && reason === "author_withdrew", note); // old: left out of "what gets merged"
    // old: "they say why" skipped the two reasons that are not from maintainers
    if (!merged && !closedByCommit && reason) assert.equal(o.id === "rejected", reason !== "author_withdrew" && reason !== "landed_elsewhere", note);
  }
});

test("the count matches the code it replaced on 20,000 made-up repos, with PRs the author closed left out", () => {
  for (let i = 0; i < 20000; i++) {
    const authors = Array.from({ length: pick([1, 2, 4, 9]) }, (_, n) => ({ login: `p${n}`, noEarlierMerge: yes(0.5) }));
    const prs = Array.from({ length: pick([0, 1, 3, 8, 20]) }, () => {
      const a = pick(authors), open = yes(0.25), merged = !open && yes(0.3);
      return {
        author: a.login, noEarlierMerge: a.noEarlierMerge, noCommits: yes(0.5), open, merged,
        closedByCommit: !open && !merged && yes(0.15), reason: open || merged || yes(0.4) ? null : pick(REASONS),
      };
    });
    const now = tally(prs), old = oldCount(prs.filter((p) => !withdrawn(p))), note = JSON.stringify(prs);
    assert.deepEqual(now.newcomers, old.newcomers, note);
    assert.equal(sum(now.outcomes, MERGED), old.wins, note);
    assert.equal(now.outcomes.rejected, old.losses, note);
    assert.equal(now.outcomes.withdrawn, prs.filter(withdrawn).length, note);
    assert.equal(now.outcomes.stuck, old.stuck, note);
  }
});

test("one person counts once, with their best ending", () => {
  assert.deepEqual(BEST_FIRST, ["merged", "rejected", "stuck"]);
  const pr = (author, facts) => ({ author, open: false, merged: false, closedByCommit: false, reason: null, noCommits: true, noEarlierMerge: true, ...facts });
  const { newcomers, outcomes } = tally([
    pr("ana", { reason: "not_wanted" }), pr("ana", { merged: true }), pr("ana", { open: true }), // merged beats the rest
    pr("ben", { open: true }), pr("ben", { reason: "inactive" }), // rejected beats stuck
    pr("cy", { open: true }), pr("cy", { open: true }), // two open PRs, one person
    pr("old hand", { open: true, noCommits: false }), // has commits here: not one newcomer
    pr("dee", { reason: "author_withdrew" }), // closed her own PR and sent no other: counts in no group
    pr("eli", { reason: "author_withdrew" }), pr("eli", { open: true }), // his own close does not count, his open PR does
  ]);
  assert.deepEqual(newcomers, { merged: 1, rejected: 1, stuck: 2 });
  assert.deepEqual(outcomes, { merged: 1, bot_merged: 0, merged_elsewhere: 0, withdrawn: 2, rejected: 2, stuck: 6 });
});

test("real PRs from 7 checks give the counts on file, and the old code agrees once the author's own closes are out", () => {
  const { repos } = JSON.parse(readFileSync(new URL("./fixtures/outcomes.json", import.meta.url), "utf8"));
  assert.equal(repos.length, 7);
  const seen = new Set();
  for (const r of repos) {
    const prs = r.prs.map(([person, open, merged, closedByCommit, reason, noCommits, noEarlierMerge]) =>
      ({ author: `p${person}`, open: !!open, merged: !!merged, closedByCommit: !!closedByCommit, reason: reason || null, noCommits: !!noCommits, noEarlierMerge: !!noEarlierMerge }));
    const { outcomes, newcomers } = tally(prs);
    const scaled = (n) => Math.round(n * r.stuckScale); // the search for open PRs returns 100 at most
    assert.deepEqual({ merged: sum(outcomes, MERGED), closed: outcomes.rejected, ignored: scaled(outcomes.stuck) }, r.expect.outside, r.repo);
    assert.deepEqual({ merged: newcomers.merged, rejected: newcomers.rejected, ignored: scaled(newcomers.stuck) }, r.expect.newcomers, r.repo);
    assert.deepEqual({ ...outcomes, stuck: scaled(outcomes.stuck) }, r.expect.outcomes, r.repo);
    const old = oldCount(prs.filter((p) => !withdrawn(p)));
    assert.deepEqual([newcomers, sum(outcomes, MERGED), outcomes.rejected], [old.newcomers, old.wins, old.losses], r.repo);
    for (const [id, n] of Object.entries(outcomes)) if (n) seen.add(id);
  }
  assert.deepEqual([...seen].sort(), OUTCOMES.map((o) => o.id).sort()); // the 7 repos cover each row of the table
});

test("the deadline for stuck PRs matches the code it replaced", () => {
  assert.equal(deadlineDays([]), 30);
  assert.equal(deadlineDays([1, 1, 1, 1]), 30); // under 5 merges: too few to learn the pace
  assert.equal(deadlineDays([1, 1, 1, 1, 1]), 7); // never under 7 days
  assert.equal(deadlineDays([100, 200, 300, 400, 500]), 60); // never over 60 days
  for (let i = 0; i < 5000; i++) {
    const days = Array.from({ length: pick([0, 3, 5, 6, 40]) }, () => rand() * pick([2, 20, 90]));
    assert.equal(deadlineDays(days), oldDeadline(days), JSON.stringify(days));
  }
});

// Drives the check state machine (shared/check.ts) through every path a visitor can take. Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { BAD_REPO, next, parseRepo, start, stateName } from "../shared/check.ts";

const data = (name) => ({ repo: { name }, generatedAt: "2026-11-10T00:00:00.000Z" });
const run = (state, ...events) => events.reduce(next, state);
const submit = (id, repo) => ({ type: "submit", id, repo });

test("a slow check shows the loading view, then the report", () => {
  let s = run(start(null), submit(1, "vitejs/vite"));
  assert.equal(stateName(s), "pending"); // the home page is still up
  assert.equal(s.view.status, "idle");
  s = next(s, { type: "slow", id: 1 });
  assert.deepEqual(s.view, { status: "loading", repo: "vitejs/vite" });
  s = next(s, { type: "resolved", id: 1, data: data("vitejs/vite") });
  assert.equal(stateName(s), "done");
  assert.equal(s.pending, null);
});

test("a fast answer never shows the loading view", () => {
  const seen = [];
  let s = start(null);
  for (const e of [submit(1, "vitejs/vite"), { type: "resolved", id: 1, data: data("vitejs/vite") }, { type: "slow", id: 1 }]) {
    s = next(s, e);
    seen.push(stateName(s));
  }
  assert.deepEqual(seen, ["pending", "done", "done"]); // the late "slow" changes nothing
});

test("text that is not a repo shows the message and makes no request", () => {
  const s = next(start(null), { type: "invalid" });
  assert.deepEqual(s, { view: { status: "error", message: BAD_REPO }, pending: null });
});

test("a failed check shows its message", () => {
  const s = run(start(null), submit(1, "octocat/nope"), { type: "slow", id: 1 }, { type: "rejected", id: 1, message: "Can't find that repo. Is it public?" });
  assert.deepEqual(s, { view: { status: "error", message: "Can't find that repo. Is it public?" }, pending: null });
});

test("a late answer to an older request is dropped", () => {
  let s = run(start(null), submit(1, "facebook/react"), { type: "slow", id: 1 }, submit(2, "vitejs/vite"));
  assert.deepEqual(s.view, { status: "loading", repo: "vitejs/vite" }); // the loading view names the new repo at once
  s = next(s, { type: "resolved", id: 1, data: data("facebook/react") });
  assert.equal(stateName(s), "loading");
  s = next(s, { type: "rejected", id: 1, message: "old" });
  assert.equal(stateName(s), "loading");
  s = next(s, { type: "resolved", id: 2, data: data("vitejs/vite") });
  assert.equal(s.view.data.repo.name, "vitejs/vite");
});

test("going back to the home page drops the answer still on its way", () => {
  let s = run(start(null), submit(1, "vitejs/vite"), { type: "slow", id: 1 }, { type: "reset" });
  assert.deepEqual(s, { view: { status: "idle" }, pending: null });
  s = next(s, { type: "resolved", id: 1, data: data("vitejs/vite") });
  assert.equal(stateName(s), "idle");
});

test("a new check keeps the old report up until its own answer", () => {
  let s = run(start(null), submit(1, "vitejs/vite"), { type: "resolved", id: 1, data: data("vitejs/vite") }, submit(2, "facebook/react"));
  assert.equal(stateName(s), "pending");
  assert.equal(s.view.data.repo.name, "vitejs/vite");
  s = next(s, { type: "resolved", id: 2, data: data("facebook/react") });
  assert.equal(s.view.data.repo.name, "facebook/react");
});

test("a page opened on a report link starts on the loading view", () => {
  assert.deepEqual(start("vitejs/vite"), { view: { status: "loading", repo: "vitejs/vite" }, pending: null });
  assert.equal(stateName(start("vitejs/vite")), "loading");
  assert.equal(stateName(start(null)), "idle");
  assert.equal(stateName(start("not a repo")), "idle");
});

test("no event can leave a loading view with nothing in flight", () => {
  // walk every event from every reachable state, three steps deep
  const events = [submit(1, "a/b"), submit(2, "c/d"), { type: "invalid" }, { type: "slow", id: 1 }, { type: "slow", id: 2 },
    { type: "resolved", id: 1, data: data("a/b") }, { type: "resolved", id: 2, data: data("c/d") },
    { type: "rejected", id: 1, message: "x" }, { type: "rejected", id: 2, message: "x" }, { type: "reset" }];
  let states = [start(null)];
  for (let depth = 0; depth < 3; depth++) states = states.flatMap((s) => events.map((e) => next(s, e)));
  for (const s of states) if (s.view.status === "loading") assert.notEqual(s.pending, null);
});

test("the repo box accepts a name or a github.com address", () => {
  assert.deepEqual(parseRepo("vitejs/vite"), ["vitejs", "vite"]);
  assert.deepEqual(parseRepo(" https://github.com/vitejs/vite/pulls?q=is%3Aopen "), ["vitejs", "vite"]);
  assert.deepEqual(parseRepo("github.com/honojs/hono.git"), ["honojs", "hono"]);
  assert.equal(parseRepo("not a repo"), null);
  assert.equal(parseRepo("vite"), null);
  assert.equal(parseRepo(""), null);
});

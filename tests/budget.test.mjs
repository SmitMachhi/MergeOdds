// Checks the daily budget for new checks (worker/budget.ts). Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { DAILY_NEW_CHECKS, spendOne } from "../worker/budget.ts";

/** Workers KV, as far as the budget uses it: a map with get and put. */
function fakeStore() {
  const map = new Map();
  return { map, get: async (k) => map.get(k) ?? null, put: async (k, v) => void map.set(k, v) };
}

const NOON = Date.parse("2026-11-10T12:00:00Z");

test("each new check counts once, and the budget ends the day", async () => {
  const store = fakeStore();
  for (let i = 0; i < 3; i++) assert.equal(await spendOne(store, NOON, 3), true);
  assert.equal(store.map.get("budget:2026-11-10"), "3");
  assert.equal(await spendOne(store, NOON, 3), false);
  assert.equal(store.map.get("budget:2026-11-10"), "3"); // a refused check is not counted
});

test("the budget starts again at midnight UTC", async () => {
  const store = fakeStore();
  assert.equal(await spendOne(store, Date.parse("2026-11-10T23:59:59Z"), 1), true);
  assert.equal(await spendOne(store, Date.parse("2026-11-10T23:59:59Z"), 1), false);
  assert.equal(await spendOne(store, Date.parse("2026-11-11T00:00:00Z"), 1), true);
});

test("the default budget is 300 new checks per day", async () => {
  assert.equal(DAILY_NEW_CHECKS, 300);
  const store = fakeStore();
  store.map.set("budget:2026-11-10", "299");
  assert.equal(await spendOne(store, NOON), true);
  assert.equal(await spendOne(store, NOON), false);
});

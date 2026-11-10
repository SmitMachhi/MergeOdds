// Keeps every code file at 200 lines or fewer, so each one stays readable top to bottom. Run with: npm test
// Data (the lockfile, test fixtures) and docs are out of scope.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CODE = /\.(ts|tsx|mjs|js|py|css|html)$/;
const SKIP = new Set(["node_modules", "dist", ".wrangler", ".verify", ".git", "fixtures"]);
const MAX = 200;

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (CODE.test(entry.name)) yield path;
  }
}

test("no code file is over 200 lines", () => {
  const long = [];
  for (const path of files(ROOT)) {
    const lines = readFileSync(path, "utf8").replace(/\n$/, "").split("\n").length;
    if (lines > MAX) long.push(`${path.slice(ROOT.length)}: ${lines} lines`);
  }
  assert.deepEqual(long, []);
});

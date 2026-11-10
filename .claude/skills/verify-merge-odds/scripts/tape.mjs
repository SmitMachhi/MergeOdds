#!/usr/bin/env node
// Proves that a change to the worker changes no result. Run every command from the web/ folder:
//   node .claude/skills/verify-merge-odds/scripts/tape.mjs record <owner/name> [<owner/name> ...]
//   node .claude/skills/verify-merge-odds/scripts/tape.mjs replay [<owner/name> ...] [--ignore <field>] [--out <folder>] [--accept]
//
// `record` runs one real check through worker/analyze.ts and saves every answer GitHub and the classifier gave,
// with the result, in .verify/tapes/. It stops the clock for the run, so the same code asks the same questions later.
// `replay` runs the worker code as it is now against those saved answers, with no network and no keys, and says
// SAME or DIFFERENT for each tape. Record before a change, replay after it.
// When the differences are the ones you meant to make, `replay --accept` saves the new results on the tapes.
// A tape holds no key: the request headers are left out.
import { build } from "esbuild";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DIR = path.join(ROOT, ".verify", "tapes");
const [cmd, ...rest] = process.argv.slice(2);
const flags = { ignore: [], out: null, accept: false };
const repos = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--ignore") flags.ignore.push(rest[++i]);
  else if (rest[i] === "--out") flags.out = rest[++i];
  else if (rest[i] === "--accept") flags.accept = true;
  else repos.push(rest[i]);
}
const die = (message) => { console.error(message); process.exit(1); };
if (!existsSync(path.join(ROOT, "worker", "analyze.ts"))) die("Run this from the web/ folder of the repo.");
if (cmd !== "record" && cmd !== "replay") die("Use: tape.mjs record <owner/name> ...   or   tape.mjs replay [<owner/name> ...]");
mkdirSync(DIR, { recursive: true });

const fileOf = (repo) => path.join(DIR, `${repo.replace("/", "-")}.json`);
const keyOf = (input, init) => `${typeof input === "string" ? input : input.url}\n${init?.body ?? ""}`;

/** Every `new Date()` and `Date.now()` answers `t` from here on. */
function stopClock(t) {
  const Real = Date;
  globalThis.Date = class extends Real {
    constructor(...a) { if (a.length) super(...a); else super(t); }
    static now() { return t; }
  };
  return () => { globalThis.Date = Real; };
}

/** The worker code as it is on disk right now, bundled into one module. */
async function worker() {
  const out = path.join(DIR, ".analyze.mjs");
  await build({ entryPoints: [path.join(ROOT, "worker", "analyze.ts")], bundle: true, format: "esm", platform: "neutral", outfile: out, logLevel: "error" });
  return (await import(`${pathToFileURL(out).href}?t=${process.hrtime.bigint()}`)).analyze;
}

function secrets() {
  const file = path.join(ROOT, ".dev.vars");
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const env = Object.fromEntries(text.split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
  if (!env.GITHUB_TOKEN || !env.TYPESAFE_API_KEY) die("web/.dev.vars needs GITHUB_TOKEN and TYPESAFE_API_KEY to record.");
  return env;
}

/** Paths where two results differ, such as "newcomers.merged". */
function differences(a, b, at = "") {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  const both = (x) => x && typeof x === "object";
  if (!both(a) || !both(b)) return [at || "(whole result)"];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => differences(a[k], b[k], at ? `${at}.${k}` : k));
}

const analyze = await worker();
const real = globalThis.fetch;
let failed = false;

if (cmd === "record") {
  if (!repos.length) die("Name at least one repo to record.");
  const env = secrets();
  for (const repo of repos) {
    const [owner, name] = repo.split("/");
    const at = Date.now();
    const answers = {};
    globalThis.fetch = async (input, init) => {
      const res = await real(input, init);
      const retryAfter = res.headers.get("retry-after");
      (answers[keyOf(input, init)] ??= []).push({ status: res.status, text: await res.clone().text(), ...(retryAfter ? { retryAfter } : {}) });
      return res;
    };
    const startClock = stopClock(at);
    let result = null, error = null;
    try { result = await analyze(env, owner, name); } catch (e) { error = e.message; }
    startClock();
    globalThis.fetch = real;
    writeFileSync(fileOf(repo), JSON.stringify({ repo, at, result, error, answers }));
    console.log(`${repo}: recorded ${Object.values(answers).flat().length} answers${error ? `, ended in the error "${error}"` : `, ${result.verdict.title}, odds ${result.odds}`}`);
  }
}

if (cmd === "replay") {
  const files = repos.length ? repos.map(fileOf) : readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => path.join(DIR, f));
  if (!files.length) die("No tapes yet. Record some first.");
  if (flags.out) mkdirSync(flags.out, { recursive: true });
  for (const file of files) {
    if (!existsSync(file)) die(`No tape at ${file}`);
    const tape = JSON.parse(readFileSync(file, "utf8"));
    const [owner, name] = tape.repo.split("/");
    const left = Object.fromEntries(Object.entries(tape.answers).map(([k, v]) => [k, [...v]]));
    const unknown = [];
    globalThis.fetch = async (input, init) => {
      const next = left[keyOf(input, init)]?.shift();
      if (!next) { unknown.push(keyOf(input, init).slice(0, 160)); return new Response("not on the tape", { status: 599 }); }
      return new Response(next.text, { status: next.status, headers: next.retryAfter ? { "retry-after": "0" } : {} });
    };
    const startClock = stopClock(tape.at);
    let result = null, error = null;
    try { result = await analyze({ GITHUB_TOKEN: "tape", TYPESAFE_API_KEY: "tape" }, owner, name); } catch (e) { error = e.message; }
    startClock();
    globalThis.fetch = real;
    const unused = Object.values(left).flat().length;
    const diff = differences(tape.result, result).filter((p) => !flags.ignore.some((i) => p === i || p.startsWith(`${i}.`)));
    if (error !== tape.error) diff.push(`error: "${tape.error}" on the tape, "${error}" now`);
    if (unknown.length) diff.push(`${unknown.length} new questions, first: ${unknown[0]}`);
    if (unused) diff.push(`${unused} taped answers not asked for`);
    if (flags.out) writeFileSync(path.join(flags.out, path.basename(file)), JSON.stringify(result, null, 1));
    const blocked = unknown.length > 0 || unused > 0 || error !== tape.error; // the tape no longer fits the code
    if (diff.length && flags.accept && !blocked) writeFileSync(file, JSON.stringify({ ...tape, result }));
    else if (diff.length) failed = true;
    console.log(`${tape.repo}: ${diff.length ? `DIFFERENT in ${diff.slice(0, 40).join(", ")}${flags.accept && !blocked ? " (accepted)" : ""}` : "SAME"}`);
  }
}
process.exit(failed ? 1 : 0);

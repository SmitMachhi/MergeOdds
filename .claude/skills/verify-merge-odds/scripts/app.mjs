#!/usr/bin/env node
// Starts, checks and stops a private copy of Merge Odds for verification, and calls its API.
// Run every command from the repo's root folder:
//   node .claude/skills/verify-merge-odds/scripts/app.mjs launch [--port 5299]
//   node .claude/skills/verify-merge-odds/scripts/app.mjs doctor
//   node .claude/skills/verify-merge-odds/scripts/app.mjs check <owner/name> [--fresh] [--label <name>] [--expect <status>]
//   node .claude/skills/verify-merge-odds/scripts/app.mjs stop
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.join(ROOT, ".verify");
const RUN = path.join(DIR, "run.json");
const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => (rest.includes(`--${name}`) ? rest[rest.indexOf(`--${name}`) + 1] ?? "" : null);
const has = (name) => rest.includes(`--${name}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (o) => console.log(JSON.stringify(o, null, 2));
const die = (message) => { console.error(message); process.exit(1); };

if (!existsSync(path.join(ROOT, "wrangler.jsonc")) || !existsSync(path.join(ROOT, "worker", "index.ts"))) die("Run this from the root folder of the repo.");

const readRun = () => (existsSync(RUN) ? JSON.parse(readFileSync(RUN, "utf8")) : null);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const get = async (url) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); return { status: r.status, text: await r.text() }; } catch { return null; } };

/** The two secrets the worker needs. Reports which are set, never their values. */
function keys() {
  const file = path.join(ROOT, ".dev.vars");
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  return Object.fromEntries(["GITHUB_TOKEN", "TYPESAFE_API_KEY"].map((k) => [k, new RegExp(`^${k}=\\S+`, "m").test(text)]));
}

/** Usable means the page is served and the worker answers the API, not only that a process is up. */
async function probes(url) {
  const home = await get(`${url}/`);
  const api = await get(`${url}/api/analyze?repo=`);
  return {
    "home page is Merge Odds": !!home && home.status === 200 && home.text.includes("<title>Merge Odds</title>"),
    "worker answers the API": !!api && api.status === 400 && api.text.includes("Paste a GitHub repo"),
  };
}

async function launch() {
  const old = readRun();
  if (old && alive(old.pid)) return say({ already: "running", ...old });
  if (old) rmSync(RUN);
  const k = keys();
  if (!k.GITHUB_TOKEN || !k.TYPESAFE_API_KEY) die(`.dev.vars is missing ${Object.keys(k).filter((x) => !k[x]).join(" and ")}. Copy .dev.vars.example to .dev.vars and fill both in.`);

  const port = Number(flag("port") ?? 5299);
  const id = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const state = path.join(DIR, `state-${port}`);
  const evidence = path.join(DIR, "evidence", id);
  rmSync(state, { recursive: true, force: true }); // every launch starts with no stored results
  mkdirSync(state, { recursive: true });
  mkdirSync(evidence, { recursive: true });
  const log = path.join(evidence, "server.log");
  const out = openSync(log, "a");
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--port", String(port), "--strictPort"], {
    cwd: ROOT, env: { ...process.env, VERIFY_STATE_DIR: state }, detached: true, stdio: ["ignore", out, out], windowsHide: true,
  });
  child.unref();
  const run = { id, pid: child.pid, port, url: `http://localhost:${port}`, state, evidence, log, startedAt: new Date().toISOString() };
  writeFileSync(RUN, JSON.stringify(run, null, 2));

  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    if (!alive(run.pid)) {
      rmSync(RUN); rmSync(state, { recursive: true, force: true });
      die(`The server exited during start. Port ${port} may be in use: pass --port. Log:\n${readFileSync(log, "utf8").slice(-1500)}`);
    }
    if (Object.values(await probes(run.url)).every(Boolean)) return say({ ready: true, ...run });
  }
  await stop();
  die(`Not ready after 90s. Log: ${log}`);
}

async function doctor() {
  const run = readRun();
  if (!run) die("No instance from this skill. Run launch first.");
  const k = keys();
  const checks = {
    "the process we started is alive": alive(run.pid),
    ...(await probes(run.url)),
    "GITHUB_TOKEN is set": k.GITHUB_TOKEN,
    "TYPESAFE_API_KEY is set": k.TYPESAFE_API_KEY,
    "private state folder exists": existsSync(run.state),
    "evidence folder exists": existsSync(run.evidence),
  };
  say({ url: run.url, pid: run.pid, evidence: run.evidence, checks });
  if (!Object.values(checks).every(Boolean)) process.exit(1);
}

/** One real API call. Saves the whole response as evidence and prints the facts a proof needs. */
async function check() {
  const run = readRun();
  if (!run) die("No instance from this skill. Run launch first.");
  const repo = rest[0];
  if (repo === undefined || repo.startsWith("--")) die("Usage: check <owner/name> [--fresh] [--label <name>] [--expect <status>]");
  const expect = Number(flag("expect") ?? 200);
  const request = `${run.url}/api/analyze?repo=${encodeURIComponent(repo)}${has("fresh") ? "&fresh=1" : ""}`;
  const t0 = Date.now();
  const res = await fetch(request);
  const text = await res.text();
  const ms = Date.now() - t0;
  let body = null;
  try { body = JSON.parse(text); } catch {}

  const problems = [];
  if (res.status !== expect) problems.push(`status ${res.status}, expected ${expect}`);
  if (body === null) problems.push("the body is not JSON");
  if (/\bjev\b|typesafe/i.test(text)) problems.push("the response names the engine");
  if (res.status === 200 && body) {
    if (body.failed) problems.push("failed is true: reading the repo's text failed, so nothing was stored");
    if (body.scorecard?.length !== 6) problems.push(`scorecard has ${body.scorecard?.length} rows, expected 6`);
    if (!body.verdict?.title) problems.push("no verdict title");
    if (Number.isNaN(Date.parse(body.generatedAt))) problems.push("generatedAt is not a date");
    if (body.odds !== null && !(body.odds >= 0 && body.odds <= 100)) problems.push(`odds ${body.odds} is outside 0 to 100`);
    // `outcomes` splits the outside PRs by how each one ended (shared/outcomes.ts). Its parts add up to `outside`.
    const o = body.outcomes;
    if (!o) problems.push("no outcomes in the body");
    else {
      if (o.merged + o.bot_merged + o.merged_elsewhere !== body.outside?.merged) problems.push("the merged outcomes do not add up to outside.merged");
      if (o.rejected !== body.outside?.closed) problems.push("outcomes.rejected is not outside.closed: PRs the author closed must count in neither");
      if (o.stuck !== body.outside?.ignored) problems.push("outcomes.stuck is not outside.ignored");
    }
  }

  const dir = path.join(run.evidence, "api");
  mkdirSync(dir, { recursive: true });
  const n = String(readdirSync(dir).length + 1).padStart(2, "0");
  const file = path.join(dir, `${n}-${(flag("label") ?? repo).replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "empty"}.json`);
  const headers = Object.fromEntries(["content-type", "cache-control", "x-cache"].map((h) => [h, res.headers.get(h)]));
  writeFileSync(file, JSON.stringify({ request, status: res.status, ms, headers, body: body ?? text }, null, 2));
  say({
    file, status: res.status, ms,
    ...(res.status === 200 && body
      ? { served: headers["x-cache"] === "hit" ? "from storage" : "new check", repo: body.repo?.name, generatedAt: body.generatedAt, odds: body.odds, verdict: body.verdict?.title, grades: body.scorecard?.map((m) => m.grade ?? "-").join(""), prsRead: body.window?.merged + body.window?.closed, outcomes: body.outcomes, questions: body.checks }
      : { error: body?.error ?? text.slice(0, 200) }),
    problems,
  });
  if (problems.length) process.exit(1);
}

async function stop() {
  const run = readRun();
  if (!run) return say({ stopped: false, reason: "no instance from this skill" });
  // Kill only the process this skill started, and only while it still serves our app on our port.
  const ours = alive(run.pid) && (await probes(run.url))["home page is Merge Odds"];
  if (ours) {
    try {
      if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(run.pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(-run.pid, "SIGTERM");
    } catch {}
    for (let i = 0; i < 20 && (await get(`${run.url}/`)); i++) await sleep(500);
  }
  const stillUp = !!(await get(`${run.url}/`));
  for (let i = 0; i < 10; i++) {
    try { rmSync(run.state, { recursive: true, force: true }); break; } catch { await sleep(500); } // Windows frees file locks a moment after the kill
  }
  rmSync(RUN, { force: true });
  say({ stopped: ours && !stillUp, killedPid: ours ? run.pid : null, stateRemoved: !existsSync(run.state), evidenceKept: existsSync(run.evidence) ? run.evidence : null });
  if (stillUp) process.exit(1);
}

const commands = { launch, doctor, check, stop };
if (!commands[cmd]) die("Commands: launch, doctor, check, stop");
await commands[cmd]();

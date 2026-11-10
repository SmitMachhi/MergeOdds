import { Hono } from "hono";
import { analyze } from "./analyze";
import { BUDGET_SPENT, spendOne, TOO_FAST } from "./budget";
import { BAD_REPO, parseRepo } from "../shared/check";
import { GhError } from "./github";

type Env = { GITHUB_TOKEN: string; TYPESAFE_API_KEY: string; ASSETS: Fetcher; RESULTS: KVNamespace; NEW_CHECKS: RateLimit };

const app = new Hono<{ Bindings: Env }>();
/** A checked repo answers from storage for a week. After that the next visitor pays for a new check. */
const KEEP_SECONDS = 7 * 86400;
const BROWSER_SECONDS = 3600;
/** Part of every storage key. Bump it when the math or the shape of the result changes, so old results stop matching. */
const VERSION = "v8";

app.get("/api/analyze", async (c) => {
  const parsed = parseRepo(c.req.query("repo") ?? "");
  if (!parsed) return c.json({ error: BAD_REPO }, 400);
  if (!c.env.GITHUB_TOKEN || !c.env.TYPESAFE_API_KEY) return c.json({ error: "The server is missing its API keys" }, 500);
  const [owner, name] = parsed;

  const key = `${VERSION}:${owner}/${name}`.toLowerCase();
  const browser = { "cache-control": `public, max-age=${BROWSER_SECONDS}` };
  if (!c.req.query("fresh")) {
    // if storage is down or over its daily quota, run the check instead of failing the request
    const saved = await c.env.RESULTS.get(key).catch(() => null);
    if (saved) return new Response(saved, { headers: { "content-type": "application/json", "x-cache": "hit", ...browser } });
  }
  // From here on the request spends GitHub and classifier quota, so two guards stand in front of it (budget.ts).
  // Cloudflare puts the visitor's address on each real request. A local run has none and skips the first guard.
  const visitor = c.req.header("cf-connecting-ip");
  if (visitor && !(await c.env.NEW_CHECKS.limit({ key: visitor })).success) return c.json({ error: TOO_FAST }, 429, { "retry-after": "60" });
  // if storage cannot count the check, do not run it
  if (!(await spendOne(c.env.RESULTS).catch(() => false))) return c.json({ error: BUDGET_SPENT }, 429);
  try {
    const result = await analyze(c.env, owner, name);
    // a check where reading the repo's text failed is shown once and never stored
    if (result.failed) return c.json(result);
    c.executionCtx.waitUntil(c.env.RESULTS.put(key, JSON.stringify(result), { expirationTtl: KEEP_SECONDS }));
    return c.json(result, 200, browser);
  } catch (e) {
    if (e instanceof GhError) return c.json({ error: e.status === 404 ? "Can't find that repo. Is it public?" : e.message }, e.status as 404 | 502);
    console.error(e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default app;

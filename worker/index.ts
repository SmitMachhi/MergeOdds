import { Hono } from "hono";
import { analyze } from "./analyze";
import { BAD_REPO, parseRepo } from "../shared/check";
import { GhError } from "./github";

type Env = { GITHUB_TOKEN: string; TYPESAFE_API_KEY: string; ASSETS: Fetcher; RESULTS: KVNamespace };

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

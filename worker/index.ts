import { Hono } from "hono";
import { BAD_REPO, parseRepo } from "../shared/check";
import { fetchMeta, fetchPRs, GhError } from "./github";

type Env = { GITHUB_TOKEN: string; ASSETS: Fetcher };

const app = new Hono<{ Bindings: Env }>();

app.get("/api/analyze", async (c) => {
  const parsed = parseRepo(c.req.query("repo") ?? "");
  if (!parsed) return c.json({ error: BAD_REPO }, 400);
  if (!c.env.GITHUB_TOKEN) return c.json({ error: "The server is missing its API keys" }, 500);
  const [owner, name] = parsed;
  try {
    // no odds yet: for now the route shows what it read
    const [meta, prs] = await Promise.all([fetchMeta(c.env.GITHUB_TOKEN, owner, name), fetchPRs(c.env.GITHUB_TOKEN, owner, name)]);
    const days = Math.max(1, Math.round((Date.now() - prs.start) / 86400_000));
    return c.json({ repo: meta.nameWithOwner, stars: meta.stargazerCount, days, merged: prs.merged.length, closed: prs.closed.length });
  } catch (e) {
    if (e instanceof GhError) return c.json({ error: e.status === 404 ? "Can't find that repo. Is it public?" : e.message }, e.status as 404 | 502);
    console.error(e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default app;

import { Hono } from "hono";
import { analyze } from "./analyze";
import { BAD_REPO, parseRepo } from "../shared/check";
import { GhError } from "./github";

type Env = { GITHUB_TOKEN: string; TYPESAFE_API_KEY: string; ASSETS: Fetcher };

const app = new Hono<{ Bindings: Env }>();

app.get("/api/analyze", async (c) => {
  const parsed = parseRepo(c.req.query("repo") ?? "");
  if (!parsed) return c.json({ error: BAD_REPO }, 400);
  if (!c.env.GITHUB_TOKEN || !c.env.TYPESAFE_API_KEY) return c.json({ error: "The server is missing its API keys" }, 500);
  const [owner, name] = parsed;
  try {
    return c.json(await analyze(c.env, owner, name));
  } catch (e) {
    if (e instanceof GhError) return c.json({ error: e.status === 404 ? "Can't find that repo. Is it public?" : e.message }, e.status as 404 | 502);
    console.error(e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default app;

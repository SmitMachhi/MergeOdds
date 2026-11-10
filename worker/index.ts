import { Hono } from "hono";
import { BAD_REPO, parseRepo } from "../shared/check";

type Env = { ASSETS: Fetcher };

const app = new Hono<{ Bindings: Env }>();

app.get("/api/analyze", (c) => {
  const parsed = parseRepo(c.req.query("repo") ?? "");
  if (!parsed) return c.json({ error: BAD_REPO }, 400);
  const [owner, name] = parsed;
  return c.json({ error: `Checks are not built yet. You asked for ${owner}/${name}` }, 501);
});

export default app;

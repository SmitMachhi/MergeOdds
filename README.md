# Merge Odds

Paste a GitHub repo. See the odds that your PR gets merged.

This repo is being built in the open, one small pull request at a time. Right now the API reads a repo's recent
pull requests from GitHub and says how many were merged and how many were closed. The odds come next.

- **Worker:** [Hono](https://hono.dev) on Cloudflare Workers (`worker/`). One endpoint: `GET /api/analyze?repo=owner/name`.
- **GitHub data:** every read is in `worker/github.ts`: the repo, its contributor docs, and up to 400 recent PRs.
- **UI:** Vite, React and Tailwind (`src/`).

## Run it

```bash
cp .dev.vars.example .dev.vars   # then fill in GITHUB_TOKEN
npm install
npm run dev
```

`GITHUB_TOKEN` needs no scopes: it only reads public repos.

## Licence

MIT: see `LICENSE`. The typeface is Paper Mono, under the SIL Open Font License: see `src/assets/fonts/OFL.txt`.

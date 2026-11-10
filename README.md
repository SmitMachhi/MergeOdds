# Merge Odds

Paste a GitHub repo. See the odds that your PR gets merged.

This repo is being built in the open, one small pull request at a time. Right now the API reads a repo's recent
pull requests from GitHub, asks the classifier about its rules and closed PRs, and answers with the odds, six
grades and one verdict as JSON. The page that shows them comes next.

- **Worker:** [Hono](https://hono.dev) on Cloudflare Workers (`worker/`). One endpoint: `GET /api/analyze?repo=owner/name`.
- **GitHub data:** every read is in `worker/github.ts`: the repo, its contributor docs, and up to 400 recent PRs.
- **Judgment:** [Jev](https://typesafe.ai) answers typed questions about the repo's rules and closed PRs. Every
  question is in `worker/jev.ts`.
- **UI:** Vite, React and Tailwind (`src/`).

## Run it

```bash
cp .dev.vars.example .dev.vars   # then fill in GITHUB_TOKEN and TYPESAFE_API_KEY
npm install
npm run dev
```

`GITHUB_TOKEN` needs no scopes: it only reads public repos.

## Deploy

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TYPESAFE_API_KEY
npm run deploy
```

`GITHUB_TOKEN` needs no scopes: it only reads public repos. The first deploy creates the KV namespace for
stored results.

## Test it

```bash
npm test
```

## The math

A newcomer is an author with no merged PR in the repo before the window (up to 90 days, up to 400 PRs).
Each newcomer who tried ends one of three ways:

- **merged**: the merge button, a merge bot, or a maintainer who landed the commits another way (Jev reads that),
- **rejected**: closed without merging, unless the author closed it,
- **stuck**: still open after the day by which 90% of merged outside PRs had merged.

A newcomer with several PRs counts once, with their best ending: merged beats rejected, and rejected beats stuck.
A PR the author closed counts in no group: it says nothing about what maintainers do. Jev reads the newest 60
closed outside PRs, so an older one the author closed still counts as rejected.

`odds = merged / (merged + rejected + stuck)`, shown with a 90% Wilson interval so small samples get a wide range.

The scorecard grades six numbers from A to F: newcomer merge rate, first reply, time to merge, PRs left hanging,
how often maintainers say why they closed a PR, and how clear the contributing guide is. Each row prints its own
sum. "What gets merged" splits outside PRs by kind of change (Jev reads each title) and by lines changed.

Jev answers five requests of about 200 ms each: the rules, which guide lines are requirements, which line states
each rule, what kind of change each PR is, and why each closed PR was closed. Every question is in `worker/jev.ts`.

A checked repo is stored in Workers KV for 7 days (the `RESULTS` binding), and the report says how old it is.
Add `&fresh=1` to run a new check and replace the stored one. To throw out every stored result after a change to
the math, bump `VERSION` in `worker/index.ts`.

## Licence

MIT: see `LICENSE`. The typeface is Paper Mono, under the SIL Open Font License: see `src/assets/fonts/OFL.txt`.

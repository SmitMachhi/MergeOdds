# Merge Odds

**Try it: [mergeodds.lol](https://mergeodds.lol)**

Paste any GitHub repo to see the odds your first PR there gets merged. The report also grades how the maintainers treat outside PRs, lists the repo's contributing rules, and shows why outside PRs got closed.

[How it works](https://mergeodds.lol/how) walks through each step, with Vite as the example.

## Run it

You need Node, plus keys for GitHub and TypeSafe. I use Node 26 and have not tested older versions.

1. `cp .dev.vars.example .dev.vars`
2. Fill in `GITHUB_TOKEN`. It needs no scopes, because the app reads public repos.
3. Fill in `TYPESAFE_API_KEY` from [TypeSafe](https://typesafe.ai).
4. `npm install`
5. `npm run dev`, then open the address Vite prints.

## The odds

Newcomers are outsiders with no merged PR in the repo before the window we read: up to 90 days and 400 PRs. Their PRs end up in these groups:

- Merged: the merge button, merge bots, or maintainers who landed the same commits another way.
- Rejected: closed by anyone but the author.
- Stuck: still open after the time 9 in 10 merged outside PRs took.

`odds = (merged + 1) / (tried + 2)`, next to the 90% Wilson range. The +1 and +2 stop 3 lucky PRs from reading as 100%.

- Each person counts once, with their best ending: merged beats rejected, rejected beats stuck.
- PRs the author closed count in no group. Jev reads the newest 60 closed PRs to spot them, so older ones still count as rejected.
- Under 3 newcomers, the report shows no odds.

[Jev](https://typesafe.ai), TypeSafe's classifier, reads the guide and the last comments on closed PRs and picks answers from fixed lists. Plain code turns those answers into odds, grades and the verdict.

## The code

| Folder | Holds |
| --- | --- |
| `worker/` | The API, `GET /api/analyze?repo=owner/name`: GitHub reads, Jev's questions, the counting, storage and limits |
| `shared/` | The decision tables (PR outcomes, grade cut-offs, verdicts) and the page's check states |
| `src/` | The page: Vite, React, Tailwind, motion and dither-kit (trimmed) |
| `tests/` | 29 tests |
| `.claude/skills/verify-merge-odds/` | Scripts that run the app, drive it like visitors do, and save proof |

The worker decides with the tables in `shared/`, and the How it works page prints the same tables.

## Limits on new checks

Each new check spends GitHub and Jev quota. Stored results are free for 7 days.

- 5 new checks per visitor per minute: `ratelimits` in `wrangler.jsonc`.
- 300 new checks per day for the whole site: `DAILY_NEW_CHECKS` in `worker/budget.ts`.

## Test it

`npm test` runs the 29 tests in under 1 second: the math, the limits, the page's check states, the wording rules, and the 200-line cap per file.

Before you change the math, record some real checks. After the change, replay them with no network:

```bash
node .claude/skills/verify-merge-odds/scripts/tape.mjs record vitejs/vite apache/spark
node .claude/skills/verify-merge-odds/scripts/tape.mjs replay
```

`replay` prints `SAME`, or the fields that changed.

## Deploy your own copy

You need your own Cloudflare account.

1. In `wrangler.jsonc`, put your domain in `routes`, or delete that line to use the workers.dev address.
2. `npm run build`
3. `npx wrangler deploy --secrets-file .dev.vars`. This uploads the worker and both keys and creates the KV store.

After that, `npm run deploy` is enough. Add `&fresh=1` to any request to skip the stored result and check again. After you change the math, bump `VERSION` in `worker/index.ts` so old results stop matching.

## Credits

MIT licence: see `LICENSE`.

- dither-kit (`src/components/dither-kit/`): the charts, button and wash, from [Boring-Software-Inc/dither-kit](https://github.com/Boring-Software-Inc/dither-kit), trimmed to what this app uses. MIT.
- Paper Mono (`src/assets/fonts/`): the typeface, by Paper. SIL Open Font License: see `OFL.txt` next to it.
- Octicons: the pull request icon, by GitHub. MIT.
- Jev: the classifier, by [TypeSafe](https://typesafe.ai), called over the network.

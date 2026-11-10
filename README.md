# Merge Odds

**Try it: [mergeodds.lol](https://mergeodds.lol)**

Paste one GitHub repo. About 4 seconds later you see the odds that your first PR there gets merged.

The report shows:

1. The odds, with the range the sample size allows
2. Six grades: merge rate, first reply, time to merge, PRs left hanging, reasons given, the guide
3. The kinds and sizes of PR that maintainers merge
4. The repo's contributing rules, in the order you meet them
5. The reasons outside PRs got closed

## Run it on your machine

You need Node and two keys. Setup takes about 2 minutes. I use Node 26 and have not tested older versions.

1. Copy the env file: `cp .dev.vars.example .dev.vars`
2. Fill in `GITHUB_TOKEN`. The token needs no scopes, because the app reads public repos.
3. Fill in `TYPESAFE_API_KEY`. [TypeSafe](https://typesafe.ai) issues it.
4. Run `npm install`
5. Run `npm run dev`, then open the address Vite prints

## The five steps of one check

1. **Fetch.** The worker asks GitHub for up to 400 recent PRs and the repo's contributor docs.
2. **Split.** It drops PRs from staff and bots, and keeps the ones from outsiders.
3. **Ask.** [Jev](https://typesafe.ai), TypeSafe's classifier, reads the guide and the last comments on closed PRs. It answers hundreds of fixed questions per check, and it writes no text.
4. **Count.** Plain code turns those answers into odds, six grades and one verdict. No AI writes the verdict.
5. **Store.** Workers KV keeps the result for 7 days, so repeat checks cost nothing.

The [How it works page](https://mergeodds.lol/how) walks through each step with the numbers of one real check.

## The math

Newcomers are authors with no merged PR in the repo before the days we read: up to 90 days, up to 400 PRs. Each newcomer lands in one group.

- **Merged:** the merge button, one merge bot, or maintainers who landed the same commits another way.
- **Rejected:** closed without merging.
- **Stuck:** still open past the day by which 90% of merged outside PRs had merged.

`odds = (merged + 1) / (tried + 2)`, where `tried` is the sum of the three groups.

Four rules shape that number:

1. **Small samples stay modest.** The +1 and +2 stop 3 lucky PRs from reading as 100%. The report prints the 90% Wilson range next to the odds.
2. **Each newcomer counts once**, with their best ending. Merged beats rejected, and rejected beats stuck.
3. **PRs the author closed count in no group.** They say nothing about maintainers.
4. **Under 3 newcomers, the app shows no odds.** It says the repo is too quiet to call.

One limit: Jev reads the newest 60 closed outside PRs. Older PRs the author closed still count as rejected.

Six numbers get grades (A, B, C, D, F). `shared/rules.ts` holds the cut-offs and the verdict table.

## The parts

| Folder | Holds |
| --- | --- |
| `worker/` | The API, `GET /api/analyze?repo=owner/name`: GitHub reads, the classifier's questions, the check, storage and limits |
| `shared/` | The decision tables: PR outcomes, grades, the verdict, and the page's check states |
| `src/` | The page: Vite, React, Tailwind, motion and a trimmed copy of dither-kit |
| `tests/` | 29 tests for the math, the limits, the page states, the wording and file size |
| `.claude/skills/verify-merge-odds/` | Scripts that start the app, drive it like visitors do, and save proof |

The worker decides with the tables in `shared/`, and the How it works page prints those same tables. The page and the code cannot disagree.

## Limits on new checks

Each new check spends GitHub and classifier quota: about half of one cent. Two guards cap that. Stored results pass both.

- **Per visitor:** 5 new checks per minute. The next one answers 429. `ratelimits` in `wrangler.jsonc` sets it.
- **Per day:** 300 new checks for the whole site. `DAILY_NEW_CHECKS` in `worker/budget.ts` sets it.

## Test it

```bash
npm test
```

28 tests run in under one second. They cover:

1. The math, on 20,000 made-up repos and on 902 real PRs
2. The daily budget
3. The page's check states
4. The wording: no em dashes, no exclamation marks, no "-ly" adverbs, no filler

Before you change the math, record real checks. After the change, replay them.

```bash
node .claude/skills/verify-merge-odds/scripts/tape.mjs record vitejs/vite apache/spark
node .claude/skills/verify-merge-odds/scripts/tape.mjs replay
```

`record` saves each answer GitHub and the classifier gave. `replay` runs your changed worker against those answers with no network. It prints `SAME`, or the fields that differ.

## Deploy your own copy

You need one Cloudflare account. The first deploy takes about 5 minutes.

1. In `wrangler.jsonc`, put your own domain in `routes`. Or delete that line and use the workers.dev address.
2. Run `npm run build`
3. Run `npx wrangler deploy --secrets-file .dev.vars`. It uploads the worker and both keys, and it creates the KV namespace.

For later deploys, run `npm run deploy`.

Two switches for stored results:

- Add `&fresh=1` to one request, and that check runs again.
- Bump `VERSION` in `worker/index.ts` after you change the math, and the old results stop matching.

## Credits and licences

The app's code is under the MIT licence: see `LICENSE`.

- **dither-kit** (`src/components/dither-kit/`): charts, the button and the gradient, copied in from [Boring-Software-Inc/dither-kit](https://github.com/Boring-Software-Inc/dither-kit) with the shadcn CLI, then trimmed to the parts this app uses. MIT.
- **Paper Mono** (`src/assets/fonts/`): the typeface, by Paper. SIL Open Font License: see `OFL.txt` next to it.
- **Octicons:** the pull request icon, by GitHub. MIT.
- **Jev:** the classifier, by [TypeSafe](https://typesafe.ai). The worker calls it over the network.

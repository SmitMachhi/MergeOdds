# Merge Odds

Paste a GitHub repo. See the odds that a first-time contributor's PR gets merged, why outside PRs get closed, and
what the maintainers ask for.

- **Worker:** Hono on Cloudflare Workers (`worker/`). One endpoint: `GET /api/analyze?repo=owner/name`.
- **UI:** Vite, React, Tailwind, shadcn, motion, and [dither-kit](https://tripwire.sh/dither-kit) charts (`src/`).
- **Judgment:** [Jev](https://typesafe.ai) answers typed questions about the repo's rules and closed PRs. Every
  question is in `worker/jev.ts`. The odds and the verdict are plain code in `worker/analyze.ts`.
- **Shared rules (`shared/`):** three files hold the decisions that more than one place needs.
  - `shared/check.ts` is the state machine of one check on the page: `idle`, `pending`, `loading`, `done`, `error`,
    and every move between them. The page puts the state name on `<main data-state>`.
  - `shared/outcomes.ts` is the table that sorts each outside PR by how it ended (`merged`, `bot_merged`,
    `merged_elsewhere`, `withdrawn`, `rejected`, `stuck`), and the count that gives each newcomer one group.
    The API returns the split as `outcomes`.
  - `shared/rules.ts` holds the grade cut-offs and the verdict table.
  - The worker decides with these tables and the How it works page prints them, so the two cannot disagree.
  - `tests/check.test.mjs`, `tests/outcomes.test.mjs` and `tests/rules.test.mjs` cover them.
    `tests/fixtures/outcomes.json` holds real PRs from 7 checks, with logins replaced by numbers.

## Run it

```bash
cp .dev.vars.example .dev.vars   # then fill in GITHUB_TOKEN and TYPESAFE_API_KEY
npm install
npm run dev
```

## Check the wording

```bash
npm test
```

The test reads the text the page shows and fails on em dashes, exclamation marks, "-ly" adverbs, filler words
and any mention of the engine. It also checks that a count of one reads as singular. Quotes from a repo's guide
are shown word for word, so the test leaves them alone.

## Deploy

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TYPESAFE_API_KEY
npm run deploy
```

`GITHUB_TOKEN` needs no scopes: it only reads public repos. The first deploy creates the KV namespace for
stored results.

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

## Credits and licences

The app's own code is under the MIT licence: see `LICENSE`.

- **dither-kit** (`src/components/dither-kit/`): charts, the button and the gradient, copied in from
  [Boring-Software-Inc/dither-kit](https://github.com/Boring-Software-Inc/dither-kit) with the shadcn CLI. MIT.
- **Paper Mono** (`src/assets/fonts/`): the typeface, by Paper. SIL Open Font License: see `OFL.txt` next to it.
- **Octicons**: the pull request icon, by GitHub. MIT.

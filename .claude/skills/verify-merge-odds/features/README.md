# Merge Odds verification map

This folder is the maintained source for verifying what a visitor of Merge Odds can do. Read this index before
you drive the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Your shell is in the repo's root folder.
- `A="node .claude/skills/verify-merge-odds/scripts/app.mjs"` and `UI=".claude/skills/verify-merge-odds/scripts/ui.py"` are set.
- `$A launch` printed `ready: true`. The app is at `http://localhost:5299` unless you passed `--port`.
- `$A doctor` exits 0.
- The stored results are empty: every launch empties them.
- Never drive an instance this skill did not start, such as the dev server on another port.

## Driving conventions

- API actions run through `$A check <repo>`. Browser actions run through `JOURNEY=<name> browser-use < $UI`.
- Treat every command as literal. Keep repo names and flags unchanged.
- Default to `honojs/hono` for new checks: it is small. Each new check costs about 4 seconds and half a cent.
- Prefer ARIA labels and roles over CSS position. The handles are listed in `../SKILL.md`.
- A journey that reports `problems` has failed. Fix the app or report the failure. Never loosen the journey.
- Run `$A stop` at the end, and after a failed attempt.

## Proof and skip reporting

- Capture the action and the resulting state, not only the final screen.
- API proof is the `api/NN-<label>.json` file: request, status, time, headers, body.
- Browser proof is the page text, the full-page screenshot and the `<journey>-result.json` file.
- Storage proof also names the file under `.verify/state-<port>/v3/kv/RESULTS/blobs/`.
- Record the feature ID and the entry point with every artifact you cite.
- Report an entry point you could not reach with the command you tried and the reason.
- Never report a skipped entry point as verified through a different one.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph on what the visitor sees. It then has exactly four H2
sections in this order.

1. `Sub-features` lists short IDs with one line each.
2. `How to get to it (user POV)` lists every entry point.
3. `Driving it with app.mjs and ui.py` starts with `Preconditions:` and pairs each action with an exact command and the result to expect.
4. `Gotchas` lists traps that waste or invalidate a run.

Keep implementation details out of the map. Name user paths, stable handles, required state, commands and proof.

## Features

- [Check a repo](./check-a-repo.md) covers the repo box, the Enter key, the "Try" links, deep links and the API.
- [Stored results](./stored-results.md) covers the 7-day storage: first check, repeat check, forced new check.
- [How it works](./how-it-works.md) covers the `/how` page, both ways in and both ways back.
- [Errors](./errors.md) covers the messages for bad input and for a repo that does not exist.
- [Motion](./motion.md) covers the five places that move on purpose: loading pulse, fade-outs, page crossfade,
  avatar fade-in and ordered table rows.

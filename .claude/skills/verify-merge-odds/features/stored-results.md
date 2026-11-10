# Stored results

A checked repo is stored for 7 days. A repeat check within that time returns the stored report in a few
milliseconds, and the report footer says how old it is. Adding `fresh=1` runs a new check and replaces the
stored one.

## Sub-features

- `stored-first` runs a new check when nothing is stored, and stores it.
- `stored-repeat` serves the stored report for a repeat check, with the same check date.
- `stored-case` treats `Owner/Name` and `owner/name` as the same repo.
- `stored-fresh` runs a new check with `fresh=1` and replaces the stored report.
- `stored-age` shows `Checked today` or `Checked N days ago` at the start of the report footer.
- `stored-expiry` drops a stored report after 7 days.
- `stored-failed` does not store a check whose `failed` is true.

## How to get to it (user POV)

- Check any repo twice, from the page or the API. The second answer is instant.
- Read the first words of the report footer.
- Add `&fresh=1` to an API address: `/api/analyze?repo=owner/name&fresh=1`.

## Driving it with app.mjs and ui.py

Preconditions:

- The baseline in `README.md` holds, with a fresh launch, so nothing is stored.
- No earlier call in this launch named `honojs/hono`.

- **First check.** Run `$A check honojs/hono --label first`. `served` is `new check` and `ms` is in the thousands. Note `generatedAt`.
- **Repeat check.** Run `$A check honojs/hono --label second`. `served` is `from storage`, `ms` is under 500, and `generatedAt` equals the first one.
- **Other spelling.** Run `$A check HonoJS/Hono --label case`. `served` is `from storage` with the same `generatedAt`.
- **Forced new check.** Run `$A check honojs/hono --fresh --label fresh`. `served` is `new check` and `generatedAt` is later than the first one.
- **Replaced.** Run `$A check honojs/hono --label after-fresh`. `served` is `from storage` and `generatedAt` equals the one from the forced check.
- **Side effect.** List `.verify/state-<port>/v3/kv/RESULTS/blobs/`. It holds at least one file.
- **Age on the page.** Run `JOURNEY=check REPO=honojs/hono browser-use < $UI`. `footer` starts with `Checked today.`
- **Proof.** Cite the five `api/NN-*.json` files with their `served` and `generatedAt` values side by side, the folder listing, and `ui/check-result.json`.

## Gotchas

- `stored-expiry` and a footer that reads `Checked 3 days ago` cannot be driven: they need days to pass. The wording is covered by the test "a stored result says how old it is" in `npm test`. Report expiry as not verified.
- `stored-failed` cannot be driven on demand: it needs the classifier to fail. Report it as not verified.
- The storage key carries a version. After that version is bumped, old reports stop matching and the next check is new. That is expected.
- `$A launch` empties the stored results. To test a repeat check, make both calls in one launch.
- Compare `generatedAt`, not `ms` alone. A slow machine can make a stored answer look slow.
- The dev server on another port has its own stored results. Results from there say nothing about this copy.

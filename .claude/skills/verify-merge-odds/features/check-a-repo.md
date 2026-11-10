# Check a repo

A visitor names a GitHub repo and gets a report: a verdict, the odds that a newcomer's PR is merged, a scorecard
of six grades, what gets merged, the contributing guide step by step, and why outside PRs got closed.

## Sub-features

- `check-button` types a repo in the box and presses the Check button.
- `check-enter` types a repo and presses Enter.
- `check-url` accepts a full `https://github.com/owner/name` URL in place of `owner/name`.
- `check-example` runs one of the three "Try" links under the box.
- `check-link` opens a report from a `/?repo=owner/name` address.
- `check-api` returns the same report as JSON from `GET /api/analyze?repo=owner/name`.
- `check-phone` shows the report at 390px wide with no sideways scroll.
- `check-mark` shows the animated pull request icon above the home headline. It is a `canvas[aria-hidden]`, and it hides on screens under 640px tall (700px on wide screens). No journey checks it yet: report it as not verified.
- `check-entrance` plays once on page load: the icon, the link, the headline, the repo box and the examples rise in
  that order after the fonts are in. Coming back from a report uses a short fade. No journey checks it yet: report
  it as not verified.
- `check-state` names the state of the check on `main[data-state]`: `idle`, `pending` (request sent, old view still up),
  `loading`, `done`, `error`. The moves live in `shared/check.ts`, and `tests/check.test.mjs` drives each one.
- `check-fast` skips the loading view when the answer comes within 200 ms, as stored results do.
- `check-outcomes` returns `outcomes` in the API body: outside PRs split by how each one ended (`merged`,
  `bot_merged`, `merged_elsewhere`, `withdrawn`, `rejected`, `stuck`). A `withdrawn` PR is one the author closed:
  it counts in no group, so it is in neither `outside.merged` nor `outside.closed`. `$A check` fails when the three
  merged kinds do not add up to `outside.merged`, or `rejected` is not `outside.closed`. The rules live in `shared/outcomes.ts`, and `tests/outcomes.test.mjs` covers them.
- `check-home` shows a `Merge Odds` link at the top of the report and of the loading view. It goes back to the
  home page with no page load and empties the repo box. Every `check` journey presses it as its last step.
- `check-clear` keeps the report footer above the red dither wash. The journey fails when `gapAboveWash` is under 0.

## How to get to it (user POV)

- Open the home page, type `owner/name` in the box labelled `GitHub repo`, press `Check`.
- Same, but press Enter in the box.
- Same, but paste a full github.com URL.
- Press one of the links after "Try": `vitejs/vite`, `facebook/react`, `honojs/hono`.
- Open `/?repo=owner/name` from a shared link, or press Back or Forward to one.
- Call `GET /api/analyze?repo=owner/name`.

## Driving it with app.mjs and ui.py

Preconditions:

- The baseline in `README.md` holds.
- The first call for a repo is a new check. Later calls in the same launch come from storage and cost nothing.

- **API.** Run `$A check honojs/hono --label check-api`. Status is 200, `problems` is empty, `grades` has six characters, `verdict` is a known title.
- **Button.** Run `JOURNEY=check REPO=honojs/hono browser-use < $UI`. `problems` is empty. `address` ends in `?repo=honojs%2Fhono`. `footer` reads `Checked today. Read N PRs and answered N questions about them in N.Ns`.
- **Enter.** Run `JOURNEY=check ENTRY=enter REPO=honojs/hono browser-use < $UI`. Same result.
- **Full URL.** Run `JOURNEY=check REPO=https://github.com/honojs/hono browser-use < $UI`. Same result, and the report names `honojs/hono`.
- **Example link.** Run `JOURNEY=check ENTRY=example REPO=honojs/hono browser-use < $UI`. Same result.
- **Deep link.** Run `JOURNEY=check ENTRY=link REPO=honojs/hono browser-use < $UI`. Same result with no typing.
- **Phone.** Run `JOURNEY=check VIEW=phone REPO=honojs/hono browser-use < $UI`. `problems` is empty, so the page did not scroll sideways.
- **Proof.** Cite `api/NN-check-api.json`, and for each browser entry `ui/check[-entry][-phone]-2-report.txt`, `-3-report.png` and `-result.json`. Open the screenshot and look at it.

## Gotchas

- Numbers and verdicts change as the repo's PRs change. Assert the shape, never a fixed percent or a fixed verdict.
- The journey checks that six scorecard rows and a verdict are on the page. It does not check that the numbers are right. For the math, read the `math` field of each scorecard row in the API evidence.
- A repo with almost no outside PRs returns `Too quiet to call` and `odds: null`. That is a pass.
- When the classifier or GitHub fails mid-check, the API returns 200 with `failed: true` and `check` reports it as a problem. Run it again once before calling it a bug.
- Back and Forward between two reports is an entry point no journey drives yet. Report it as not verified.
- The charts are canvases. Their content is in the screenshot only, not in the page text.
- The browser keeps an API response for an hour. A second check of the same repo in one tab may not reach the server. Prove storage with the API harness.

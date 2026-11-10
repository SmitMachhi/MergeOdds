# How it works

The `/how` page explains one check in six numbered steps, with the numbers of one real check of vitejs/vite.
It is the one page that names the classifier, Jev. It shows the five requests in a table, one real question with
its answer, the sum, the grade cut-offs, the verdict table and the limits.

## Sub-features

- `how-home` opens the page from the green "How it works?" link under the icon on the home page.
- `how-direct` opens the page from the `/how` address.
- `how-steps` shows the six step titles in order.
- `how-outcomes` shows the six-row table under step 3: how each PR ended, its group (Merged, Rejected, Stuck, or
  Not counted for PRs the author closed) and who settles it (GitHub or Jev). The rows come from `shared/outcomes.ts`.
- `how-requests` shows the five-row request table: Rules, Requirements, Quotes, PR kinds, Close reasons.
- `how-sum` shows `(26 + 1) ÷ (93 + 2)` and counts up to `28%` once it is on screen.
- `how-back-top` returns to the home page from the "Check repos" link at the top.
- `how-back-button` returns to the home page from the "Check repos" button at the end.
- `how-phone` shows the page at 390px wide with no sideways scroll.

## How to get to it (user POV)

- On the home page, press `How it works?` under the icon, above the headline.
- Open `/how`.
- Leave with `Check repos` at the top right, `Merge Odds` at the top left, or the `Check repos` button at the end.

## Driving it with app.mjs and ui.py

Preconditions:

- The baseline in `README.md` holds. This page makes no API call, so it costs nothing.

- **Home link in, top link out.** Run `JOURNEY=how browser-use < $UI`. `problems` is empty, `steps` is 6, `back` is `/`.
- **Address in, end button out.** Run `JOURNEY=how ENTRY=direct browser-use < $UI`. Same result.
- **Phone.** Run `JOURNEY=how VIEW=phone browser-use < $UI`. `problems` is empty, so the page did not scroll sideways.
- **Proof.** Cite `ui/how[-direct][-phone]-1-page.txt`, `-2-page.png` and `-result.json`. Open the screenshot and check that the second square grid is dimmed and the request table is visible.

## Gotchas

- Parts of the page appear only once they scroll on screen. The journey scrolls in small steps for that. A screenshot taken without scrolling shows blank bands and `0%`. That is the capture, not a bug.
- In a hidden browser tab the page does not animate. The script turns on focus emulation for its own tab. If `28%` is still missing, run the journey again once before reporting it.
- The full-page screenshot of this page can fail with `Page.captureScreenshot timed out after 60s`. The text checks still ran. Report the picture as missing, and count it as a page bug only when a text check fails too.
- The numbers on this page are fixed text from one check of vitejs/vite on 10 November 2026 (245 PRs, 34 days, 112 outside, 93 newcomers, 524 questions). That check is on tape: `tape.mjs replay vitejs/vite --out <folder>` prints it again while `.verify/tapes/vitejs-vite.json` exists. The journey checks the sum and the example answer by their exact text, so a new example means new text in `ui.py` too. They do not change when the math changes. A change to the math needs this page updated by hand.
- The `Merge Odds` link at the top left is a way back that no journey drives yet. Report it as not verified.
- Every other page must never name the engine. `npm test` enforces that, and the `check` journey checks it on the report.

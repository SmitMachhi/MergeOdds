# Motion

Five places where the page moves on purpose: the loading view keeps a pulse while a check runs, the home link and
the error message fade out, home and How it works crossfade, the repo avatar fades in, and the rows of two tables
on How it works arrive in order. Each one replaces a hard cut or a frozen screen.

## Sub-features

- `motion-loading` pulses the square of the current loading stage: opacity 0.35 to 1 and back, 1200 ms, without
  end. The squares of finished stages stay solid. Each square says `done`, `now` or `next` in `data-stage`.
- `motion-exit-home` fades the `Merge Odds` link out over 150 ms when the visitor leaves a report for the home page.
- `motion-exit-error` fades the error message out over 150 ms when a report, the loading view or a new message
  takes its place.
- `motion-pages` crossfades home and How it works over 200 ms, both ways. Firefox has no such crossfade and cuts.
- `motion-avatar` fades the repo avatar in over 200 ms when it arrives. One the browser already holds shows at once.
- `motion-tables` brings in the rows of the outcome table and the verdict table one by one, top to bottom: each
  fades for 300 ms and starts 40 ms after the row above. Those two tables carry `data-ordered`. The request table
  and the grade table arrive as one block.

## How to get to it (user POV)

- Loading: check a repo this copy has not stored, and watch the four squares under the stage text.
- Home link: on a report, press `Merge Odds` at the top left.
- Error message: type `not a repo`, press `Check`, then check a real repo.
- Pages: on the home page press `How it works?`, then `Check repos` at the top right.
- Avatar: open a report. The picture left of the repo name fades in.
- Tables: on `/how`, scroll to the table under step 3 and to the verdict table under step 6.

## Driving it with app.mjs and ui.py

Preconditions:

- The baseline in `README.md` holds.
- `REPO` for the loading part is a repo this launch has not checked yet and that takes over 5 seconds:
  `vitejs/vite`, `apache/spark`, `pytorch/pytorch`. A stored or fast repo ends before the last stage can be judged,
  and the part says so.

- **All five.** Run `JOURNEY=motion REPO=vitejs/vite browser-use < $UI`. `problems` is empty and `parts` has
  `loading`, `exits`, `pages`, `avatar` and `tables`. It costs one new check.
- **One part.** Add `PART=loading`, `PART=exits`, `PART=pages`, `PART=avatar` or `PART=tables`.
- **Phone.** Add `VIEW=phone`, with a repo not checked yet for the loading part.
- **What to expect in `parts`.** `loading.pulse` is `{ms: 1200, repeats: "endless", opacity: "0.35>1>0.35"}`.
  Each entry of `exits` has `fadeMs: 150`. Both entries of `pages` have `crossfade: true` and `duration: "0.2s"`.
  `avatar.fadeMs` is 200. `tables.waitsMs` is `[0, 40, 80, 120, 160, 200]` and `tables.fadeMs` is 300.
- **Proof.** Cite `ui/motion[-part][-phone]-result.json`. This journey saves no screenshot: a still picture cannot
  show motion. Its proof is the animation each element ran, as the browser recorded it.

## Gotchas

- The journey's tab is hidden, and a hidden tab moves its animations on about once a second. Opacity read from the
  page jumps, so a 150 ms fade is easy to miss. The journey reads `element.getAnimations()` in its place: the
  browser's own record of each running animation, with its length, repeat count, delay and keyframes. Do not
  replace that with screenshots or with opacity samples.
- For the same reason `goneAfterMs` can read 200 or 1200. Both are fine: the fade is 150 ms on the browser's
  clock, and the hidden tab removes the element on its next frame.
- A part that reports "left with a hard cut" or "sits still" found no animation at all. That is the failure this
  journey exists for.
- The crossfade rule lives in `index.html`, not in the stylesheet: a new page has to carry it before its first
  paint, and the dev server adds the stylesheet with a script, too late.
- Editing `index.html` makes Vite restart, and the restarted server can hang on its dependency files: pages stay
  blank and journeys time out on `Page.navigate`. Run `$A stop` and `$A launch` after such an edit. The dev server
  on the other port needs the same restart by whoever owns it.
- Each reading opens one connection to the browser. Reading in a tight loop ran Windows out of ports
  (`WinError 10048`). The journey waits 25 ms between readings. Keep a pause in any loop you add.
- A run that dies midway can leave its tab open, and the next run then times out on `Page.navigate`. List the
  tabs, close the ones on the private copy's address, and run again.
- Motion that only a person can judge, such as whether the crossfade and the page entrance feel right together,
  is not verified by this journey. Report it as not verified.

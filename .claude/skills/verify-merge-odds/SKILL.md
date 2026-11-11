---
name: verify-merge-odds
description: Launch a private copy of the Merge Odds web app (the Vite + Cloudflare Worker app at the repo's root), drive it like a visitor through its API and its pages, and save proof. Use after any change to worker/, src/ or shared/ to prove a feature works in the real app, when asked to verify, demo or screenshot the app, or to check that a repo check, the stored results, the How it works page or the error messages still behave.
---

# Verify Merge Odds

Merge Odds is one Cloudflare Worker that serves a React page and one API route, `GET /api/analyze?repo=owner/name`.
A visitor pastes a GitHub repo and gets the odds that a newcomer's PR is merged.

This skill starts its own copy of the app, drives it, and keeps the proof. Run every command from the repo's root
folder. Read [features/README.md](features/README.md) before you drive anything: it lists the features and the
recipe for each.

```bash
A="node .claude/skills/verify-merge-odds/scripts/app.mjs"
```

## Launch

```bash
$A launch            # port 5299, or: $A launch --port 5301
```

- Starts `vite` (the repo's `npm run dev`) on its own port with `VERIFY_STATE_DIR` set. `vite.config.ts` reads
  that variable and gives this copy its own stored results and its own Vite cache under `.verify/state-<port>/`.
  The dev server a person may have open on another port is not touched.
- Every launch empties the state folder first, so the app starts with no stored results.
- Ready means two things answered, and the command waits for both (up to 90 seconds, about 10 in practice): the
  home page has the title `Merge Odds`, and the worker answers `/api/analyze?repo=` with its own 400 message.
- It prints `ready: true` with the `url`, `pid` and `evidence` folder, and writes them to `.verify/run.json`.
- Needs `.dev.vars` with `GITHUB_TOKEN` and `TYPESAFE_API_KEY`. Launch refuses to start without both and
  says which is missing. Never print their values.
- There are no migrations and no seed data. The only state is the stored results, and they start empty.
- A second `launch` while one is running reports the running one. For two copies side by side, use two checkouts.

## Doctor

```bash
$A doctor
```

Read-only. Run it first whenever something looks off. It exits 1 unless all of these hold: the process this
skill started is alive, the home page is Merge Odds, the worker answers the API, both keys are set, and the
state and evidence folders exist. Drive only an instance that passes. Never drive the dev server on another port.

## Drive

Two harnesses. Use the API one for numbers and storage, the browser one for anything a visitor sees.

**API** (plain HTTP, no browser):

```bash
$A check honojs/hono                      # one real check, about 4 seconds
$A check honojs/hono --label second       # label names the evidence file
$A check honojs/hono --fresh              # adds fresh=1: forces a new check and replaces the stored one
$A check "not a repo" --expect 400        # an error path: pass the status you expect
```

It prints `status`, `ms`, `served` ("new check" or "from storage"), `generatedAt`, `odds`, `verdict`, `grades`
and a `problems` list, and exits 1 when `problems` is not empty. It checks the status, that the body is JSON,
that a 200 has six scorecard rows, a verdict and odds from 0 to 100, and that the response never names the
engine behind the answers.

**Browser** (the `browser-use` CLI, through the Bash tool, in a tab the script opens and closes itself):

```bash
JOURNEY=check REPO=honojs/hono browser-use < .claude/skills/verify-merge-odds/scripts/ui.py
JOURNEY=how   browser-use < .claude/skills/verify-merge-odds/scripts/ui.py
JOURNEY=error browser-use < .claude/skills/verify-merge-odds/scripts/ui.py
JOURNEY=motion REPO=vitejs/vite browser-use < .claude/skills/verify-merge-odds/scripts/ui.py
```

Options are environment variables in front of the command:

- `ENTRY` picks how the visitor gets there. For `check`: `button` (default), `enter`, `example`, `link`. For `how`: `home` (default), `direct`.
- `REPO` is `owner/name` or a full github.com URL. `ENTRY=example` needs `vitejs/vite`, `facebook/react` or `honojs/hono`.
- `VIEW=phone` runs at 390px wide and fails if the page scrolls sideways. The default is 1280px.
- `PART` runs one part of `motion`: `loading`, `exits`, `pages`, `avatar` or `tables`. Leave it out for all five.
  `motion` checks that things move, by reading the animations the browser ran. See `features/motion.md`.

Each journey prints one JSON result with a `problems` list and exits 1 when it is not empty. Stable handles it
uses, for when you add a journey:

| Element | Handle |
| --- | --- |
| State of the check: `idle`, `pending`, `loading`, `done`, `error`. After `done`, wait for `footer` too: the report replaces the fading loading view up to half a second later | `main[data-state]` on the home page |
| Repo box | `input[aria-label="GitHub repo"]` |
| Check button | `button[type="submit"]` |
| Error message | `[role="alert"]` |
| Report footer ("Checked today. Read N PRs ...") | `footer` |
| Red dither wash at the bottom of every page | `[data-wash]` |
| Link to the How it works page | `a[href="/how"]` |
| Home link on a report and on the loading view | `main a[href="/"]` |
| The four squares of the loading view: `done`, `now` or `next` | `[data-stage]` |
| Repo avatar on a report | `main header img` |
| The two tables on `/how` whose rows arrive in order, and their rows | `[data-ordered]`, `[data-row]` |
| "Check repos" link on that page | `header a[href="/"]` |
| Source link with the live star count, top right of each page | `a[href="https://github.com/SmitMachhi/MergeOdds"]` |
| Deep link to a report | `/?repo=owner/name` |

`browser-use` drives the user's own browser over its debug port. If it reports `DevToolsActivePort not found`,
open `brave://inspect/#remote-debugging` (or the `chrome://` one), read the port after "Server running at", and
put `BU_CDP_URL=http://127.0.0.1:<port>` before the command. On this machine the port has been 9333. The script
never touches the user's own tabs.

`browser-use` keeps one current tab per connection, and every session on the machine shares the default
connection. If another session drives the browser at the same time, the two switch each other's tab mid-run: a
journey then fails with a missing element, or acts on the other session's page. Put `BU_NAME=mergeodds` before
every `browser-use` command of a run to get a connection of your own.

The browser keeps each API result for one hour (`cache-control: max-age=3600`), and every launch on port 5299 has
the same address. `ui.py` turns the cache off for its own tab, so a journey shows what the server answers now.
A tab you open by hand does not: after a change to the math, hard-refresh it or it shows the older numbers.

The browser may hold a saved page zoom for `localhost`. `ui.py` corrects for it: it resizes the desktop view until
the page sees the size it asked for, and it calibrates where clicks land, because a zoom shifts phone-mode clicks.

## Evidence

Everything lands in `.verify/evidence/<run id>/`, and `launch` prints that path.

- `server.log`: the server's output for the whole run.
- `api/NN-<label>.json`: one file per `check` call with the request, status, time, headers and the full body.
- `ui/<journey>[-entry][-phone]-*.txt`: the page text before and after the action.
- `ui/<journey>[-entry][-phone]-*.png`: a full-page screenshot of the end state.
- `ui/<journey>[-entry][-phone]-result.json`: the journey's result and its `problems`.

Proof standards for this app:

- Drive the real path: the repo box and the Check button, or the public API route. Never call `analyze()` or a
  component directly, and never write to the stored results by hand.
- Capture the action and the result. For storage that means the first call, the second call, and a comparison
  of `served` and `generatedAt` between them.
- Check the side effect too. After a stored check, `.verify/state-<port>/v3/kv/RESULTS/blobs/` holds a file.
- Nothing is mocked. Every new check calls GitHub with the user's token and the classifier with the user's key:
  about 4 seconds and half a cent. A hit from storage calls neither. Use the smallest number of new checks that
  proves the point, and prefer `honojs/hono` (about 140 PRs) over a large repo.
- Numbers move as the repo's PRs change. Assert shapes and relations (six rows, a known verdict, the same
  `generatedAt` twice), never a fixed percent.
- The text check (`npm test`) and the typecheck (`npm run typecheck`) are cheap and worth running, but they are
  not proof that a feature works.

## Cleanup

```bash
$A stop
```

- Kills only the process this skill started, and only while it still serves Merge Odds on the recorded port.
  It never kills by name.
- Removes `.verify/state-<port>/` and `.verify/run.json`.
- Keeps `.verify/evidence/<run id>/`. The command prints `evidenceKept` with the path. `.verify/` is in
  `.gitignore`.
- Run it after a failed attempt too, so no server or port is left behind.

## Helpers

| File | What it is | How to run it |
| --- | --- | --- |
| `scripts/app.mjs` | Launch, doctor, API check, stop | `node .claude/skills/verify-merge-odds/scripts/app.mjs <launch|doctor|check|stop>` |
| `scripts/ui.py` | Runs one browser journey: shared helpers and settings | `JOURNEY=<check|how|error|motion> browser-use < .claude/skills/verify-merge-odds/scripts/ui.py` |
| `scripts/journeys.py` | The check, how and error journeys. `ui.py` loads it | Through `ui.py` |
| `scripts/motion_live.py`, `scripts/motion_pages.py` | The motion journey's five parts. `ui.py` loads both | Through `ui.py` with `JOURNEY=motion` |
| `scripts/tape.mjs` | Record real checks, then replay them against changed worker code | `node .claude/skills/verify-merge-odds/scripts/tape.mjs <record|replay> [owner/name ...]` |

`tape.mjs` answers one question: did a change to `worker/` or `shared/` change any result? It needs no server.

1. Before the change, run `tape.mjs record vitejs/vite apache/spark octocat/Hello-World`. Each repo costs one real
   check. The tape lands in `.verify/tapes/` with every answer GitHub and the classifier gave, and the result.
2. After the change, run `tape.mjs replay`. It runs the worker as it is on disk against the saved answers, with no
   network and no keys, and prints `SAME` or `DIFFERENT in <fields>` per tape. It exits 1 on any difference.
3. For a new field in the result, add `--ignore <field>`. `--out <folder>` saves each replayed result.
4. When you meant to change results, read the listed fields, check they are the ones you expected, then run
   `tape.mjs replay --accept`. It saves the new results on the tapes, so the next replay starts from them.

Pick repos that cover the rule you touch: `apache/spark` and `pytorch/pytorch` land PRs with a merge bot,
`octocat/Hello-World` has no merges, `ollama/ollama` has over 100 open PRs. A replay proves the code decides the
same on the same answers. It is not proof that a feature works on the page: that still takes a journey.
Tapes go stale when the worker asks GitHub or the classifier something new: replay then reports new questions,
so record again from the commit before your change.

Keep `ui.py` and the journey files ASCII. On Windows `browser-use` garbles other characters in a script read from stdin, including
backslash-u escapes, so build them with `chr()`.

# Errors

When a check cannot run, the visitor stays on the home page and reads one short message under the repo box. The
API returns the same message as JSON with a matching status.

## Sub-features

- `error-input` answers text that is not a repo with `Paste a GitHub repo, like facebook/react` and status 400.
- `error-missing` answers a repo GitHub does not have with `Can't find that repo. Is it public?` and status 404.
- `error-instant` shows the bad-input message on the page with no request to the API and no new history entry.
- `error-stays` keeps the headline and the repo box on the page, with no report.
- `error-clear` keeps the message above the red dither wash. The journey fails when `gapAboveWash` is under 0.
- `error-too-fast` answers the sixth new check of one visitor within one minute with
  `Too many new checks. Wait one minute and try again` and status 429. Stored results still answer 200.
- `error-budget` answers new checks with `The site has run all its new checks for today. Stored results still open.
  Try again tomorrow` and status 429 once the site has run 300 of them that day.
- `error-keys` answers with `The server is missing its API keys` and status 500 when the server has no keys.

## How to get to it (user POV)

- Type text that is not `owner/name` or a github.com URL, such as `not a repo`, and press `Check`.
- Type a repo that does not exist, such as `octocat/this-repo-does-not-exist-zz9`, and press `Check`.
- Call the API with the same values.

## Driving it with app.mjs and ui.py

Preconditions:

- The baseline in `README.md` holds. Neither case calls the classifier. The missing-repo case makes one GitHub call.

- **Bad input, API.** Run `$A check "not a repo" --expect 400 --label error-input`. Status is 400 and `error` is `Paste a GitHub repo, like facebook/react`.
- **Missing repo, API.** Run `$A check octocat/this-repo-does-not-exist-zz9 --expect 404 --label error-missing`. Status is 404 and `error` is `Can't find that repo. Is it public?`
- **Both, on the page.** Run `JOURNEY=error browser-use < $UI`. `problems` is empty and `messages` holds both texts.
- **Phone.** Run `JOURNEY=error VIEW=phone browser-use < $UI`. `problems` is empty.
- **Proof.** Cite the two `api/NN-error-*.json` files and `ui/error[-phone]-1-page.txt`, `-2-page.png` and `-result.json`.

## Gotchas

- `error-too-fast` needs a visitor address, which only Cloudflare sets. On the private copy, send one yourself:
  `curl -H "cf-connecting-ip: 203.0.113.9" "<url>/api/analyze?repo=octocat/this-repo-does-not-exist-zz9"` six times
  within one minute. The first five answer 404 and the sixth 429. No journey drives it: `$A check` and the page
  send no such address, so they never meet this limit.
- `error-budget` cannot be driven without 300 new checks. `tests/budget.test.mjs` covers the count. Report the
  live path as not verified.
- `error-keys` cannot be driven: `$A launch` refuses to start without both keys. Report it as not verified.
- The message sits in an element with `role="alert"`. Wait for its text to equal the expected message: the second submit replaces the first message after a moment.
- A GitHub rate limit or outage returns status 502 with GitHub's own message. That is a pass for the app and a reason to stop the run.
- The wash height follows the page height, so `error-clear` depends on the screen. The journey covers 1280x900 and 390x844. Other sizes are not verified by it.
- An error must not store anything. After the two API calls, `.verify/state-<port>/v3/kv/RESULTS/blobs/` has no new file.

// The life of one check, as a state machine. The page (src/App.tsx) sends it events, and it decides what is on
// screen. It has no React and no browser calls, so tests/check.test.mjs can drive every path.
// It lives in shared/ because the worker reads a repo the same way the page does.
import type { Analysis } from "./types";

export const BAD_REPO = "Paste a GitHub repo, like facebook/react";

/** Accepts "owner/name" or any github.com URL that starts with one. */
export function parseRepo(input: string): [string, string] | null {
  const m = input.trim().replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "").replace(/\.git$/, "")
    .match(/^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})(?:[/?#].*)?$/);
  return m ? [m[1], m[2]] : null;
}

/** What the page shows. */
export type View =
  | { status: "idle" }
  | { status: "loading"; repo: string }
  | { status: "done"; data: Analysis }
  | { status: "error"; message: string };

/** `view` is on screen. `pending` is the check in flight, if there is one: its answer can still replace the view. */
export type Check = { view: View; pending: { id: number; repo: string } | null };

export type CheckEvent =
  /** The visitor sent text that reads as a repo. `id` names this request, so a late answer to an older one is dropped. */
  | { type: "submit"; id: number; repo: string }
  /** The visitor sent text that is not a repo. No request is made. */
  | { type: "invalid" }
  /** The answer is taking a while: time to show the loading view. A fast answer never shows it. */
  | { type: "slow"; id: number }
  | { type: "resolved"; id: number; data: Analysis }
  | { type: "rejected"; id: number; message: string }
  /** The address no longer names a repo: back to the start, and any answer still on its way is dropped. */
  | { type: "reset" };

/** The first state. A page opened on a report link starts on the loading view, not on the home page. */
export const start = (repoInAddress: string | null): Check => ({
  view: repoInAddress && parseRepo(repoInAddress) ? { status: "loading", repo: repoInAddress } : { status: "idle" },
  pending: null,
});

export function next(s: Check, e: CheckEvent): Check {
  const current = "id" in e && s.pending?.id === e.id;
  switch (e.type) {
    case "submit":
      // keep what is on screen until the answer comes or turns out slow; a loading view names the new repo at once
      return { view: s.view.status === "loading" ? { status: "loading", repo: e.repo } : s.view, pending: { id: e.id, repo: e.repo } };
    case "invalid":
      return { view: { status: "error", message: BAD_REPO }, pending: null };
    case "slow":
      return current ? { ...s, view: { status: "loading", repo: s.pending!.repo } } : s;
    case "resolved":
      return current ? { view: { status: "done", data: e.data }, pending: null } : s;
    case "rejected":
      return current ? { view: { status: "error", message: e.message }, pending: null } : s;
    case "reset":
      return { view: { status: "idle" }, pending: null };
  }
}

export type StateName = "idle" | "pending" | "loading" | "done" | "error";

/** One word for the whole state. The page puts it on `<main data-state>`, where tests, the verify skill and agents
 *  read it. "pending" is a request in flight while the old view is still up. */
export const stateName = (s: Check): StateName => (s.view.status === "loading" ? "loading" : s.pending ? "pending" : s.view.status);

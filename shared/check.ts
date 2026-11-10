export const BAD_REPO = "Paste a GitHub repo, like facebook/react";

/** `owner/name` out of what a visitor typed: a bare name or a github.com address. Null when it is neither. */
export function parseRepo(input: string): [string, string] | null {
  const m = input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/\.git$/, "")
    .match(/^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})(?:[/?#].*)?$/);
  return m ? [m[1], m[2]] : null;
}

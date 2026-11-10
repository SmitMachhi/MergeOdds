// Small helpers for the sentences the app writes. Both the worker and the page use them,
// and tests/text.test.mjs checks them.

/** "1 newcomer", "2 newcomers", "0 newcomers". Pass `many` for irregular plurals. */
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Captions end without a period. A period between two sentences stays. */
export const noPeriod = (s: string) => s.replace(/\.$/, "");

/** "Checked today", "Checked 1 day ago", "Checked 3 days ago". `iso` is when the check ran. */
export const checkedAgo = (iso: string, now = Date.now()) => {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return days < 1 ? "Checked today" : `Checked ${plural(days, "day")} ago`;
};

/** "Half of the 12 merged outside PRs", or "The one merged outside PR" when there is only one. */
export const halfOf = (n: number, what: string, many = what + "s") => (n === 1 ? `The one ${what}` : `Half of the ${n} ${many}`);

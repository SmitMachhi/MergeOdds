// The site is open to everyone, and each new check spends GitHub and classifier quota. Two guards keep that
// bounded: each visitor gets a few new checks per minute (the rate limit binding in wrangler.jsonc), and the whole
// site gets a fixed number per day (below). Stored results cost nothing, so they pass both.

/** New checks the whole site may run per day. At about half a cent each, this caps one day at about 1.50 dollars. */
export const DAILY_NEW_CHECKS = 300;

export const TOO_FAST = "Too many new checks. Wait one minute and try again";
export const BUDGET_SPENT = "The site has run all its new checks for today. Stored results still open. Try again tomorrow";

/** The part of Workers KV this file needs. */
type Store = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

/** Counts one new check against today's budget. False when the budget is spent.
 *  It reads the count and writes it back, so two checks at the same moment can count as one. That is fine for
 *  a budget: it may run over by a few, never by much. */
export async function spendOne(store: Store, now = Date.now(), max = DAILY_NEW_CHECKS): Promise<boolean> {
  const key = `budget:${new Date(now).toISOString().slice(0, 10)}`;
  const used = Number(await store.get(key)) || 0;
  if (used >= max) return false;
  await store.put(key, String(used + 1), { expirationTtl: 2 * 86400 });
  return true;
}

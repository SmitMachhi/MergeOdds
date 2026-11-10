// All GitHub reads, as few and as lean as possible: speed is the product.

export class GhError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export async function gql<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "merge-odds" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new GhError(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`, 502);
  const body = (await res.json()) as { data?: T & { repository?: unknown }; errors?: { type?: string; message: string }[] };
  if (body.errors?.length) {
    const notFound = body.errors.find((e) => e.type === "NOT_FOUND" && /Could not resolve to a (Repository|User|Organization)/.test(e.message));
    if (notFound) throw new GhError("Repo not found", 404);
    if (!body.data) throw new GhError(body.errors[0].message, 502);
  }
  return body.data as T;
}

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

const POLICY_PATHS: Record<string, string> = {
  c1: "CONTRIBUTING.md", c2: ".github/CONTRIBUTING.md", c3: "docs/CONTRIBUTING.md", c4: "docs/contributing.md",
  c5: "contributing.md", ai: "AI_POLICY.md", t1: ".github/PULL_REQUEST_TEMPLATE.md", t2: ".github/pull_request_template.md",
};

const blobs = Object.entries(POLICY_PATHS)
  .map(([k, p]) => `${k}: object(expression: "HEAD:${p}") { ... on Blob { text } }`).join("\n");

const META = (withWorkflows: boolean) => `query($o:String!,$n:String!){ repository(owner:$o,name:$n){
  nameWithOwner description url stargazerCount forkCount isArchived pushedAt
  primaryLanguage{name} licenseInfo{spdxId} owner{avatarUrl}
  openIssues: issues(states:OPEN){totalCount}
  openPRs: pullRequests(states:OPEN){totalCount}
  gfi: issues(states:OPEN, labels:["good first issue"]){totalCount}
  helpWanted: issues(states:OPEN, labels:["help wanted"]){totalCount}
  ${blobs}
  ${withWorkflows ? `wf: object(expression:"HEAD:.github/workflows"){ ... on Tree { entries { name object { ... on Blob { byteSize text } } } } }` : ""}
}}`;

const ACTOR = `author{__typename login}`;
// Lean on purpose: nested comments or timelines make this list 3x slower. Details are fetched only for outside PRs.
const PRS = `query($o:String!,$n:String!,$a:String,$s:[PullRequestState!]){ repository(owner:$o,name:$n){
  pullRequests(states:$s, first:100, after:$a, orderBy:{field:UPDATED_AT,direction:DESC}){
    pageInfo{hasNextPage endCursor}
    nodes{ number title url updatedAt createdAt mergedAt closedAt authorAssociation ${ACTOR} mergedBy{login} } }
}}`;

export type Actor = { __typename: string; login: string } | null;
export type Note = { author: Actor; authorAssociation: string; createdAt?: string; bodyText?: string };
export type PR = {
  number: number; title: string; url: string; updatedAt: string; createdAt: string; mergedAt: string | null;
  closedAt: string; authorAssociation: string; author: Actor; mergedBy: { login: string } | null; merged: boolean;
};
export type Detail = {
  early?: { nodes: Note[] }; reviews?: { nodes: Note[] }; last?: { nodes: Note[] };
  timelineItems?: { nodes: ({ closer: { __typename: string } | null; actor: Actor } | null)[] };
  additions?: number; deletions?: number;
};
export type OpenPR = { number: number; title: string; url: string; createdAt: string; authorAssociation: string; author: Actor };
type Page = { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Omit<PR, "merged">[] };

type Blob = { text?: string | null } | null;
export type Meta = {
  nameWithOwner: string; description: string | null; url: string; stargazerCount: number; forkCount: number;
  isArchived: boolean; pushedAt: string; primaryLanguage: { name: string } | null; licenseInfo: { spdxId: string } | null;
  owner: { avatarUrl: string }; openIssues: { totalCount: number }; openPRs: { totalCount: number };
  gfi: { totalCount: number }; helpWanted: { totalCount: number };
  wf?: { entries?: { name: string; object: { byteSize?: number; text?: string | null } | null }[] } | null;
  c1: Blob; c2: Blob; c3: Blob; c4: Blob; c5: Blob; ai: Blob; t1: Blob; t2: Blob;
};

export async function fetchMeta(token: string, o: string, n: string): Promise<Meta> {
  type R = { repository: Meta | null };
  let r: R;
  try {
    r = await gql<R>(token, META(true), { o, n });
  } catch (e) {
    if (e instanceof GhError && e.status === 404) throw e;
    r = await gql<R>(token, META(false), { o, n }); // huge workflow folders can blow GitHub's query limits
  }
  if (!r.repository) throw new GhError("Repo not found", 404);
  return r.repository;
}

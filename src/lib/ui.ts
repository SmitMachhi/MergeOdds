import type { DitherColor } from "@/components/dither-kit";
import type { Analysis } from "../../shared/types";

/** Brand color: buttons and the page wash. Outcome colors (green merged, red rejected) stay as they are. */
export const BRAND: DitherColor = "red";

export async function fetchAnalysis(repo: string, signal?: AbortSignal): Promise<Analysis> {
  const res = await fetch(`/api/analyze?repo=${encodeURIComponent(repo)}`, { signal });
  const body = (await res.json()) as Analysis | { error: string };
  if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : `Request failed (${res.status})`);
  return body;
}

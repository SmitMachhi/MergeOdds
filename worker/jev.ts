// Every question Jev is asked lives in this file. Jev makes the judgments; analyze.ts decides what they mean.
import type { CloseReason, PointCategory, RuleId } from "../shared/types";

type Noul = { type: "noul"; instructions: unknown; criteria?: { true?: string; false?: string } };
type Choice = { type: "choice"; instructions: unknown; criteria: Record<string, string | null> };
type Score = { type: "score"; instructions: unknown; criteria: string[] };
export type Question = Noul | Choice | Score;

export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; probabilities: Record<string, number> };

export type JevResult = { answers: Record<string, Answer>; model: string; inputTokens: number; questions: number };

export async function ask(key: string, state: unknown, questions: Record<string, Question>): Promise<JevResult> {
  const body = JSON.stringify({ model: "jev-latest", state, questions });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body,
    });
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * Number(res.headers.get("retry-after") ?? 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const r = (await res.json()) as { model: string; answers: Record<string, Answer>; usage?: { input_tokens?: number } };
    return { answers: r.answers, model: r.model, inputTokens: r.usage?.input_tokens ?? 0, questions: Object.keys(questions).length };
  }
}

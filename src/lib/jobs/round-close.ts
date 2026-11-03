import type { JobContext, RoundStore } from "./types";

export type RoundCloseJobResult = { finalized: string[]; alreadyFinal: string[] };

export async function closeDueRounds({ store, now }: JobContext<RoundStore>): Promise<RoundCloseJobResult> {
  const result: RoundCloseJobResult = { finalized: [], alreadyFinal: [] };
  for (const round of await store.roundsDueForClose(now)) {
    const outcome = await store.finalizeRound(round.id, now);
    if (outcome === "finalized") result.finalized.push(round.id);
    else result.alreadyFinal.push(round.id);
  }
  return result;
}

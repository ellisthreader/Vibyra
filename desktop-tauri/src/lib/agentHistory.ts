import type { ChatEventRow } from "../agentTypes";

/** A replay and a live channel can deliver the same durable event. */
export function mergeHistory(previous: readonly ChatEventRow[], incoming: readonly ChatEventRow[]): ChatEventRow[] {
  const bySequence = new Map(previous.filter((row) => row.seq >= 0).map((row) => [row.seq, row]));
  for (const row of incoming) if (row.seq >= 0) bySequence.set(row.seq, row);
  return [...bySequence.values()].sort((a, b) => a.seq - b.seq);
}

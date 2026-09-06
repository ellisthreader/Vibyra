import type { ChatEventRow } from "../agentTypes";
import { mergeHistory } from "../lib/agentHistory";
import { emptyTranscript, reduce, reduceAll, type TranscriptState } from "../lib/agentEventReducer";

const histories = new Map<string, ChatEventRow[]>();
export function historyBounds(chat: string): { first: number; last: number } {
  const rows = histories.get(chat) ?? [];
  return { first: rows[0]?.seq ?? 0, last: rows.at(-1)?.seq ?? -1 };
}
export function applyRows(chat: string, incoming: ChatEventRow[], current?: TranscriptState): TranscriptState {
  const previous = histories.get(chat) ?? [];
  const rows = mergeHistory(previous, incoming);
  histories.set(chat, rows);
  const first = previous[0]?.seq ?? Infinity;
  if (incoming.some((row) => row.seq >= 0 && row.seq < first)) return reduceAll(rows);
  return incoming.reduce(reduce, current ?? emptyTranscript());
}
export function forgetHistory(chat?: string): void {
  if (chat) histories.delete(chat);
  else histories.clear();
}

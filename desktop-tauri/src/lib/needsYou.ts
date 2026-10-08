import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { chatNeeds, useAgentAttention, type ChatNeed } from "../state/agentAttentionStore";
import { usePhoneStore } from "../state/phoneStore";
import { useProductMode } from "../state/productModeStore";
import { useProjectStore } from "../state/projectStore";
import { useTeammateNeeds } from "../state/teammateNeedsStore";
import { useTerminalStore } from "../state/terminalStore";
import type { PaneState } from "../state/terminalStoreTypes";
import { clearAttention } from "./activity";
import { isChrome } from "./terminalPlainText";
import { getTerminal } from "./terminalRegistry";

/** A terminal "needs you" when it is running and its activity reads as a
 * waiting prompt or a bell — the same rule Home's attention button used. */
function needsYou(pane: PaneState, activity: Record<number, string>): boolean {
  return pane.status === "running" && activity[pane.id] === "attention";
}

/** Terminals waiting on the person, most recently used first. */
export function useNeedsYou(projectId?: string): PaneState[] {
  return useTerminalStore(useShallow((state) => state.panes
    .filter((pane) => needsYou(pane, state.activity) && (!projectId || pane.projectId === projectId))
    .sort((a, b) => b.lastFocusedAt - a.lastFocusedAt)));
}

/** Agent chats waiting on the person: an approval, or a finish not yet seen. */
export function useChatNeeds(projectId?: string): ChatNeed[] {
  const runs = useAgentAttention((s) => s.runs);
  const seen = useAgentAttention((s) => s.seen);
  const dismissed = useAgentAttention((s) => s.dismissed);
  return useMemo(() => chatNeeds(runs, seen, dismissed).filter((need) => !projectId || need.projectId === projectId), [runs, seen, dismissed, projectId]);
}

/** Everything waiting on the person: terminals, agent chats, teammate runs and
 * iPhones asking to connect. Counted once for the sidebar badge and Home. */
export function useNeedsYouTotal(): number {
  const terminals = useNeedsYou().length + useChatNeeds().length;
  const teammates = useTeammateNeeds((s) => s.items.length);
  const phones = usePhoneStore((s) => s.status?.pending.length ?? 0);
  return terminals + teammates + phones;
}

/** Terminals producing output right now. */
export function useWorkingCount(projectId?: string): number {
  return useTerminalStore((state) => state.panes.filter((pane) => pane.status === "running"
    && state.activity[pane.id] === "working" && (!projectId || pane.projectId === projectId)).length);
}

/** Clear a waiting terminal from Needs you: its prompt counts as answered
 * until it prints a new one. */
export function clearTerminal(pane: PaneState): void {
  clearAttention(pane.id);
  useTerminalStore.setState((s) => ({ activity: { ...s.activity, [pane.id]: "idle" } }));
}

/** Opens the project that holds `pane` and focuses it. */
export async function openPane(pane: PaneState): Promise<void> {
  if (pane.projectId) await useProjectStore.getState().activate(pane.projectId);
  useTerminalStore.getState().setFocus(pane.id);
}

export function openNeedsYou(): void {
  useProductMode.getState().choose("work");
  useProjectStore.setState({ view: "needs-you" });
}

/** The last line a waiting terminal shows with its frame left out, which is
 * usually the question. Null when its xterm is not mounted this run. */
export function waitingLine(id: number): string | null {
  const buffer = getTerminal(id)?.term.buffer.active;
  if (!buffer) return null;
  for (let row = buffer.length - 1; row >= Math.max(0, buffer.length - 60); row -= 1) {
    const line = buffer.getLine(row)?.translateToString(true).trim() ?? "";
    if (line && !isChrome(line)) return line;
  }
  return null;
}

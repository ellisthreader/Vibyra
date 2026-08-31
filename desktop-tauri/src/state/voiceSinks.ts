import { writeTerminal } from "../ipc/terminal";
import { notePromptInput } from "../lib/terminalChatTitleSource";
import { useAskStore } from "./askStore";
import { useProjectStore } from "./projectStore";
import { useTerminalStore } from "./terminalStore";

// Where a transcript goes. One recorder exists — `state.voice` in the backend
// is a single slot — so dictation cannot be two independent features. Both
// destinations run through the same phase machine in `voiceStore`, and this
// module is the only part that differs between them.

export type VoiceSink = "terminal" | "ask";

export type SinkResult =
  | { ok: true; title: string; sub: string }
  | { ok: false; message: string };

/** The destination, checked before the microphone opens. */
export function resolveSink(sink: VoiceSink): SinkResult & { targetId?: number } {
  if (sink === "ask") {
    const projectId = useProjectStore.getState().activeId;
    if (!projectId) return { ok: false, message: "Open a project first" };
    return { ok: true, title: "Ask Vibyra", sub: "" };
  }
  const { panes, focusedId } = useTerminalStore.getState();
  const target =
    panes.find((pane) => pane.id === focusedId && pane.status === "running") ??
    panes.find((pane) => pane.status === "running" && pane.visibility !== "hibernated");
  if (!target) return { ok: false, message: "Open a terminal first" };
  return { ok: true, targetId: target.id, title: target.title, sub: "" };
}

/** Hands the finished transcript to its destination. */
export async function deliverTranscript(
  sink: VoiceSink,
  targetId: number | null,
  text: string,
): Promise<SinkResult> {
  if (sink === "ask") {
    const projectId = useProjectStore.getState().activeId;
    if (!projectId) return { ok: false, message: "The project was closed" };
    // Not awaited: the Ask panel renders the thinking and speaking states
    // itself, and the HUD has no business staying up for the whole answer.
    void useAskStore.getState().send(projectId, text);
    return { ok: true, title: "Asked Vibyra", sub: text };
  }

  const pane = useTerminalStore.getState().panes.find((p) => p.id === targetId);
  if (!pane || pane.status !== "running" || targetId === null) {
    return { ok: false, message: "The target terminal was closed" };
  }
  const submitted = `${text}\r`;
  // Dictation goes straight to the PTY, so the pane would never see this
  // prompt in what was typed into it.
  notePromptInput(targetId, submitted);
  await writeTerminal(targetId, submitted);
  return { ok: true, title: "Sent to terminal", sub: pane.title };
}

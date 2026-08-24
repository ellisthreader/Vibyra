import { agentChatPrompt } from "../ipc/terminal";
import { useTerminalStore } from "../state/terminalStore";
import {
  asksForChatTitle,
  awaitsChatTitle,
  observeTerminalPrompt,
  titleFromPrompt,
} from "./terminalChatTitle.ts";

// Where a pane's chat-aware name comes from, in order of how much it can be
// trusted:
//
//   1. The agent's own transcript, when it keeps one Vibyra can read. This is
//      what the user actually submitted, however they submitted it.
//   2. What was typed into the pane, for agents that keep no such transcript.
//      A guess: it cannot see a dictated prompt, and it sees TUI navigation it
//      cannot tell apart from a prompt.
//
// Claude needs neither — it publishes its own chat title over OSC.

const POLL_MS = 5_000;

/** How long a pane may go without a readable transcript before we stop asking. */
const MAX_MISSES = 12;

const readable = new Set<number>();
const misses = new Map<number, number>();
let timer: ReturnType<typeof setInterval> | null = null;

/** The keystroke fallback, used only where nothing better is available. */
export function notePromptInput(id: number, data: string): void {
  const store = useTerminalStore.getState();
  const pane = store.panes.find((candidate) => candidate.id === id);
  if (!pane || readable.has(id) || !awaitsChatTitle(pane)) return;
  const title = observeTerminalPrompt(id, data);
  if (title) store.setChatTitle(id, title);
}

async function readTranscript(id: number): Promise<void> {
  const prompt = await agentChatPrompt(id).catch(() => null);
  if (prompt === null) {
    misses.set(id, (misses.get(id) ?? 0) + 1);
    return;
  }
  readable.add(id);
  misses.delete(id);
  const title = titleFromPrompt(prompt);
  // Replaces a keystroke guess: this is the prompt, not an impression of it.
  if (title) useTerminalStore.getState().setChatTitle(id, title, true);
}

async function sweep(): Promise<void> {
  const { panes } = useTerminalStore.getState();
  const live = new Set(panes.map((pane) => pane.id));
  for (const id of readable) if (!live.has(id)) readable.delete(id);
  for (const id of misses.keys()) if (!live.has(id)) misses.delete(id);

  const asking = panes.filter((pane) =>
    asksForChatTitle(pane, readable.has(pane.id))
    && (misses.get(pane.id) ?? 0) < MAX_MISSES);
  await Promise.all(asking.map((pane) => readTranscript(pane.id)));
}

/**
 * Names panes after their conversation for as long as the workspace is up.
 *
 * Swept rather than event-driven because nothing announces a submitted prompt:
 * the transcript simply grows. Only panes still waiting for a name are asked,
 * so a titled workspace costs nothing.
 */
export function startChatTitleSource(): () => void {
  void sweep().catch(() => {});
  timer = setInterval(() => void sweep().catch(() => {}), POLL_MS);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    readable.clear();
    misses.clear();
  };
}

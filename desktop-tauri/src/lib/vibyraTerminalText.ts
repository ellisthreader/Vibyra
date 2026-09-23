import { chatRequest, type ConversationSnapshot } from "../ipc/sharedChats";
import { terminalSnapshot } from "../ipc/terminal";
import { getTerminal } from "./terminalRegistry";
import type { VibyraTerminal } from "./vibyraSessions";
import { isChrome, plainText } from "./terminalPlainText.ts";

// What a terminal is showing, as text a model can read. The first build sent
// the raw PTY bytes: colour codes, cursor moves and a status line redrawn a
// hundred times, from which the model concluded a busy Claude session was
// "guiding you through the workspace". The xterm buffer is exactly what is on
// screen, so it is read first; the bytes are only the fallback, cleaned.

const READ_TAIL_BYTES = 256 * 1024;

/** The last rows of a mounted xterm's buffer — exactly what it drew — with
 * blank rows dropped. Null when the pane has no xterm (hibernated, or in a
 * project that has not been opened this run). */
function fromXterm(id: number, lines: number): string | null {
  const entry = getTerminal(id);
  if (!entry) return null;
  const buffer = entry.term.buffer.active;
  const out: string[] = [];
  for (let row = Math.max(0, buffer.length - lines * 3); row < buffer.length; row += 1) {
    out.push(buffer.getLine(row)?.translateToString(true) ?? "");
  }
  const text = out.filter((entry) => entry.trim()).join("\n");
  return text || null;
}

function fromConversation(snapshot: ConversationSnapshot): string {
  return snapshot.items
    .map((item) => {
      if (item.kind === "message") return `${item.role === "user" ? "Asked" : "Replied"}: ${item.text ?? ""}`;
      if (item.kind === "activity") return `Step (${item.status}): ${item.title ?? item.command ?? ""}`;
      if (item.kind === "permission" || item.kind === "question") return `Waiting for the person: ${item.title ?? item.detail ?? item.questions?.[0]?.question ?? ""}`;
      if (item.kind === "result") return `Finished: ${item.text ?? item.title ?? ""}`;
      return "";
    })
    .filter((line) => line.trim())
    .join("\n");
}

/** The last `lines` lines a person would see in this terminal, frame removed. */
export async function screenText(terminal: VibyraTerminal, lines: number): Promise<string> {
  if (terminal.kind === "chat") {
    const snapshot = await chatRequest<ConversationSnapshot>("conversation.snapshot", { sessionId: terminal.session.id });
    return fromConversation(snapshot).split("\n").slice(-lines).join("\n");
  }
  const { pane } = terminal;
  const text = fromXterm(pane.id, lines + 8)
    ?? plainText(pane.status === "suspended" ? pane.snapshot ?? "" : await terminalSnapshot(pane.id, READ_TAIL_BYTES));
  return text.split("\n").filter((line) => !isChrome(line)).slice(-lines).join("\n");
}

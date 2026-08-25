import { writeTerminal } from "../ipc/terminal";
import type { AgentPromptOffer, AgentPromptOption } from "../notificationTypes";
import { clearAttention } from "./activity";
import { parseAgentPrompt } from "./agentPrompt";
import { getTerminal } from "./terminalRegistry";

// The impure half of prompt reading: the xterm buffer goes in here, plain
// lines come out, and `agentPrompt` decides what they mean. This is also the
// only place a toast can reach the PTY, so the staleness guard lives here
// rather than in the component that draws the button.

/** Rows read off the bottom of a pane. Wrapped rows fold into one logical
 * line, so this is a generous ceiling on a ~24-line prompt block. */
const SCAN_ROWS = 48;

export type PromptAnswer = "sent" | "stale" | "gone";

/** The tail of a pane as logical lines, wrapped rows folded back together. */
function tailLines(id: number): string[] | null {
  const entry = getTerminal(id);
  if (!entry) return null;
  const { term } = entry;
  const buffer = term.buffer.active;
  const bottom = buffer.baseY + term.rows - 1;
  const top = Math.max(0, bottom - SCAN_ROWS + 1);
  const lines: string[] = [];
  for (let row = top; row <= bottom; row += 1) {
    const line = buffer.getLine(row);
    if (!line) continue;
    const text = line.translateToString(true);
    if (line.isWrapped && lines.length > 0) lines[lines.length - 1] += text;
    else lines.push(text);
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines;
}

/**
 * Reads whatever a pane is currently asking.
 *
 * Called once per attention edge — after the ticker has already seen 2.5s of
 * silence — never per output batch. A build log costs nothing here.
 */
export function scanAgentPrompt(id: number): AgentPromptOffer | null {
  const lines = tailLines(id);
  return lines ? parseAgentPrompt(lines, id) : null;
}

/**
 * Answers a prompt from a toast — but only the prompt that was actually read.
 *
 * The pane is re-read first and the digest compared. Between the toast being
 * drawn and the button being clicked the agent may have redrawn, timed out, or
 * been answered in the terminal, and by then "1" no longer means what the
 * button said it did. A refused click costs a trip to the pane; an unchecked
 * one answers a question nobody showed the user.
 */
export function answerAgentPrompt(
  offer: AgentPromptOffer,
  option: AgentPromptOption,
): PromptAnswer {
  const current = scanAgentPrompt(offer.sessionId);
  if (!current) return getTerminal(offer.sessionId) ? "stale" : "gone";
  if (current.fingerprint !== offer.fingerprint) return "stale";
  // xterm's own onData does this for typed input; a synthetic answer never
  // passes through it, so the pane would stay in `attention` until the agent
  // replied and re-armed the notice we are dismissing.
  clearAttention(offer.sessionId);
  const keys = option.submit ? `${option.key}\r` : option.key;
  void writeTerminal(offer.sessionId, keys).catch(() => {});
  return "sent";
}

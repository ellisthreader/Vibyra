// Per-session activity tracking, kept OUTSIDE React state so the high-rate
// output flushes never trigger renders. A slow ticker derives the coarse
// state (working / idle / attention) into the terminal store when it changes.

export type ActivityState = "working" | "idle" | "attention";

interface SessionStats {
  lastOutputAt: number;
  /** A prompt-looking tail was seen at this time; becomes attention if the
      terminal then stays quiet. */
  promptCandidateAt: number | null;
  attention: boolean;
}

const stats = new Map<number, SessionStats>();

const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
// A HINT, not a verdict. When the pane then goes quiet, the attention edge
// re-reads the buffer (`scanAgentPrompt`) and only a parsed prompt block may
// say "needs you" — so a loose match here costs one buffer walk, never a
// wrong toast. `❯\s*$` is deliberately absent: that is the empty composer
// every agent TUI settles on after finishing, the exact opposite of an ask.
const PROMPT_PATTERN =
  /(\[y\/n\]|\(y\/n\)|yes\/no|do you want|allow |approve|permission|continue\?|proceed\?|password:|passphrase|\?\s*$|1\.\s*yes)/i;

function entry(id: number): SessionStats {
  let s = stats.get(id);
  if (!s) {
    s = { lastOutputAt: 0, promptCandidateAt: null, attention: false };
    stats.set(id, s);
  }
  return s;
}

/** Called by the terminal registry on every output batch. Only the tail of
 * the chunk matters for prompt detection, so large batches are sliced before
 * the ANSI strip — never regex-scan a whole build log. */
export function stampOutput(id: number, chunk: string): void {
  const s = entry(id);
  const now = Date.now();
  s.lastOutputAt = now;
  s.attention = false;
  const raw = chunk.length > 2048 ? chunk.slice(-2048) : chunk;
  const tail = raw.replace(ANSI_PATTERN, "").trimEnd().slice(-220);
  s.promptCandidateAt = PROMPT_PATTERN.test(tail) ? now : null;
}

/** Bell = the program explicitly asked for attention. */
export function stampBell(id: number): void {
  entry(id).attention = true;
}

/** Whether this pane's attention came from the bell — an explicit program
 * signal — rather than from the prompt-looking-tail heuristic. The edge
 * verdict trusts a bell even when no prompt block parses. */
export function attentionFromBell(id: number): boolean {
  return stats.get(id)?.attention ?? false;
}

/** The edge verdict found no real prompt behind a heuristic candidate: take
 * the candidate back so the pane falls out of `attention` on the next tick,
 * instead of wearing a "needs you" dot for a question nobody asked. The bell
 * flag is deliberately left alone — only the guess is withdrawn. */
export function demotePromptAttention(id: number): void {
  const s = stats.get(id);
  if (s) s.promptCandidateAt = null;
}

/** User typed or focused the terminal — attention is acknowledged. */
export function clearAttention(id: number): void {
  const s = stats.get(id);
  if (s) {
    s.attention = false;
    s.promptCandidateAt = null;
  }
}

export function dropStats(id: number): void {
  stats.delete(id);
}

/** When the most recent output landed, across every session. The session
 * snapshot heartbeat uses this to skip rewriting an unchanged multi-megabyte
 * session.json while everything is quiet. */
export function latestOutputAt(): number {
  let latest = 0;
  for (const s of stats.values()) {
    if (s.lastOutputAt > latest) latest = s.lastOutputAt;
  }
  return latest;
}

const WORKING_WINDOW_MS = 5_000;
const PROMPT_QUIET_MS = 2_500;

export function activityFor(id: number): ActivityState {
  const s = stats.get(id);
  if (!s || s.lastOutputAt === 0) return "idle";
  const now = Date.now();
  if (s.attention) return "attention";
  if (s.promptCandidateAt !== null && now - s.promptCandidateAt > PROMPT_QUIET_MS) {
    return "attention";
  }
  return now - s.lastOutputAt < WORKING_WINDOW_MS ? "working" : "idle";
}

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
const PROMPT_PATTERN =
  /(\[y\/n\]|\(y\/n\)|yes\/no|do you want|allow |approve|permission|continue\?|proceed\?|password:|passphrase|\?\s*$|❯\s*$|1\.\s*yes)/i;

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

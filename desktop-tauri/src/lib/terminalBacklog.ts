import type { TermEvent } from "../types";

// What `terminalBus.ts` holds for a session no terminal is listening to yet —
// typically a pane spawned into a project nobody has opened, whose agent can
// print for hours before anything mounts it. Kept free of imports so the
// rules below can be tested directly.

export interface Backlog {
  events: TermEvent[];
  /** Characters of output held, so the cap costs nothing to check. */
  chars: number;
}

/**
 * Past this much held output the backlog collapses into one resync. Replaying
 * it all at once on attach would stall the frame, and xterm throws on writes
 * once 50 MB is pending, which would abandon the replay halfway.
 */
const BACKLOG_CAP = 8 * 1024 * 1024;

/** What a collapsed backlog keeps: Rust's scrollback ring is 4 MiB, so the pane
 * shows about what a resync from Rust would after its own pending overflow. */
const BACKLOG_TAIL = 4 * 1024 * 1024;

export function emptyBacklog(): Backlog {
  return { events: [], chars: 0 };
}

/** The last `keep` characters of `text`, never starting on half a surrogate pair. */
function tailOf(text: string, keep: number): string {
  const tail = text.length > keep ? text.slice(text.length - keep) : text;
  const first = tail.charCodeAt(0);
  return first >= 0xdc00 && first <= 0xdfff ? tail.slice(1) : tail;
}

/**
 * Adds `event` to `backlog` (appending in place) and returns the backlog to
 * keep. Output ahead of a resync is dropped: the resync handler starts the
 * view over from its snapshot, and because xterm resets at once but parses
 * queued writes later, replaying that output would draw it twice. Exits are
 * always kept — they carry the pane's lifecycle.
 */
export function queueEvent(
  backlog: Backlog,
  event: TermEvent,
  cap = BACKLOG_CAP,
  keep = BACKLOG_TAIL,
): Backlog {
  if (event.type === "exit") {
    backlog.events.push(event);
    return backlog;
  }
  if (event.type === "resync") return { events: [...exitsIn(backlog), event], chars: event.data.length };
  const chars = backlog.chars + event.data.length;
  if (chars <= cap) {
    backlog.events.push(event);
    backlog.chars = chars;
    return backlog;
  }
  // Too much to replay: start over from the tail, exactly as a resync would.
  const text = backlog.events.map((queued) => (queued.type === "exit" ? "" : queued.data)).join("");
  const data = tailOf(text + event.data, keep);
  return { events: [{ type: "resync", data }, ...exitsIn(backlog)], chars: data.length };
}

function exitsIn(backlog: Backlog): TermEvent[] {
  return backlog.events.filter((queued) => queued.type === "exit");
}

import type { Terminal } from "@xterm/xterm";

// What a resumed pane shows above its new process's output.
//
// A resumed pane is a *new* Rust session: its scrollback ring starts empty, so
// nothing replays it the way hibernation does. The output the user was reading
// comes from session.json instead, and has to be written into the terminal at
// the one moment that terminal exists and has not yet been wired to the bus.
// Holding it here rather than on the pane keeps it out of React state, and
// makes "exactly once" a property of the queue instead of a rule every caller
// has to remember.

const pending = new Map<number, string>();

/** Separates what the previous run left on screen from the new one's output. */
const RESUMED_RULE = "\r\n\x1b[2m── resumed ──\x1b[0m\r\n";

/** Keyed by the **new** session id, set before the pane reaches the store. */
export function queueReplay(id: number, snapshot: string): void {
  pending.set(id, snapshot);
}

/**
 * Writes any queued output into `term` and forgets it, so a remount or a
 * hibernation wake — both of which can create a terminal for the same id —
 * never shows it twice.
 */
export function takeReplay(id: number, term: Terminal): void {
  const snapshot = pending.get(id);
  if (snapshot === undefined) return;
  pending.delete(id);
  // The snapshot is a tail of a raw ANSI stream, so it can begin mid escape
  // sequence; resetting first stops a severed sequence bleeding into
  // everything the resumed process draws below it.
  term.reset();
  term.write(snapshot);
  term.write(RESUMED_RULE);
}

/** Drops a replay whose pane was closed before its terminal ever mounted. */
export function dropReplay(id: number): void {
  pending.delete(id);
}

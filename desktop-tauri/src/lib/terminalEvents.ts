import type { Terminal } from "@xterm/xterm";

import { holdTerminalOutput } from "../ipc/terminal";
import type { TermEvent } from "../types";
import { stampOutput } from "./activity";
import { terminalViewportIsNearBottom } from "./terminalBottomAnchor";
import { attach, setExitHandler } from "./terminalBus";
import { outputFlow } from "./terminalFlow";

// Everything Rust sends about a session, turned into writes on its terminal.
//
// Split from the registry, which owns the xterm instances themselves: this is
// only the routing, and it is the half that the workspace hooks into.

let onSessionTitle: (id: number, title: string) => void = () => {};

export function setSessionExitHandler(handler: (id: number, code: number | null) => void): void {
  setExitHandler(handler);
}

export function setSessionTitleHandler(handler: (id: number, title: string) => void): void {
  onSessionTitle = handler;
}

/** The escape sequence a program uses to name its own tab. */
export function sessionTitleChanged(id: number, title: string): void {
  onSessionTitle(id, title);
}

/**
 * Routes this session's events into `term`.
 *
 * Called last during a mount: the bus replays whatever arrived before a
 * handler existed, so anything that must appear *above* live output — a
 * resumed pane's saved scrollback — has to be written before this.
 */
export function attachSessionEvents(
  id: number,
  term: Terminal,
  anchorNow: (followOutput?: boolean) => void,
): void {
  const flow = outputFlow((hold) => void holdTerminalOutput(id, hold).catch(() => {}));
  attach(id, (event: TermEvent) => {
    if (event.type === "output") {
      stampOutput(id, event.data);
      const followOutput = terminalViewportIsNearBottom(term);
      const parsed = flow.written(event.data.length);
      term.write(event.data, () => { parsed(); anchorNow(followOutput); });
    } else if (event.type === "resync") {
      // Rust sends this when a hibernated session wakes or overflows: the view
      // is rebuilt from its ring rather than caught up incrementally.
      // The reset travels in band (RIS, ESC c — the same full reset): a
      // `term.reset()` call runs at once while output xterm has queued but
      // not parsed still lands after it, drawing that output ahead of the
      // snapshot that already contains it.
      stampOutput(id, event.data);
      term.write("\x1bc");
      const parsed = flow.written(event.data.length);
      term.write(event.data, () => { parsed(); anchorNow(true); });
    } else {
      const label = event.code === null ? "" : ` (code ${event.code})`;
      term.write(`\r\n\x1b[2m[process exited${label}]\x1b[0m\r\n`, () => anchorNow(true));
      term.options.disableStdin = true;
    }
  });
}

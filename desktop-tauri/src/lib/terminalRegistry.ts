import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

import { resizeTerminal, writeTerminal } from "../ipc/terminal";
import type { Settings, TermEvent } from "../types";
import { clearAttention, stampBell, stampOutput } from "./activity";
import { attach, clear, detach } from "./terminalBus";
import {
  applyTerminalBottomAnchor,
  createBottomAnchorState,
  measureTerminalCellHeight,
  terminalViewportIsNearBottom,
  type BottomAnchorState,
} from "./terminalBottomAnchor";
import { attachRenderer } from "./xtermRenderer";
import { themeFor } from "./xtermTheme";

// xterm instances live here, outside the React tree, keyed by session id;
// React panes only mount/unmount the host element, so remounts never destroy
// terminal state. Only hibernation disposes one — Rust replays on wake.

export interface TerminalEntry {
  term: Terminal;
  fit: FitAddon;
  container: HTMLDivElement;
  anchor: BottomAnchorState;
}

const entries = new Map<number, TerminalEntry>();

/** Puts the bundled JetBrains Mono variable font ahead of the user's stack. */
function monoStack(userStack: string): string {
  return `"JetBrains Mono Variable", ${userStack}`;
}

let onSessionExit: (id: number, code: number | null) => void = () => {};
let onSessionTitle: (id: number, title: string) => void = () => {};

export function setSessionExitHandler(handler: (id: number, code: number | null) => void): void {
  onSessionExit = handler;
}

export function setSessionTitleHandler(handler: (id: number, title: string) => void): void {
  onSessionTitle = handler;
}

/** Fits the grid to the host and refreshes the cached cell height. */
export function fitTerminal(entry: TerminalEntry): void {
  const rect = entry.container.getBoundingClientRect();
  if (rect.width <= 80 || rect.height <= 60) return;
  entry.fit.fit();
  entry.anchor.cellHeight = measureTerminalCellHeight(entry.term);
}

/** Rendered cell size from any live terminal, for pre-spawn size estimates. */
export function measuredCellSize(): { width: number; height: number } | null {
  for (const entry of entries.values()) {
    const { term } = entry;
    const screen = term.element?.querySelector<HTMLElement>(".xterm-screen");
    const rect = screen?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0 && term.cols > 0 && term.rows > 0) {
      return { width: rect.width / term.cols, height: rect.height / term.rows };
    }
  }
  return null;
}

/**
 * Returns the live terminal for `id`, creating it inside `host` (which must
 * be attached to the document) if needed. The terminal is fitted before
 * buffered output replays, so replays never wrap at a stale width.
 */
export function mountTerminal(
  id: number,
  settings: Settings,
  host: HTMLElement,
  bottomAnchored = true,
): TerminalEntry {
  const existing = entries.get(id);
  if (existing) {
    existing.anchor.enabled = bottomAnchored;
    host.appendChild(existing.container);
    fitTerminal(existing);
    applyTerminalBottomAnchor(existing.term, existing.anchor);
    return existing;
  }

  const container = document.createElement("div");
  container.className = "term-host";
  host.appendChild(container);

  const term = new Terminal({
    cursorBlink: false,
    fontSize: settings.fontSize,
    fontFamily: monoStack(settings.fontFamily),
    scrollback: settings.scrollbackLines,
    scrollOnUserInput: false,
    theme: themeFor(settings.theme),
    allowProposedApi: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());
  term.open(container);
  attachRenderer(term);

  const entry: TerminalEntry = {
    term,
    fit,
    container,
    anchor: createBottomAnchorState(bottomAnchored),
  };

  // Guards the onScroll handler against re-entry while the write callback is
  // already anchoring (scrollToBottom fires onScroll synchronously).
  let anchoring = false;
  const anchorNow = (followOutput = false) => {
    anchoring = true;
    applyTerminalBottomAnchor(term, entry.anchor, followOutput);
    anchoring = false;
  };

  term.onData((data) => {
    clearAttention(id);
    anchorNow();
    void writeTerminal(id, data).catch(() => {});
  });
  term.onResize(({ rows, cols }) => void resizeTerminal(id, rows, cols).catch(() => {}));
  term.onScroll(() => {
    if (!anchoring) anchorNow();
  });
  term.onTitleChange((title) => onSessionTitle(id, title));
  term.onBell(() => stampBell(id));

  // Fit after the handlers are live and before the bus attaches: this is the
  // fit that moves off xterm's 80x24 default, so any earlier and its onResize
  // fires into the void, any later and replayed output wraps at a stale
  // width. Then hand the PTY the grid the renderer actually built — onResize
  // cannot carry it alone, because FitAddon skips term.resize() whenever the
  // pre-spawn estimate already matched, leaving the PTY on that estimate. A
  // PTY wider than the pane wraps every line the CLI draws, which is what
  // sheared the bottom row of a 2x2 grid until some later layout change
  // happened to refit it.
  fitTerminal(entry);
  void resizeTerminal(id, term.rows, term.cols).catch(() => {});

  attach(id, (event: TermEvent) => {
    if (event.type === "output") {
      stampOutput(id, event.data);
      const followOutput = terminalViewportIsNearBottom(term);
      term.write(event.data, () => anchorNow(followOutput));
    } else if (event.type === "resync") {
      stampOutput(id, event.data);
      term.reset();
      term.write(event.data, () => anchorNow(true));
    } else {
      const label = event.code === null ? "" : ` (code ${event.code})`;
      term.write(`\r\n\x1b[2m[process exited${label}]\x1b[0m\r\n`, () => anchorNow(true));
      onSessionExit(id, event.code);
    }
  });

  entries.set(id, entry);
  return entry;
}

export function getTerminal(id: number): TerminalEntry | undefined {
  return entries.get(id);
}

/** Frees the xterm instance (hibernation) but keeps the session routable. */
export function disposeTerminal(id: number): void {
  const entry = entries.get(id);
  if (!entry) return;
  entries.delete(id);
  detach(id);
  entry.term.dispose();
  entry.container.remove();
}

/** Full teardown when a session is closed for good. */
export function destroySession(id: number): void {
  disposeTerminal(id);
  clear(id);
}

/** Live-applies appearance settings to every open terminal. */
export function applySettingsToAll(settings: Settings): void {
  for (const entry of entries.values()) {
    const { term } = entry;
    term.options.fontSize = settings.fontSize;
    term.options.fontFamily = monoStack(settings.fontFamily);
    term.options.scrollback = settings.scrollbackLines;
    term.options.theme = themeFor(settings.theme);
    fitTerminal(entry);
    applyTerminalBottomAnchor(term, entry.anchor, terminalViewportIsNearBottom(term));
  }
}

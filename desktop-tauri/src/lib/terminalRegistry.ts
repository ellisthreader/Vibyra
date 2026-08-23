import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

import { resizeTerminal, writeTerminal } from "../ipc/terminal";
import type { Settings } from "../types";
import { clearAttention, stampBell } from "./activity";
import { clear, detach } from "./terminalBus";
import { clearTerminalPrompt } from "./terminalChatTitle";
import { attachSessionEvents, sessionInputReceived, sessionTitleChanged } from "./terminalEvents";
import { dropReplay, takeReplay } from "./terminalReplay";
import {
  applyTerminalBottomAnchor,
  createBottomAnchorState,
  measureTerminalCellHeight,
  terminalViewportIsNearBottom,
  type BottomAnchorState,
} from "./terminalBottomAnchor";
import { attachTerminalClipboard } from "./terminalClipboard";
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
  anchorNow: (followOutput?: boolean) => void;
}

const entries = new Map<number, TerminalEntry>();

/** Puts the bundled JetBrains Mono variable font ahead of the user's stack. */
function monoStack(userStack: string): string {
  return `"JetBrains Mono Variable", ${userStack}`;
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
    attachSessionEvents(id, existing.term, existing.anchorNow);
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
  attachTerminalClipboard(term);

  // Guards the onScroll handler against re-entry while the write callback is
  // already anchoring (scrollToBottom fires onScroll synchronously).
  let anchoring = false;
  const anchor = createBottomAnchorState(bottomAnchored);
  const anchorNow = (followOutput = false): void => {
    anchoring = true;
    applyTerminalBottomAnchor(term, anchor, followOutput);
    anchoring = false;
  };
  const entry: TerminalEntry = { term, fit, container, anchor, anchorNow };

  term.onData((data) => {
    clearAttention(id);
    anchorNow();
    sessionInputReceived(id, data);
    void writeTerminal(id, data).catch(() => {});
  });
  term.onResize(({ rows, cols }) => void resizeTerminal(id, rows, cols).catch(() => {}));
  term.onScroll(() => {
    if (!anchoring) anchorNow();
  });
  term.onTitleChange((title) => sessionTitleChanged(id, title));
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

  // After the fit so it wraps at the real width, before the bus attaches so
  // the new session's own output lands underneath it rather than above.
  takeReplay(id, term);

  attachSessionEvents(id, term, anchorNow);

  entries.set(id, entry);
  return entry;
}

export function getTerminal(id: number): TerminalEntry | undefined {
  return entries.get(id);
}

/** Detaches rendering while preserving the xterm instance and its scrollback. */
export function unmountTerminal(id: number): void {
  const entry = entries.get(id);
  if (!entry) return;
  detach(id);
  entry.container.remove();
}

/** Frees the xterm instance (hibernation) but keeps the session routable. */
export function disposeTerminal(id: number): void {
  const entry = entries.get(id);
  if (!entry) return;
  entries.delete(id);
  clearTerminalPrompt(id);
  detach(id);
  entry.term.dispose();
  entry.container.remove();
}

/** Full teardown when a session is closed for good. */
export function destroySession(id: number): void {
  // A pane closed before its terminal ever mounted would otherwise leave its
  // replay behind, to be shown by whichever session inherits the id.
  dropReplay(id);
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

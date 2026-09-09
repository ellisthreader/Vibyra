import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

import { resizeTerminal, writeTerminal } from "../ipc/terminal";
import type { Settings } from "../types";
import { clearAttention, stampBell } from "./activity";
import { attachSessionEvents, sessionTitleChanged } from "./terminalEvents";
import { takeReplay } from "./terminalReplay";
import {
  applyTerminalBottomAnchor,
  createBottomAnchorState,
  measureTerminalCellHeight,
  type BottomAnchorState,
} from "./terminalBottomAnchor";
import { attachTerminalClipboard } from "./terminalClipboard";
import { terminalFont } from "./terminalFont";
import { attachRenderer } from "./xtermRenderer";
import { themeFor } from "./xtermTheme";

// One live xterm and the wiring it needs. `terminalRegistry.ts` owns the map
// of these, keyed by session; nothing here knows about the other panes.

export interface TerminalEntry {
  term: Terminal;
  fit: FitAddon;
  container: HTMLDivElement;
  anchor: BottomAnchorState;
}

/** Fits the grid to the host and refreshes the cached cell height. */
export function fitTerminal(entry: TerminalEntry): void {
  const rect = entry.container.getBoundingClientRect();
  if (rect.width <= 80 || rect.height <= 60) return;
  entry.fit.fit();
  entry.anchor.cellHeight = measureTerminalCellHeight(entry.term);
}

export function createTerminalEntry(
  id: number,
  settings: Settings,
  host: HTMLElement,
  bottomAnchored: boolean,
  fontSize: number,
): TerminalEntry {
  const container = document.createElement("div");
  container.className = "term-host";
  host.appendChild(container);

  const term = new Terminal({
    cursorBlink: false,
    fontSize,
    fontFamily: terminalFont(settings.fontFamily),
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
  return entry;
}

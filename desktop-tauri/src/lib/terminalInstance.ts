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
  renderedCellHeight,
  type BottomAnchorState,
} from "./terminalBottomAnchor";
import { attachTerminalClipboard } from "./terminalClipboard";
import { terminalFont } from "./terminalFont";
import { attachRenderer, type ReleaseRenderer } from "./xtermRenderer";
import { themeFor } from "./xtermTheme";

// One live xterm and the wiring it needs. `terminalRegistry.ts` owns the map
// of these, keyed by session; nothing here knows about the other panes.

export interface TerminalEntry {
  id: number;
  term: Terminal;
  fit: FitAddon;
  container: HTMLDivElement;
  anchor: BottomAnchorState;
  /** Frees the renderer's GPU context; called after `term.dispose()`. */
  releaseRenderer: ReleaseRenderer;
  /** Whether the PTY has been handed a grid this terminal actually fitted. */
  ptySized: boolean;
}

/** Fits the grid to the host and refreshes the cached cell height. False
 * while there is nothing to fit to: a host that is display:none or detached,
 * or a renderer that has not measured a cell yet.
 *
 * The single place local fitting happens. This Mac alone sizes its panes: a
 * phone watching one draws this grid at its own zoom and never asks for a
 * width, so nothing here ever has to yield to a remote viewer.
 *
 * The first fit that succeeds hands the PTY the grid the renderer built.
 * onResize cannot carry it alone, because FitAddon skips term.resize()
 * whenever the pre-spawn estimate already matched, leaving the PTY on that
 * estimate. A PTY wider than the pane wraps every line the CLI draws, which is
 * what sheared the bottom row of a 2x2 grid until some later layout change
 * happened to refit it. Before that fit the PTY keeps the estimate: the grid
 * an unfitted terminal reports is xterm's 80x24 default, which the CLI would
 * draw once and then redraw. */
export function fitTerminal(entry: TerminalEntry): boolean {
  const rect = entry.container.getBoundingClientRect();
  if (rect.width <= 80 || rect.height <= 60) return false;
  entry.fit.fit();
  entry.anchor.cellHeight = renderedCellHeight(entry.term);
  if (entry.anchor.cellHeight <= 0) return false;
  if (!entry.ptySized) {
    entry.ptySized = true;
    void resizeTerminal(entry.id, entry.term.rows, entry.term.cols).catch(() => {});
  }
  return true;
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
  const releaseRenderer = attachRenderer(term);
  attachTerminalClipboard(term, () => {
    clearAttention(id);
    void writeTerminal(id, "\u001b[Z").catch(() => {});
  });

  const entry: TerminalEntry = {
    id,
    term,
    fit,
    container,
    anchor: createBottomAnchorState(bottomAnchored),
    releaseRenderer,
    ptySized: false,
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
  term.onResize(({ rows, cols }) => {
    void resizeTerminal(id, rows, cols).catch(() => {});
  });
  term.onScroll(() => {
    if (!anchoring) anchorNow();
  });
  term.onTitleChange((title) => sessionTitleChanged(id, title));
  term.onBell(() => stampBell(id));

  // Fit after the handlers are live and before the bus attaches: this is the
  // fit that moves off xterm's 80x24 default, so any earlier and its onResize
  // fires into the void, any later and replayed output wraps at a stale
  // width. It also hands the PTY the grid the renderer actually built — see
  // `fitTerminal` — or, for a pane mounted hidden, leaves that to the first
  // fit that can see the pane.
  fitTerminal(entry);

  // After the fit so it wraps at the real width, before the bus attaches so
  // the new session's own output lands underneath it rather than above.
  takeReplay(id, term);

  attachSessionEvents(id, term, anchorNow);
  return entry;
}

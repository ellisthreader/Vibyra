import { terminalFont } from "./terminalFont";

import type { Settings } from "../types";
import { clear, detach } from "./terminalBus";
import { dropReplay } from "./terminalReplay";
import {
  applyTerminalBottomAnchor,
  terminalViewportIsNearBottom,
} from "./terminalBottomAnchor";
import { createTerminalEntry, fitTerminal, type TerminalEntry } from "./terminalInstance";
import { themeFor } from "./xtermTheme";

// xterm instances live here, outside the React tree, keyed by session id;
// React panes only mount/unmount the host element, so remounts never destroy
// terminal state. Only hibernation disposes one — Rust replays on wake.
// `terminalInstance.ts` owns what one of them is made of.

export { fitTerminal, type TerminalEntry };

const entries = new Map<number, TerminalEntry>();

/**
 * Rendered cell size from any live terminal, for pre-spawn size estimates and
 * for the grid layout. It reports the font it measured at: a crowded grid
 * renders below the configured size, and a caller that read those cells as the
 * base ones would shrink again on every pass.
 */
export function measuredCellSize(): { width: number; height: number; fontSize: number } | null {
  for (const entry of entries.values()) {
    const { term } = entry;
    const screen = term.element?.querySelector<HTMLElement>(".xterm-screen");
    const rect = screen?.getBoundingClientRect();
    const fontSize = term.options.fontSize;
    if (rect && rect.width > 0 && rect.height > 0 && term.cols > 0 && term.rows > 0 && fontSize) {
      return { width: rect.width / term.cols, height: rect.height / term.rows, fontSize };
    }
  }
  return null;
}

/**
 * Applies the font size the grid layout chose. The layout owns it, so
 * `applySettingsToAll` leaves it alone and a settings change reaches panes by
 * way of a fresh layout.
 */
export function setTerminalFontSize(id: number, fontSize: number): void {
  const entry = entries.get(id);
  if (!entry || entry.term.options.fontSize === fontSize) return;
  entry.term.options.fontSize = fontSize;
  fitTerminal(entry);
  applyTerminalBottomAnchor(entry.term, entry.anchor, terminalViewportIsNearBottom(entry.term));
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
  fontSize = settings.fontSize,
): TerminalEntry {
  const existing = entries.get(id);
  if (existing) {
    existing.anchor.enabled = bottomAnchored;
    existing.term.options.fontSize = fontSize;
    host.appendChild(existing.container);
    fitTerminal(existing);
    applyTerminalBottomAnchor(existing.term, existing.anchor);
    return existing;
  }

  const entry = createTerminalEntry(id, settings, host, bottomAnchored, fontSize);
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
    // Not fontSize — see setTerminalFontSize; TerminalStage owns it.
    term.options.fontFamily = terminalFont(settings.fontFamily);
    term.options.scrollback = settings.scrollbackLines;
    term.options.theme = themeFor(settings.theme);
    fitTerminal(entry);
    applyTerminalBottomAnchor(term, entry.anchor, terminalViewportIsNearBottom(term));
  }
}

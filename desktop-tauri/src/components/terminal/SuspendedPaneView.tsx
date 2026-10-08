import { terminalFont, terminalFontReady } from "../../lib/terminalFont";
import { useEffect, useRef } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import { observeResizeThrottled } from "../../lib/throttledFit";
import { useSettingsStore } from "../../state/settingsStore";
import { themeFor } from "../../lib/xtermTheme";
import type { Settings } from "../../types";

/**
 * Replays a restored pane's saved output.
 *
 * Deliberately does **not** use `terminalRegistry`: that wires `onData` to
 * `writeTerminal(id, …)`, and a suspended pane's id names no live session.
 * This terminal owns itself, takes no input, and is disposed on unmount.
 */
export function SuspendedPaneView({ snapshot }: { snapshot: string | null | undefined }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const settings = useSettingsStore((state) => state.settings);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !settings) return;

    // Restored panes open right after sign-in, so this is the terminal most
    // likely to beat the bundled font; see `terminalFontReady`.
    let teardown: (() => void) | null = null;
    let cancelled = false;
    void terminalFontReady().then(() => {
      if (!cancelled) teardown = openSnapshot(host, settings, snapshot);
    });
    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [snapshot, settings?.theme, settings?.fontSize, settings?.fontFamily, settings?.scrollbackLines]);

  return <div ref={hostRef} className="term-view term-view--suspended" aria-label="Saved output" />;
}

/** Opens a read-only terminal in `host` showing `snapshot`; returns its teardown. */
function openSnapshot(host: HTMLElement, settings: Settings, snapshot: string | null | undefined): () => void {
  const term = new Terminal({
    disableStdin: true,
    cursorBlink: false,
    cursorStyle: "bar",
    fontSize: settings.fontSize,
    fontFamily: terminalFont(settings.fontFamily),
    scrollback: settings.scrollbackLines,
    theme: themeFor(settings.theme),
    allowProposedApi: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host);

  const refit = () => {
    const rect = host.getBoundingClientRect();
    if (rect.width > 80 && rect.height > 60) fit.fit();
  };
  refit();
  // The snapshot is a tail of a raw ANSI stream, so it can begin mid escape
  // sequence. Resetting first stops a severed sequence corrupting the view —
  // the same guard the live resync path uses.
  if (snapshot) {
    term.reset();
    term.write(snapshot, () => term.scrollToBottom());
  }

  const media = window.matchMedia("(prefers-color-scheme: light)");
  const syncTheme = () => { if (settings.theme === "auto") term.options.theme = themeFor("auto"); };
  media.addEventListener("change", syncTheme);
  // Throttled like a live pane: refitting reflows the whole restored
  // snapshot, and a panel drag fires the observer every frame.
  const stopFitting = observeResizeThrottled(host, refit);
  return () => {
    stopFitting();
    media.removeEventListener("change", syncTheme);
    term.dispose();
  };
}

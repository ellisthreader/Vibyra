import { useEffect, useRef } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import { initTerminalFont } from "../../lib/terminalFont";
import { themeFor } from "../../lib/xtermTheme";
import { useSettingsStore } from "../../state/settingsStore";

/**
 * Replays a restored pane's saved output.
 *
 * Deliberately does **not** use `terminalRegistry`: that wires `onData` to
 * `writeTerminal(id, …)`, and a suspended pane's id names no live session.
 * This terminal owns itself, takes no input, and is disposed on unmount.
 */
/** Same rhythm as TerminalView: a window drag observes every frame, and an
 * unthrottled synchronous `fit()` per observation is a forced-layout storm
 * multiplied by however many restored panes are on screen. */
const FIT_THROTTLE_MS = 90;

export function SuspendedPaneView({ snapshot }: { snapshot: string | null | undefined }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let term: Terminal | null = null;
    let trailingTimer = 0;
    let frame = 0;
    void initTerminalFont().then(() => {
      const settings = useSettingsStore.getState().settings;
      if (cancelled || !settings) return;

      const openedTerm = new Terminal({
        disableStdin: true,
        cursorBlink: false,
        cursorStyle: "bar",
        fontSize: settings.fontSize,
        fontFamily: `"JetBrains Mono Variable", ${settings.fontFamily}`,
        scrollback: settings.scrollbackLines,
        theme: themeFor(settings.theme),
        allowProposedApi: true,
      });
      term = openedTerm;
      const fit = new FitAddon();
      openedTerm.loadAddon(fit);
      openedTerm.open(host);

      let lastFitAt = 0;
      const refit = () => {
        if (cancelled) return;
        lastFitAt = performance.now();
        const rect = host.getBoundingClientRect();
        if (rect.width > 80 && rect.height > 60) fit.fit();
      };
      refit();
      // The snapshot is a tail of a raw ANSI stream, so it can begin mid escape
      // sequence. Resetting first stops a severed sequence corrupting the view —
      // the same guard the live resync path uses.
      if (snapshot) {
        openedTerm.reset();
        openedTerm.write(snapshot, () => {
          if (!cancelled) openedTerm.scrollToBottom();
        });
      }

      observer = new ResizeObserver(() => {
        if (!frame && performance.now() - lastFitAt > FIT_THROTTLE_MS) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            refit();
          });
        }
        window.clearTimeout(trailingTimer);
        trailingTimer = window.setTimeout(refit, FIT_THROTTLE_MS);
      });
      observer.observe(host);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearTimeout(trailingTimer);
      cancelAnimationFrame(frame);
      term?.dispose();
    };
  }, [snapshot]);

  return <div ref={hostRef} className="term-view term-view--suspended" aria-label="Saved output" />;
}

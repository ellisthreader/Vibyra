import { useEffect, useRef } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import { initTerminalFont } from "../../lib/terminalFont";
import { previewSlice } from "../../lib/suspendedPreview";
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
    const build = (): void => {
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
        // Only the tail is drawn — `snapshot` itself stays whole on the pane,
        // for `relaunchContinuity` to replay on resume. See `suspendedPreview`.
        // Either way this is a tail of a raw ANSI stream and can begin mid
        // escape sequence, so resetting first stops a severed sequence
        // corrupting the view — the same guard the live resync path uses.
        const visible = previewSlice(snapshot);
        if (visible) {
          openedTerm.reset();
          openedTerm.write(visible, () => {
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
    };

    // Two frames, not one: a single rAF callback still runs before the paint
    // it belongs to. Letting the card chrome — title, status pill, Resume —
    // land first is what makes switching projects feel immediate, and a
    // suspended pane is a still picture that loses nothing by arriving a beat
    // later.
    let startFrame = requestAnimationFrame(() => {
      startFrame = requestAnimationFrame(() => {
        startFrame = 0;
        build();
      });
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearTimeout(trailingTimer);
      cancelAnimationFrame(startFrame);
      cancelAnimationFrame(frame);
      term?.dispose();
    };
  }, [snapshot]);

  return <div ref={hostRef} className="term-view term-view--suspended" aria-label="Saved output" />;
}

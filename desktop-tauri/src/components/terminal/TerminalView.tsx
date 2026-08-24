import { useEffect, useRef } from "react";

import {
  applyTerminalBottomAnchor,
  terminalViewportIsNearBottom,
} from "../../lib/terminalBottomAnchor";
import { dropCarriesText, terminalDropText } from "../../lib/terminalDrop";
import { initTerminalFont } from "../../lib/terminalFont";
import {
  fitTerminal,
  getTerminal,
  mountTerminal,
  unmountTerminal,
} from "../../lib/terminalRegistry";
import { useSettingsStore } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";

/**
 * Thin React host for a registry-owned xterm instance. Mounting appends the
 * persistent terminal element; unmounting detaches it without disposing, so
 * layout changes never lose terminal state.
 *
 * Resizes fit on the next frame (throttled) plus a trailing settle pass, so
 * grid changes and panel drags track live instead of snapping late.
 */
const FIT_THROTTLE_MS = 90;

export function TerminalView({
  id,
  bottomAnchored,
  active,
}: {
  id: number;
  bottomAnchored: boolean;
  active: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) {
      unmountTerminal(id);
      return;
    }
    const host = hostRef.current;
    const settings = useSettingsStore.getState().settings;
    if (!host || !settings) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let trailingTimer = 0;
    let frame = 0;
    void initTerminalFont().then(() => {
      if (cancelled) return;
      const entry = mountTerminal(id, settings, host, bottomAnchored);
      let lastFitAt = 0;
      const fitNow = () => {
        if (cancelled) return;
        lastFitAt = performance.now();
        const followOutput = terminalViewportIsNearBottom(entry.term);
        fitTerminal(entry);
        applyTerminalBottomAnchor(entry.term, entry.anchor, followOutput);
      };
      observer = new ResizeObserver(() => {
        if (!frame && performance.now() - lastFitAt > FIT_THROTTLE_MS) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            fitNow();
          });
        }
        window.clearTimeout(trailingTimer);
        trailingTimer = window.setTimeout(fitNow, FIT_THROTTLE_MS);
      });
      observer.observe(host);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearTimeout(trailingTimer);
      cancelAnimationFrame(frame);
      unmountTerminal(id);
    };
  }, [active, bottomAnchored, id]);

  return (
    <div
      ref={hostRef}
      className="term-view"
      onMouseDown={() => useTerminalStore.getState().markFocused(id)}
      onDragOver={(event) => {
        // A drag only exposes its types, never its data — accepting here is
        // what lets the drop through at all.
        if (!dropCarriesText(event.dataTransfer.types)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        const text = terminalDropText(event.dataTransfer);
        if (!text) return;
        event.preventDefault();
        const entry = getTerminal(id);
        if (!entry) return;
        entry.term.paste(text);
        entry.term.focus();
        useTerminalStore.getState().markFocused(id);
      }}
    />
  );
}

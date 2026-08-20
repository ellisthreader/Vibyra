import { useEffect, useRef } from "react";

import {
  applyTerminalBottomAnchor,
  terminalViewportIsNearBottom,
} from "../../lib/terminalBottomAnchor";
import { fitTerminal, mountTerminal } from "../../lib/terminalRegistry";
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

export function TerminalView({ id, bottomAnchored }: { id: number; bottomAnchored: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const settings = useSettingsStore.getState().settings;
    if (!host || !settings) return;

    const entry = mountTerminal(id, settings, host, bottomAnchored);
    let trailingTimer = 0;
    let frame = 0;
    let lastFitAt = 0;
    const fitNow = () => {
      lastFitAt = performance.now();
      const followOutput = terminalViewportIsNearBottom(entry.term);
      fitTerminal(entry);
      applyTerminalBottomAnchor(entry.term, entry.anchor, followOutput);
    };
    const observer = new ResizeObserver(() => {
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

    return () => {
      observer.disconnect();
      window.clearTimeout(trailingTimer);
      cancelAnimationFrame(frame);
      entry.container.remove();
    };
  }, [bottomAnchored, id]);

  return (
    <div
      ref={hostRef}
      className="term-view"
      onMouseDown={() => useTerminalStore.getState().markFocused(id)}
    />
  );
}

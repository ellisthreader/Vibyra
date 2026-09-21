import { useEffect, useRef } from "react";

import {
  applyTerminalBottomAnchor,
  terminalViewportIsNearBottom,
} from "../../lib/terminalBottomAnchor";
import { dropCarriesText, terminalDropText } from "../../lib/terminalDrop";
import { pointerMissedTerminal, terminalWheelLines } from "../../lib/terminalPointer";
import {
  fitTerminal,
  focusTerminal,
  getTerminal,
  mountTerminal,
  setTerminalFontSize,
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
 *
 * `fontSize` comes from the grid layout rather than the settings, because a
 * crowded grid buys lines back by rendering smaller. It is applied outside the
 * mount effect so a density change resizes the terminal in place instead of
 * tearing down a live one.
 *
 * The host forwards clicks and wheels to the terminal because it is often
 * larger than it: the bottom anchor translates the xterm element down by its
 * unused rows, so a CLI drawing a short screen — an update notice, a
 * permission prompt — leaves most of the pane covered by this div and not by
 * the terminal. Those events would otherwise land here and be dropped, and a
 * pane whose only reply to a click is the focus ring is a pane that cannot be
 * answered.
 */
const FIT_THROTTLE_MS = 90;

export function TerminalView(
  { id, bottomAnchored, fontSize }: { id: number; bottomAnchored: boolean; fontSize: number },
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fontRef = useRef(fontSize);
  fontRef.current = fontSize;

  useEffect(() => {
    const host = hostRef.current;
    const settings = useSettingsStore.getState().settings;
    if (!host || !settings) return;

    const entry = mountTerminal(id, settings, host, bottomAnchored, fontRef.current);
    let trailingTimer = 0;
    let frame = 0;
    let lastFitAt = 0;
    const fitNow = () => {
      lastFitAt = performance.now();
      const followOutput = terminalViewportIsNearBottom(entry.term);
      fitTerminal(entry);
      applyTerminalBottomAnchor(entry.term, entry.anchor, followOutput);
    };
    // Native rather than React's onWheel, which is passive and so could not
    // claim the gesture: without preventDefault a scrollable grid behind the
    // pane would scroll at the same time as the terminal.
    const onWheel = (event: WheelEvent) => {
      // Read the entry back rather than closing over it: hibernation disposes
      // the terminal a render before this pane unmounts and drops the listener.
      const live = getTerminal(id);
      if (!live || !pointerMissedTerminal(live.term.element, event.target)) return;
      const before = live.term.buffer.active.viewportY;
      live.term.scrollLines(
        terminalWheelLines(event.deltaY, event.deltaMode, live.anchor.cellHeight),
      );
      // At either end of the scrollback the gesture belongs to whatever
      // scrolls behind the pane, exactly as it does over the terminal itself.
      if (live.term.buffer.active.viewportY !== before) event.preventDefault();
    };
    host.addEventListener("wheel", onWheel, { passive: false });

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
      host.removeEventListener("wheel", onWheel);
      observer.disconnect();
      window.clearTimeout(trailingTimer);
      cancelAnimationFrame(frame);
      entry.container.remove();
    };
  }, [bottomAnchored, id]);

  useEffect(() => setTerminalFontSize(id, fontSize), [fontSize, id]);

  return (
    <div
      ref={hostRef}
      className="term-view"
      onMouseDown={(event) => {
        useTerminalStore.getState().markFocused(id);
        const entry = getTerminal(id);
        // On the terminal itself xterm takes focus and owns the selection
        // drag; this is only for the region it does not cover, where the
        // default action would hand focus straight back to the body and
        // there is no text under the pointer to select anyway.
        if (!entry || !pointerMissedTerminal(entry.term.element, event.target)) return;
        event.preventDefault();
        focusTerminal(id);
      }}
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

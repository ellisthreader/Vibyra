import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";

import {
  DOCK_COMPACT_DEFAULT,
  DOCK_WIDE_DEFAULT_RATIO,
  dockWidthFromPointer,
  nudgeDockWidth,
  type DockSize,
} from "../../lib/dockLayout";

/**
 * The dock's resize grip.
 *
 * Two values come out of this, and the difference between them is the whole
 * point. `width` follows the pointer every frame, and moving it only moves the
 * dock — which is absolutely positioned, so it costs no layout anywhere else.
 * The committed value, the one the terminals reserve room against, lands once
 * on release. The old companion was a flex basis in the shell row and
 * committed on every frame, so one drag re-laid-out and refit every xterm on
 * screen sixty times a second.
 *
 * `preferred` and the committed value are in the unit the current size stores:
 * pixels while compact, a share of the workspace while wide.
 */
export function useDockResize(
  size: DockSize,
  preferred: number,
  host: RefObject<HTMLElement | null>,
  commit: (value: number) => void,
) {
  const [width, setWidth] = useState(preferred);
  const latest = useRef(preferred);
  const dragging = useRef(false);

  useEffect(() => {
    if (dragging.current) return;
    latest.current = preferred;
    setWidth(preferred);
  }, [preferred, size]);

  useEffect(() => {
    // High-rate mice deliver pointermove far above the frame rate; apply once
    // per frame so the dock still moves at exactly the display's cadence.
    let frame = 0;
    const move = (event: globalThis.PointerEvent) => {
      if (!dragging.current) return;
      const box = host.current?.getBoundingClientRect();
      if (!box) return;
      latest.current = dockWidthFromPointer(size, event.clientX, box.left, box.width);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setWidth(latest.current);
      });
    };
    const finish = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove("dock-resizing");
      setWidth(latest.current);
      commit(latest.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("dock-resizing");
    };
  }, [commit, host, size]);

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging.current = true;
    document.body.classList.add("dock-resizing");
  };

  // Keyboard and double-click move in one step, so they commit immediately —
  // there is no frame stream to protect the terminals from.
  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nudgeDockWidth(size, latest.current, event.key);
    if (next === null) return;
    event.preventDefault();
    latest.current = next;
    setWidth(next);
    commit(next);
  };

  const reset = () => {
    const value = size === "compact" ? DOCK_COMPACT_DEFAULT : DOCK_WIDE_DEFAULT_RATIO;
    latest.current = value;
    setWidth(value);
    commit(value);
  };

  return { width, start, resizeWithKeyboard, reset };
}

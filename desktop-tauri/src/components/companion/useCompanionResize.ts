import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import {
  clampCompanionWidth,
  COMPANION_DEFAULT_WIDTH,
  COMPANION_MAX_WIDTH,
  COMPANION_MIN_WIDTH,
} from "../../lib/companionPreferences";

interface DragState {
  pointerX: number;
  width: number;
}

export function useCompanionResize(preferred: number, commit: (width: number) => void) {
  const [width, setWidth] = useState(preferred);
  const latest = useRef(preferred);
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    if (drag.current) return;
    latest.current = preferred;
    setWidth(preferred);
  }, [preferred]);

  useEffect(() => {
    // High-rate mice deliver pointermove far above the frame rate, and every
    // width change re-lays-out the terminal grid — apply once per frame.
    let frame = 0;
    const move = (event: globalThis.PointerEvent) => {
      if (!drag.current) return;
      latest.current = clampCompanionWidth(
        drag.current.width + drag.current.pointerX - event.clientX,
      );
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setWidth(latest.current);
      });
    };
    const finish = () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.classList.remove("companion-resizing");
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
      document.body.classList.remove("companion-resizing");
    };
  }, [commit]);

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag.current = { pointerX: event.clientX, width: latest.current };
    document.body.classList.add("companion-resizing");
  };

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 16;
    let next = latest.current;
    if (event.key === "ArrowLeft") next += step;
    else if (event.key === "ArrowRight") next -= step;
    else if (event.key === "Home") next = COMPANION_MIN_WIDTH;
    else if (event.key === "End") next = COMPANION_MAX_WIDTH;
    else return;
    event.preventDefault();
    latest.current = clampCompanionWidth(next);
    setWidth(latest.current);
    commit(latest.current);
  };

  const reset = () => {
    latest.current = COMPANION_DEFAULT_WIDTH;
    setWidth(COMPANION_DEFAULT_WIDTH);
    commit(COMPANION_DEFAULT_WIDTH);
  };

  return { width, start, resizeWithKeyboard, reset };
}

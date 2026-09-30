import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { HelpIcon } from "../common/Icons";

/**
 * The "?" beside a setting's label, and the panel it opens on hover or
 * keyboard focus.
 *
 * The panel is portalled to the body and placed by measurement rather than
 * laid out in the row, because `.settings-group` sets `overflow: hidden` — an
 * in-flow panel would simply be clipped by the card it belongs to.
 */
const WIDTH = 340;
const GAP = 8;
const EDGE = 12;
/** Long enough to cross the gap between the dot and the panel without the
 * panel vanishing under the pointer on the way. */
const CLOSE_DELAY_MS = 140;

interface Placement {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

export function SettingHint({ label, children }: { label: string; children: ReactNode }) {
  const dot = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [place, setPlace] = useState<Placement | null>(null);
  const id = useId();
  const open = hovered || focused;

  const enter = () => {
    clearTimeout(timer.current);
    setHovered(true);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(false), CLOSE_DELAY_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const anchor = dot.current?.getBoundingClientRect();
      if (!anchor) return;
      const room = innerHeight - EDGE * 2;
      const width = Math.min(WIDTH, innerWidth - EDGE * 2);
      const height = Math.min(panel.current?.offsetHeight ?? 0, room);
      // Below by default, above when there is no room below but there is
      // above. The clamp is the backstop for a panel that fits neither way:
      // it may scroll, but it may never hang off the edge of the window.
      const below = anchor.bottom + GAP;
      const flip = height > 0 && below + height > innerHeight - EDGE && anchor.top - GAP - height > EDGE;
      const top = flip ? anchor.top - GAP - height : below;
      setPlace({
        width,
        maxHeight: room,
        left: Math.max(EDGE, Math.min(anchor.left - 10, innerWidth - width - EDGE)),
        top: Math.max(EDGE, Math.min(top, innerHeight - EDGE - height)),
      });
    };
    position();
    // The first pass has no panel to measure; the second one does, which is
    // what decides whether it had to flip.
    const frame = requestAnimationFrame(position);
    addEventListener("resize", position);
    addEventListener("scroll", position, true);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("resize", position);
      removeEventListener("scroll", position, true);
    };
  }, [open]);

  useEffect(() => {
    // Escape is claimed only when the panel was opened from the keyboard.
    // A hover is not a layer the user is "in", so pressing Escape with the
    // pointer resting near a "?" must still close the Settings dialog. The
    // panel marks itself `data-escape-owner` on the same condition, which is
    // how `useModalFocus` knows to stand down. See that file.
    if (!focused) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setFocused(false);
      setHovered(false);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [focused]);

  return (
    <>
      <button
        ref={dot}
        type="button"
        className={`setting-hint__dot${open ? " setting-hint__dot--on" : ""}`}
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <HelpIcon size={14} />
      </button>
      {open
        ? createPortal(
            <div
              ref={panel}
              id={id}
              role="tooltip"
              className="setting-hint"
              data-escape-owner={focused ? "" : undefined}
              // Hidden rather than absent until measured: the panel has to be
              // in the document to have a height worth measuring.
              style={place ? { ...place } : { visibility: "hidden" }}
              onPointerEnter={enter}
              onPointerLeave={leave}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

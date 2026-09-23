import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { previewCue } from "../../lib/notificationSounds";
import { CUE_LABELS, CUE_ORDER } from "../../lib/soundCues";
import { CheckIcon } from "../common/Icons";
import { anchorTo, samePlace } from "../../lib/anchoredMenu";
import type { SoundCueId } from "../../notificationTypes";

interface Props {
  value: SoundCueId;
  onChange: (next: SoundCueId) => void;
  /** 0..1, used for the preview that follows a selection. */
  volume: number;
  /** The event's name. Named together with the cue, since `aria-label`
   * replaces the text a sighted user reads off the trigger. */
  label: string;
  disabled?: boolean;
}

/* Wide enough for the longest label beside a tick. `anchorTo` aligns a menu
 * wider than its trigger by the right edge, so it lines up with the column it
 * belongs to rather than overhanging it. */
const MENU_MIN_WIDTH = 132;
const MAX_MENU_HEIGHT = 300;

/**
 * The sound for one event. A portalled listbox rather than a native `select`:
 * a select paints a filled slab, which reads as a hole cut into the
 * outline-only settings panel, and it cannot play what it is offering.
 * Choosing a cue plays it — hearing it is the whole point of picking one.
 */
export function SoundCuePicker({ value, onChange, volume, label, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<React.CSSProperties>({ top: 0, left: 0, width: 0, maxHeight: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = (restore = true) => {
    setOpen(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  };

  const choose = (index: number) => {
    const next = CUE_ORDER[index];
    // Picking the cue that is already set is how you hear it a second time.
    // Playing it is free; writing settings.json again is not.
    if (next !== value) onChange(next);
    previewCue(next, volume); // silent for "none", never throws
    close();
  };

  /** Re-anchors the menu; called again on every frame the pane scrolls. */
  const place = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const next = anchorTo(rect, {
      minWidth: MENU_MIN_WIDTH,
      maxHeight: MAX_MENU_HEIGHT,
      // Inside the dialog, not just inside the window: a menu hanging off the
      // bottom of the panel onto the scrim looks detached from the page.
      bounds: trigger.current?.closest(".settings-modal")?.getBoundingClientRect(),
      // `scrollHeight` is the content height whatever the current cap; the menu
      // is mounted by the time this runs, except on the very first frame.
      wanted: menu.current?.scrollHeight,
    });
    if (!next) return close(false);
    setPosition((current) => (samePlace(current, next) ? current : next));
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    setActive(Math.max(0, CUE_ORDER.indexOf(value)));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    menu.current?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close(false);
    };
    const dismiss = () => close();
    // The pane scrolls beneath a menu parked at the document root, so the menu
    // follows its trigger rather than closing: clicking a partly visible row
    // scrolls it into view, and a dismiss-on-scroll menu vanished in that frame.
    let frame = 0;
    const follow = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menu.current?.contains(target)) return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    document.addEventListener("scroll", follow, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("scroll", follow, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id, position]);

  const onMenuKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Tab") {
      // Tab returns focus to the trigger so the browser carries on from there.
      if (event.key === "Escape") event.preventDefault();
      close();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const last = CUE_ORDER.length - 1;
      setActive((index) => {
        if (event.key === "Home") return 0;
        if (event.key === "End") return last;
        return Math.max(0, Math.min(last, index + (event.key === "ArrowDown" ? 1 : -1)));
      });
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="cuepick"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${label} sound: ${CUE_LABELS[value]}`}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        <span className="cuepick__label">{CUE_LABELS[value]}</span>
        <svg className="cuepick__chev" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
        </svg>
      </button>
      {open && !disabled && createPortal(
        <div
          ref={menu}
          id={id}
          className="cuepick-menu"
          role="listbox"
          aria-label={`${label} sound`}
          /* Escape and Tab belong to this menu, not the dialog under it. */
          data-escape-owner="true"
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
          style={position}
          onKeyDown={onMenuKey}
        >
          {CUE_ORDER.map((cue, index) => (
            <div
              key={cue}
              id={`${id}-${index}`}
              className="cuepick-menu__option"
              role="option"
              aria-selected={cue === value}
              data-active={index === active}
              data-cue={cue}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span className="cuepick-menu__name">{CUE_LABELS[cue]}</span>
              {cue === value && <span className="cuepick-menu__tick" aria-hidden="true"><CheckIcon size={12} /></span>}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

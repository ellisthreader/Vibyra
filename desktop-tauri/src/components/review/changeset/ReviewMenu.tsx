import { useEffect, useRef, useState, type ReactNode } from "react";

// The little popover behind the Land split button's `▾` and the action bar's
// `⋯`. Same dismissal contract as `AccountMenu` — pointer outside, Escape,
// focus back on the trigger — because a second dismissal idiom in the same
// window is a bug the user only notices when it strands a menu open.
//
// It renders nothing of its own beyond the trigger and the sheet: the items
// are the caller's, so the destructive one can carry its own tone and its own
// confirm without this file knowing what any of them do.

interface Props {
  /** The trigger's accessible name; the glyph alone never is one. */
  label: string;
  glyph: ReactNode;
  className?: string;
  disabled?: boolean;
  /** Items get `close` so an action and its dismissal stay one gesture. */
  children: (close: () => void) => ReactNode;
}

export function ReviewMenu({ label, glyph, className, disabled, children }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = Array.from(
        sheetRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [],
      );
      if (items.length === 0) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length].focus();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) sheetRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
  }, [open]);

  return (
    <div className="review-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((was) => !was)}
      >
        {glyph}
      </button>
      {open && (
        <div className="review-menu__sheet" role="menu" aria-label={label} ref={sheetRef}>
          {children(() => close(true))}
        </div>
      )}
    </div>
  );
}

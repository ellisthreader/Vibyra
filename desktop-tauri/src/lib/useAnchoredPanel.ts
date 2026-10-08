import { useEffect } from "react";
import type { RefObject } from "react";

// Behaviour shared by every panel that hangs off a title-bar control: close on
// an outside pointerdown, close on Escape, cycle the panel's focusables with
// the arrow keys, and hand focus back to the trigger when the panel goes away.
// Deliberately *not* `useModalFocus`: an anchored panel is a popup, not a
// dialog — it must never inert the workspace behind it.

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), " +
  "textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export interface AnchoredPanelOptions {
  open: boolean;
  onClose: () => void;
  /** Wrapper containing both the trigger and the panel; bounds "outside". */
  rootRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLElement | null>;
}

export function useAnchoredPanel(options: AnchoredPanelOptions): void {
  const { open, onClose, rootRef, panelRef, triggerRef } = options;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;
      const active = document.activeElement;
      if (active instanceof Node && !panel?.contains(active)) return;
      event.preventDefault();
      const index = items.indexOf(active as HTMLElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length].focus();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
      // Only steal focus back if it was still inside the panel we are tearing
      // down — otherwise a click elsewhere would yank the caret to the bell.
      const active = document.activeElement;
      if (active instanceof Node && panel?.contains(active)) triggerRef.current?.focus();
    };
  }, [open, onClose, rootRef, panelRef, triggerRef]);
}

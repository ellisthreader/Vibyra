import { useEffect } from "react";
import type { RefObject } from "react";

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), " +
  "textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * A dialog opened from inside another dialog.
 *
 * Deliberately *not* `useModalFocus`. That hook stands down the moment a
 * `[data-escape-owner]` element is on the page, which is exactly how the
 * dialog underneath learns to leave Escape and Tab alone — so a nested dialog
 * carrying the marker and also calling `useModalFocus` would switch off its
 * own Escape as well, and neither dialog would close.
 *
 * The caller puts `data-escape-owner` on the dialog element; this answers both
 * keys itself. It also leaves `inert` alone: the dialog underneath already
 * inerted the workspace, and clearing it on this one's way out would un-inert
 * the workspace while that dialog is still open.
 */
export function useNestedDialog(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !(active instanceof Node) || !node.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      opener?.focus();
    };
  }, [ref, open, onClose]);
}

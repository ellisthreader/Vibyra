import { useEffect } from "react";
import type { RefObject } from "react";

/** True while a popup layered over a dialog is handling Escape and Tab itself. */
function popupOwnsKeys(): boolean {
  const owner = document.querySelector("[data-escape-owner]");
  return owner instanceof HTMLElement && owner.getClientRects().length > 0;
}

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), " +
  "textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** Complete modal behaviour: moves focus inside on open, traps Tab, makes the
 * workspace behind the dialog inert, closes on Escape, and restores focus to
 * the opener on close/unmount. */
export function useModalFocus(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The modal is a child of .app, so inert its siblings rather than .app.
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(".app > .chrome, .app > .shell"),
    );
    for (const element of background) element.setAttribute("inert", "");
    node.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      // A popup layered over the dialog owns both keys while it is open. This
      // listener is on `window` in the capture phase, so without standing down
      // a portalled menu's own handlers never run: Escape would close the whole
      // dialog under it, and Tab — which sees the portal as "outside" the
      // dialog — would fling focus back to the dialog's first control. Such a
      // layer marks itself `data-escape-owner`; the attribute lives on the
      // popup element, so it cannot outlive it. It must also be rendered: a
      // hidden node carrying it would silently disable Escape app-wide.
      if (popupOwnsKeys()) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
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
      for (const element of background) element.removeAttribute("inert");
      opener?.focus();
    };
  }, [ref, open, onClose]);
}

import { useEffect } from "react";
import type { RefObject } from "react";

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), " +
  "textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
const DEFAULT_BACKGROUND = ".app > .chrome, .app > .shell";

/** Complete modal behaviour: moves focus inside on open, traps Tab, makes the
 * workspace behind the dialog inert, closes on Escape, and restores focus to
 * the opener on close/unmount. */
export function useModalFocus(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  backgroundSelector = DEFAULT_BACKGROUND,
  onAfterRestore?: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(backgroundSelector),
    );
    for (const element of background) element.setAttribute("inert", "");
    (node.querySelector<HTMLElement>("[data-autofocus]") ??
      node.querySelector<HTMLElement>(FOCUSABLE))?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
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
      const staticFocus = active instanceof HTMLElement
        && node.contains(active) && !items.includes(active);
      if (event.shiftKey && (active === first || outside || staticFocus)) {
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
      onAfterRestore?.();
    };
  }, [backgroundSelector, ref, open, onAfterRestore, onClose]);
}

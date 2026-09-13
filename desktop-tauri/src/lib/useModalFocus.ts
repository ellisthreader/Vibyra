import { useLayoutEffect, useRef, type RefObject } from "react";
import { holdInert, modalStack } from "./modalInert";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), " +
  "select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
const DEFAULT_BACKGROUND = ".app > .chrome, .app > .shell";

export function useModalFocus(
  ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void,
  backgroundSelector = DEFAULT_BACKGROUND, onAfterRestore?: () => void,
) {
  const callbacks = useRef({ onClose, onAfterRestore });
  callbacks.current = { onClose, onAfterRestore };
  // React autoFocus runs during commit, before layout effects.
  const beforeCommit = document.activeElement;
  const openerHint = useRef(beforeCommit);
  if (!open) openerHint.current = beforeCommit;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!open || !node) return;
    const active = document.activeElement;
    const opener = node.contains(active) ? openerHint.current : active;
    const previous = modalStack.at(-1);
    const background = Array.from(document.querySelectorAll<HTMLElement>(backgroundSelector));
    if (previous) background.push(previous);
    const releases = [...new Set(background)].filter(element => !element.contains(node))
      .map(holdInert);
    modalStack.push(node);
    const top = () => modalStack.at(-1) === node;
    const items = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(item => item.getClientRects().length > 0 && !item.closest("[inert]"));
    const focusFirst = () => {
      const preferred = node.querySelector<HTMLElement>("[data-autofocus], [autofocus]");
      (preferred ?? items()[0] ?? node).focus();
    };
    focusFirst();
    const onFocus = (event: FocusEvent) => {
      if (top() && event.target instanceof Node && !node.contains(event.target)) focusFirst();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!top() || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        callbacks.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      const first = list[0];
      const last = list.at(-1);
      const focused = document.activeElement;
      if (!first || !last) { event.preventDefault(); node.focus(); return; }
      const outside = !(focused instanceof HTMLElement) || !list.includes(focused);
      if (outside || (event.shiftKey ? focused === first : focused === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocus, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocus, true);
      const wasTop = top();
      const index = modalStack.indexOf(node);
      if (index >= 0) modalStack.splice(index, 1);
      releases.reverse().forEach(release => release());
      if (wasTop && opener instanceof HTMLElement && opener.isConnected && !opener.closest("[inert]")) opener.focus();
      if (wasTop) callbacks.current.onAfterRestore?.();
    };
  }, [backgroundSelector, ref, open]);
}

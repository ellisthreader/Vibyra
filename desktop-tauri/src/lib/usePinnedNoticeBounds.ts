import { useEffect, type RefObject } from "react";

// Publishes the pinned notice's height to CSS so the toast stack can sit above
// it. Kept out of the component for the line limit, and because this is DOM
// measurement rather than rendering.
//
// The height is not a constant: the card grows a line when a release note
// wraps, and grows again when it becomes the "restart to finish" ask with two
// buttons. A hard-coded offset would leave a gap at one size and an overlap at
// another, so it is measured.

const ATTRIBUTE = "data-pinned-notice";
const VARIABLE = "--vpinned-h";

function clear(root: HTMLElement): void {
  root.removeAttribute(ATTRIBUTE);
  root.style.removeProperty(VARIABLE);
}

/**
 * Marks the document while `ref` is mounted and keeps `--vpinned-h` in step
 * with its height.
 *
 * `present` is passed rather than inferred from the ref because a ref carries
 * no reactivity — the effect has to re-run when the notice appears or leaves,
 * and reading `ref.current` in a dependency array would not do that.
 */
export function usePinnedNoticeBounds(
  ref: RefObject<HTMLElement | null>,
  present: boolean,
): void {
  useEffect(() => {
    const root = document.documentElement;
    const node = ref.current;
    if (!present || !node) {
      clear(root);
      return;
    }
    root.setAttribute(ATTRIBUTE, "");
    const publish = () => {
      root.style.setProperty(VARIABLE, `${Math.round(node.offsetHeight)}px`);
    };
    publish();
    // ResizeObserver rather than a layout effect on every render: the card is
    // resized by its own content and by the window, neither of which React is
    // told about.
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      clear(root);
    };
  }, [ref, present]);
}

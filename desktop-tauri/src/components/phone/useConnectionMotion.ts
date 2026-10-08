import { useLayoutEffect, useRef, type RefObject } from "react";

/** Measure both layouts, then animate the shell without scaling its type. */
export function useConnectionMotion(ref: RefObject<HTMLElement | null>, connected: boolean) {
  const before = useRef<DOMRect | null>(null);
  const leaving = useRef<Animation | null>(null);
  useLayoutEffect(() => () => { leaving.current?.cancel(); }, []);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || connected) return;
    const measure = () => { before.current = node.getBoundingClientRect(); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, connected]);
  useLayoutEffect(() => {
    const node = ref.current;
    const previous = before.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!connected || !node || !previous || reduced.matches) return;
    const next = node.getBoundingClientRect();
    const animation = node.animate([
      { width: `${previous.width}px`, height: `${previous.height}px` },
      { width: `${next.width}px`, height: `${next.height}px` },
    ], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" });
    const finish = () => { animation.finish(); };
    window.addEventListener("resize", finish);
    reduced.addEventListener("change", finish);
    return () => {
      animation.cancel();
      window.removeEventListener("resize", finish);
      reduced.removeEventListener("change", finish);
    };
  }, [ref, connected]);
  return async () => {
    const body = ref.current?.querySelector<HTMLElement>(".phone-connect__request");
    if (!body || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: "forwards" });
    leaving.current = animation;
    try { await animation.finished; } catch { /* closed while pairing */ }
  };
}

/* The scroll bookkeeping behind the windowed diff.
 *
 * Row height is measured from a hidden probe row rather than written down: the
 * rows are monospace at `--fs-hint` with a line-height from the sheet, and a
 * number copied into TypeScript would be wrong the first time either changes,
 * or the moment the web font swaps in. One observer watches both the probe and
 * the scroll box, so a font swap and a dock resize land through the same path.
 *
 * The diff has its own scroll box — the row it expands into is capped, and the
 * dock's `.review-scroll` is a level above — so the window sizes against that
 * box, not the panel. */

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { rowWindow, type RowWindow } from "./diffWindow.ts";

interface Metrics {
  scrollTop: number;
  viewport: number;
}

export interface DiffWindow {
  scrollRef: RefObject<HTMLDivElement | null>;
  probeRef: RefObject<HTMLDivElement | null>;
  rowHeight: number;
  window: RowWindow;
}

export function useDiffWindow(count: number): DiffWindow {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const probeRef = useRef<HTMLDivElement | null>(null);
  const [rowHeight, setRowHeight] = useState(0);
  const [metrics, setMetrics] = useState<Metrics>({ scrollTop: 0, viewport: 0 });

  // Scrolling reads two numbers the browser already has. Measuring the probe
  // here instead would force a layout on every frame of every flick, which is
  // exactly the cost this whole view exists to avoid.
  const track = useCallback(() => {
    const host = scrollRef.current;
    if (!host) return;
    setMetrics((prev) =>
      prev.scrollTop === host.scrollTop && prev.viewport === host.clientHeight
        ? prev
        : { scrollTop: host.scrollTop, viewport: host.clientHeight },
    );
  }, []);

  const measure = useCallback(() => {
    const probe = probeRef.current;
    if (!probe) return;
    const measured = probe.getBoundingClientRect().height;
    // A half-pixel of noise is not worth re-slicing the whole list for.
    if (measured > 0) setRowHeight((prev) => (Math.abs(prev - measured) > 0.5 ? measured : prev));
  }, []);

  useLayoutEffect(() => {
    const host = scrollRef.current;
    if (!host) return undefined;
    measure();
    track();
    host.addEventListener("scroll", track, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            measure();
            track();
          });
    observer?.observe(host);
    if (probeRef.current) observer?.observe(probeRef.current);
    return () => {
      host.removeEventListener("scroll", track);
      observer?.disconnect();
    };
  }, [measure, track]);

  return {
    scrollRef,
    probeRef,
    rowHeight,
    window: rowWindow(count, rowHeight, metrics.scrollTop, metrics.viewport),
  };
}

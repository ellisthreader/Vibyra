/** Minimum gap between two live fits while a resize is still moving. */
const FIT_THROTTLE_MS = 90;

/**
 * Calls `fit` as `element` resizes: on the next frame (throttled to one pass
 * per FIT_THROTTLE_MS) plus a trailing settle pass, so grid changes and panel
 * drags track live instead of snapping late — without reflowing a whole
 * terminal on every observer tick of a drag. Returns the teardown.
 */
export function observeResizeThrottled(element: Element, fit: () => void): () => void {
  let trailingTimer = 0;
  let frame = 0;
  let lastFitAt = 0;
  const fitNow = () => {
    lastFitAt = performance.now();
    fit();
  };
  const observer = new ResizeObserver(() => {
    if (!frame && performance.now() - lastFitAt > FIT_THROTTLE_MS) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        fitNow();
      });
    }
    window.clearTimeout(trailingTimer);
    trailingTimer = window.setTimeout(fitNow, FIT_THROTTLE_MS);
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
    window.clearTimeout(trailingTimer);
    cancelAnimationFrame(frame);
  };
}

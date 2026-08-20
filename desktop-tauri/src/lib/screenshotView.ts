import type { Size } from "./screenshotDrawing";

/**
 * How the full-resolution capture is presented on screen.
 *
 * The visible layers are sized to the space they actually occupy rather than
 * to the capture resolution. A 1920x1080 canvas scaled down by CSS makes the
 * compositor resample a 2-megapixel layer on every frame, which is the
 * difference between a smooth and a stuttering crop drag on the
 * software-composited WebKit path.
 */
export interface ScreenshotView {
  /** Backing-store pixels of each visible layer. */
  width: number;
  height: number;
  /** CSS layout size of the stacked layers. */
  cssWidth: number;
  cssHeight: number;
  /** Backing-store pixels per document pixel. */
  scale: number;
}

export const EMPTY_SCREENSHOT_VIEW: ScreenshotView = {
  width: 0,
  height: 0,
  cssWidth: 0,
  cssHeight: 0,
  scale: 1,
};

/** Fits `document` inside `box` without ever upscaling past the capture. */
export function fitScreenshotView(
  box: Size,
  document: Size,
  pixelRatio: number,
): ScreenshotView {
  if (!document.width || !document.height || box.width <= 0 || box.height <= 0) {
    return EMPTY_SCREENSHOT_VIEW;
  }
  const fit = Math.min(box.width / document.width, box.height / document.height, 1);
  const cssWidth = Math.max(1, Math.round(document.width * fit));
  const cssHeight = Math.max(1, Math.round(document.height * fit));
  // Never allocate more device pixels than the capture holds; the extra ones
  // carry no detail and every one of them costs paint and upload time.
  const ratio = Math.min(Math.max(pixelRatio, 1), document.width / cssWidth);
  const width = Math.max(1, Math.round(cssWidth * ratio));
  const height = Math.max(1, Math.round(cssHeight * ratio));
  return { width, height, cssWidth, cssHeight, scale: width / document.width };
}

export function sameScreenshotView(a: ScreenshotView, b: ScreenshotView): boolean {
  return a.width === b.width && a.height === b.height
    && a.cssWidth === b.cssWidth && a.cssHeight === b.cssHeight;
}

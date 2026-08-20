import { useEffect, useRef } from "react";

import {
  drawBox,
  drawCrop,
  drawPen,
  screenshotRect,
  type Rect,
  type ScreenshotTool,
} from "../../lib/screenshotDrawing";
import {
  EMPTY_SCREENSHOT_VIEW,
  fitScreenshotView,
  sameScreenshotView,
  type ScreenshotView,
} from "../../lib/screenshotView";
import type { CanvasDrag } from "./useScreenshotPointer";

interface MutableRef<T> { current: T }

interface Options {
  cropRef: MutableRef<Rect | null>;
  documentRef: MutableRef<HTMLCanvasElement>;
  dragRef: MutableRef<CanvasDrag | null>;
  tool: ScreenshotTool;
}

/**
 * Drives the editor's two visible layers: an image layer holding the capture,
 * repainted only when the document itself changes, and a transparent overlay
 * carrying the crop chrome and the in-progress stroke. Dragging therefore
 * repaints a few vector shapes instead of re-blitting the whole capture.
 */
export function useScreenshotLayers(options: Options) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const boundsRef = useRef<DOMRect | null>(null);
  const viewRef = useRef<ScreenshotView>(EMPTY_SCREENSHOT_VIEW);
  const overlayFrame = useRef<number | null>(null);

  const paintOverlay = () => {
    if (overlayFrame.current !== null) cancelAnimationFrame(overlayFrame.current);
    overlayFrame.current = null;
    const canvas = overlayRef.current;
    const view = viewRef.current;
    if (!canvas || !view.width) return;
    const context = canvas.getContext("2d")!;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const drag = options.dragRef.current;
    const crop = options.cropRef.current;
    if (!drag && !crop) return;
    // The overlay is drawn in document coordinates so the shapes match what a
    // commit bakes into the document canvas.
    context.setTransform(view.scale, 0, 0, view.scale, 0, 0);
    if (drag?.kind === "pen") drawPen(context, drag.points, drag.lineWidth, drag.color);
    if (drag?.kind === "box") {
      drawBox(context, screenshotRect(drag.start, drag.current), drag.lineWidth, drag.color);
    }
    if (!crop) return;
    const source = options.documentRef.current;
    const lineWidth = (1.5 * view.width) / (view.cssWidth * view.scale);
    drawCrop(context, source, crop, lineWidth, options.tool === "crop");
  };

  /** Coalesces pointer-driven overlay repaints to one animation frame. */
  const scheduleOverlay = () => {
    if (overlayFrame.current !== null) return;
    overlayFrame.current = requestAnimationFrame(paintOverlay);
  };

  const paint = () => {
    const frame = frameRef.current;
    const image = imageRef.current;
    const overlay = overlayRef.current;
    const source = options.documentRef.current;
    if (!frame || !image || !overlay) return;
    const box = frame.getBoundingClientRect();
    const view = fitScreenshotView(box, source, window.devicePixelRatio || 1);
    const resized = !sameScreenshotView(view, viewRef.current);
    viewRef.current = view;
    if (!view.width) return;
    for (const canvas of [image, overlay]) {
      if (resized) {
        canvas.width = view.width;
        canvas.height = view.height;
        canvas.style.width = `${view.cssWidth}px`;
        canvas.style.height = `${view.cssHeight}px`;
      }
    }
    const context = image.getContext("2d")!;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, view.width, view.height);
    context.drawImage(source, 0, 0, view.width, view.height);
    boundsRef.current = overlay.getBoundingClientRect();
    paintOverlay();
  };

  const paintRef = useRef(paint);
  useEffect(() => { paintRef.current = paint; });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => paintRef.current());
    observer.observe(frame);
    return () => {
      observer.disconnect();
      if (overlayFrame.current !== null) cancelAnimationFrame(overlayFrame.current);
      overlayFrame.current = null;
    };
  }, []);

  return {
    boundsRef,
    frameRef,
    imageRef,
    /** Refreshes the cached layer rect; call before a drag, not per move. */
    measure: () => { boundsRef.current = overlayRef.current?.getBoundingClientRect() ?? null; },
    overlayRef,
    paint,
    paintOverlay,
    scheduleOverlay,
    viewRef,
  };
}

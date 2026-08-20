import type { PointerEvent as ReactPointerEvent } from "react";

import { cropCursor, cropHitTarget, updateCropRect, type CropDragMode } from "../../lib/screenshotCrop";
import {
  documentLineWidth,
  screenshotPoint,
  screenshotRect,
  type Point,
  type Rect,
  type ScreenshotTool,
} from "../../lib/screenshotDrawing";
import type { ScreenshotOperation } from "../../lib/screenshotOperations";

export type CanvasDrag =
  | { kind: "crop"; mode: CropDragMode; start: Point; initial: Rect | null }
  | { kind: "box" | "pen"; start: Point; current: Point; points: Point[]; lineWidth: number; color: string };

interface MutableRef<T> { current: T }

interface Options {
  /** Layer rect measured on drag start, not per move: reading it inside the
   *  move handler forces a synchronous layout on every pointer event. */
  boundsRef: MutableRef<DOMRect | null>;
  color: string;
  commit: (operation: ScreenshotOperation, keepSelection?: boolean) => void;
  cropRef: MutableRef<Rect | null>;
  documentRef: MutableRef<HTMLCanvasElement>;
  dragRef: MutableRef<CanvasDrag | null>;
  emitState: () => void;
  measure: () => void;
  render: () => void;
  tool: ScreenshotTool;
}

export function useScreenshotPointer(options: Options) {
  const bounds = (event: ReactPointerEvent<HTMLCanvasElement>) => (
    options.boundsRef.current ?? event.currentTarget.getBoundingClientRect()
  );
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => (
    screenshotPoint(bounds(event), options.documentRef.current, event.nativeEvent)
  );
  const handleRadius = (event: ReactPointerEvent<HTMLCanvasElement>) => (
    documentLineWidth(bounds(event), options.documentRef.current, 10)
  );
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !options.documentRef.current.width) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    options.measure();
    const start = point(event);
    if (options.tool === "crop") {
      const initial = options.cropRef.current ? { ...options.cropRef.current } : null;
      const mode = initial ? cropHitTarget(start, initial, handleRadius(event)) : "new";
      if (mode === "new") options.cropRef.current = null;
      options.dragRef.current = { kind: "crop", mode, start, initial };
    } else {
      options.dragRef.current = {
        kind: options.tool,
        color: options.color,
        start,
        current: start,
        points: [start],
        lineWidth: documentLineWidth(
          bounds(event),
          options.documentRef.current,
          options.tool === "pen" ? 3.5 : 3,
        ),
      };
    }
    options.render();
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = options.dragRef.current;
    const current = point(event);
    if (!drag) {
      const crop = options.cropRef.current;
      const cursor = options.tool === "crop" && crop
        ? cropCursor(cropHitTarget(current, crop, handleRadius(event)))
        : "crosshair";
      // Writing an unchanged cursor still invalidates style on every move.
      if (event.currentTarget.style.cursor !== cursor) event.currentTarget.style.cursor = cursor;
      return;
    }
    if (drag.kind === "crop") {
      const source = options.documentRef.current;
      options.cropRef.current = updateCropRect(
        drag.mode, drag.start, current, drag.initial, source.width, source.height,
      );
    } else {
      drag.current = current;
      if (drag.kind === "pen") drag.points.push(current);
    }
    options.render();
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = options.dragRef.current;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.kind === "crop") {
      const rect = options.cropRef.current;
      if (!rect || rect.width < 8 || rect.height < 8) options.cropRef.current = drag.initial;
      options.dragRef.current = null;
      options.render();
      options.emitState();
      return;
    }
    const current = point(event);
    options.dragRef.current = null;
    if (drag.kind === "box") {
      const rect = screenshotRect(drag.start, current);
      if (rect.width >= 3 && rect.height >= 3) {
        options.commit({ type: "box", rect, lineWidth: drag.lineWidth, color: drag.color }, true);
      } else options.render();
    } else if (drag.points.length > 1) {
      options.commit({
        type: "pen",
        points: [...drag.points, current],
        lineWidth: drag.lineWidth,
        color: drag.color,
      }, true);
    } else options.render();
  };
  const onPointerCancel = () => {
    const drag = options.dragRef.current;
    if (drag?.kind === "crop") options.cropRef.current = drag.initial;
    options.dragRef.current = null;
    options.render();
    options.emitState();
  };
  return { onPointerCancel, onPointerDown, onPointerMove, onPointerUp };
}

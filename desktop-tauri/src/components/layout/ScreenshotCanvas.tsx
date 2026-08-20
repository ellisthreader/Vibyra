import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { Rect, ScreenshotTool } from "../../lib/screenshotDrawing";
import {
  applyScreenshotOperation,
  cloneScreenshotCanvas,
  exportScreenshotDataUrl,
  replayScreenshotOperations,
  type ScreenshotOperation,
} from "../../lib/screenshotOperations";
import type { CapturedScreenshot } from "../../types";
import { useScreenshotLayers } from "./useScreenshotLayers";
import { useScreenshotPointer, type CanvasDrag } from "./useScreenshotPointer";

export interface ScreenshotCanvasState {
  canRedo: boolean;
  canUndo: boolean;
  edited: boolean;
  height: number;
  ready: boolean;
  selection: Rect | null;
  width: number;
}

export interface ScreenshotCanvasHandle {
  applyCrop: () => boolean;
  clearSelection: () => void;
  dataUrl: () => Promise<string>;
  redo: () => void;
  reset: () => void;
  undo: () => void;
}

interface Props {
  color: string;
  draft: CapturedScreenshot;
  onError: (error: unknown) => void;
  onStateChange: (state: ScreenshotCanvasState) => void;
  tool: ScreenshotTool;
}

const MAX_OPERATIONS = 40;

export const ScreenshotCanvas = forwardRef<ScreenshotCanvasHandle, Props>(function ScreenshotCanvas(
  { color, draft, onError, onStateChange, tool }, ref,
) {
  const originalRef = useRef(document.createElement("canvas"));
  const baseRef = useRef(document.createElement("canvas"));
  const documentRef = useRef(document.createElement("canvas"));
  const cropRef = useRef<Rect | null>(null);
  const dragRef = useRef<CanvasDrag | null>(null);
  const operationsRef = useRef<ScreenshotOperation[]>([]);
  const indexRef = useRef(0);
  const baseDirtyRef = useRef(false);
  const generationRef = useRef(0);
  const layers = useScreenshotLayers({ cropRef, documentRef, dragRef, tool });

  const emitState = () => {
    const source = documentRef.current;
    onStateChange({
      canRedo: indexRef.current < operationsRef.current.length,
      canUndo: indexRef.current > 0,
      edited: baseDirtyRef.current || indexRef.current > 0,
      height: source.height,
      ready: source.width > 0,
      selection: cropRef.current ? { ...cropRef.current } : null,
      width: source.width,
    });
  };

  const rebuild = (keepSelection = false) => {
    const selection = keepSelection ? cropRef.current : null;
    documentRef.current = replayScreenshotOperations(
      baseRef.current,
      operationsRef.current.slice(0, indexRef.current),
    );
    cropRef.current = selection;
    dragRef.current = null;
    layers.paint();
    emitState();
  };

  const commit = (operation: ScreenshotOperation, keepSelection = false) => {
    operationsRef.current.splice(indexRef.current);
    if (operationsRef.current.length >= MAX_OPERATIONS) {
      baseRef.current = cloneScreenshotCanvas(documentRef.current);
      operationsRef.current = [];
      indexRef.current = 0;
      baseDirtyRef.current = true;
    }
    operationsRef.current.push(operation);
    indexRef.current += 1;
    documentRef.current = applyScreenshotOperation(documentRef.current, operation);
    if (!keepSelection) cropRef.current = null;
    dragRef.current = null;
    layers.paint();
    emitState();
  };

  const applyCrop = () => {
    const rect = cropRef.current;
    if (!rect || rect.width < 8 || rect.height < 8) return false;
    cropRef.current = null;
    commit({ type: "crop", rect });
    return true;
  };

  useImperativeHandle(ref, () => ({
    applyCrop,
    clearSelection: () => { cropRef.current = null; layers.paintOverlay(); emitState(); },
    dataUrl: async () => exportScreenshotDataUrl(documentRef.current, cropRef.current),
    redo: () => { if (indexRef.current < operationsRef.current.length) { indexRef.current += 1; rebuild(true); } },
    reset: () => {
      baseRef.current = cloneScreenshotCanvas(originalRef.current);
      operationsRef.current = [];
      indexRef.current = 0;
      baseDirtyRef.current = false;
      rebuild();
    },
    undo: () => { if (indexRef.current > 0) { indexRef.current -= 1; rebuild(true); } },
  }));

  useEffect(() => {
    const generation = ++generationRef.current;
    const image = new ImageData(draft.pixels, draft.width, draft.height);
    void createImageBitmap(image).then((bitmap) => {
      if (generation !== generationRef.current) {
        bitmap.close();
        return;
      }
      const original = document.createElement("canvas");
      original.width = draft.width;
      original.height = draft.height;
      original.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      originalRef.current = original;
      baseRef.current = original;
      documentRef.current = cloneScreenshotCanvas(original);
      operationsRef.current = [];
      indexRef.current = 0;
      baseDirtyRef.current = false;
      cropRef.current = null;
      dragRef.current = null;
      layers.paint();
      emitState();
    }).catch((error: unknown) => {
      if (generation !== generationRef.current) return;
      onError(error);
    });
    return () => { generationRef.current += 1; };
  }, [draft, onError]);

  // Switching tool or colour only changes the overlay chrome; the image layer
  // is untouched, so there is nothing to re-blit.
  useEffect(() => { dragRef.current = null; layers.paintOverlay(); emitState(); }, [tool, color]);

  const pointer = useScreenshotPointer({
    boundsRef: layers.boundsRef,
    color,
    commit,
    cropRef,
    documentRef,
    dragRef,
    emitState,
    measure: layers.measure,
    render: layers.scheduleOverlay,
    tool,
  });
  return (
    <div className="screenshot-canvas-layers" ref={layers.frameRef}>
      <canvas ref={layers.imageRef} className="screenshot-canvas" aria-hidden="true" />
      <canvas ref={layers.overlayRef} className="screenshot-canvas screenshot-canvas--overlay" {...pointer} />
    </div>
  );
});

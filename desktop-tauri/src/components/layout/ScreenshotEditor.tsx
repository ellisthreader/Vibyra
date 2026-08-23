import { useCallback, useEffect, useRef, useState } from "react";

import { finishScreenshotEdit } from "../../ipc/tools";
import type { ScreenshotTool } from "../../lib/screenshotDrawing";
import { useReportStore } from "../../state/reportStore";
import { useScreenshotStore } from "../../state/screenshotStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import {
  ScreenshotCanvas,
  type ScreenshotCanvasHandle,
  type ScreenshotCanvasState,
} from "./ScreenshotCanvas";
import { ScreenshotEditorToolbar, SCREENSHOT_COLORS } from "./ScreenshotEditorToolbar";
import { useScreenshotActions } from "./useScreenshotActions";

const EMPTY_STATE: ScreenshotCanvasState = {
  canRedo: false,
  canUndo: false,
  edited: false,
  height: 0,
  ready: false,
  selection: null,
  width: 0,
};

function editorHint(tool: ScreenshotTool, state: ScreenshotCanvasState): string {
  if (!state.ready) return "Preparing screenshot…";
  if (tool === "crop" && state.selection) return "Drag inside to move · use the corner handles to resize";
  if (tool === "crop") return "Drag over the area you want to keep";
  if (tool === "box") return "Drag to place a rectangle";
  return "Draw directly on the screenshot";
}

export function ScreenshotEditor() {
  const draft = useScreenshotStore((state) => state.draft);
  const closeEditor = useScreenshotStore((state) => state.closeEditor);
  const close = useCallback(() => {
    useReportStore.getState().cancelScreenshot();
    closeEditor();
  }, [closeEditor]);
  const addShot = useScreenshotStore((state) => state.addShot);
  // Set while a report is waiting for this shot: the editor then offers to
  // hand it back rather than only to save or copy it.
  const forReport = useReportStore((state) => state.capturing);
  const canvas = useRef<ScreenshotCanvasHandle>(null);
  const [tool, setTool] = useState<ScreenshotTool>("crop");
  const [color, setColor] = useState(SCREENSHOT_COLORS[0]);
  const [canvasState, setCanvasState] = useState(EMPTY_STATE);
  const actions = useScreenshotActions(canvas, addShot, close);
  const attachToReport = useCallback(async () => {
    const dataUrl = await canvas.current?.dataUrl();
    if (dataUrl) useReportStore.getState().applyScreenshot(dataUrl);
  }, []);
  const onCanvasError = useCallback((error: unknown) => {
    close();
    useWorkspaceStore.getState().setError(`Screenshot could not be prepared: ${String(error)}`);
  }, [close]);

  // The workspace keeps its layout (nothing reflows on the way in or out) but
  // stops painting and stops taking focus while the editor is up.
  useEffect(() => {
    if (!draft) return;
    document.body.classList.add("screenshot-editing");
    const editor = document.querySelector<HTMLElement>(".screenshot-editor");
    const siblings = Array.from(document.querySelectorAll<HTMLElement>(".app > *"))
      .filter((item) => item !== editor);
    const prior = siblings.map((item) => item.inert);
    siblings.forEach((item) => { item.inert = true; });
    editor?.querySelector<HTMLElement>("[data-editor-close]")?.focus();
    return () => {
      document.body.classList.remove("screenshot-editing");
      siblings.forEach((item, index) => { item.inert = prior[index]; });
      void finishScreenshotEdit();
    };
  }, [draft]);

  useEffect(() => {
    if (!draft) return;
    setTool("crop");
    setCanvasState(EMPTY_STATE);
  }, [draft]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey;
      if (event.key === "Escape") close();
      else if (draft && command && event.key.toLowerCase() === "z" && event.shiftKey) canvas.current?.redo();
      else if (draft && command && event.key.toLowerCase() === "z") canvas.current?.undo();
      else if (draft && command && event.key.toLowerCase() === "y") canvas.current?.redo();
      else if (draft && command && event.key.toLowerCase() === "c") void actions.copy();
      else if (draft && command && event.key.toLowerCase() === "s") void actions.save();
      else if (draft && !command && !event.altKey) {
        const next = ({ "1": "crop", "2": "box", "3": "pen" } as const)[event.key];
        if (next) setTool(next);
        else return;
      } else return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [actions.copy, actions.save, close, draft]);

  if (!draft) return null;

  const selection = canvasState.selection;
  const dimensions = selection
    ? `Selection ${Math.round(selection.width)} × ${Math.round(selection.height)}`
    : `${canvasState.width || draft.width} × ${canvasState.height || draft.height}`;

  return (
    <section className="screenshot-editor" role="dialog" aria-modal="true" aria-label="Screenshot editor">
      <ScreenshotEditorToolbar
        canvasState={canvasState} close={close} color={color} onColor={setColor}
        onRedo={() => canvas.current?.redo()} onReset={() => canvas.current?.reset()}
        onTool={setTool} onUndo={() => canvas.current?.undo()} tool={tool}
      />
      <div className="screenshot-editor__stage">
        <div className={`screenshot-canvas-frame ${canvasState.ready ? "screenshot-canvas-frame--ready" : ""}`}>
          <ScreenshotCanvas ref={canvas} draft={draft} tool={tool} color={color} onError={onCanvasError} onStateChange={setCanvasState} />
        </div>
        <div className="screenshot-editor__hint" role="status">{editorHint(tool, canvasState)}</div>
      </div>
      <footer className="screenshot-editor__footer">
        <div className="screenshot-editor__meta"><span>{dimensions}</span>{canvasState.edited && <span>Edited</span>}</div>
        <span className={`screenshot-editor__notice screenshot-editor__notice--${actions.notice?.tone ?? "idle"}`} role="status">{actions.notice?.message}</span>
        {selection && <div className="screenshot-selection-actions">
          <button className="btn" onClick={() => canvas.current?.clearSelection()}>Clear selection</button>
          <button className="btn" onClick={() => canvas.current?.applyCrop()}>Crop to selection</button>
        </div>}
        <div className="screenshot-editor__actions">
          <button className="btn" disabled={!canvasState.ready || Boolean(actions.busy)} onClick={() => void actions.copy()}>{actions.busy === "copy" ? "Copying…" : selection ? "Copy selection" : "Copy"}</button>
          {forReport ? (
            <button className="btn btn--primary" disabled={!canvasState.ready} onClick={() => void attachToReport()}>Attach to report</button>
          ) : (
            <button className="btn btn--primary" disabled={!canvasState.ready || Boolean(actions.busy)} onClick={() => void actions.save()}>{actions.busy === "save" ? "Saving…" : selection ? "Save selection" : "Save"}</button>
          )}
        </div>
      </footer>
    </section>
  );
}

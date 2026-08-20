import type { CSSProperties } from "react";

import type { ScreenshotTool } from "../../lib/screenshotDrawing";
import { CloseIcon } from "../common/Icons";
import type { ScreenshotCanvasState } from "./ScreenshotCanvas";

export const SCREENSHOT_COLORS = ["#ff5f6d", "#ffb547", "#5b7cfa", "#35c58b", "#ffffff"];

function ToolIcon({ tool }: { tool: ScreenshotTool }) {
  if (tool === "crop") return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3v10.5A2.5 2.5 0 0 0 8.5 16H17M3 6h10.5A2.5 2.5 0 0 1 16 8.5V17" /></svg>;
  if (tool === "box") return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3.5" y="4" width="13" height="12" rx="1.5" /></svg>;
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 15 1.1-4.2L13.5 2.5l4 4-8.4 8.4L5 16zM11.8 4.2l4 4" /></svg>;
}

function HistoryIcon({ kind }: { kind: "undo" | "redo" | "reset" }) {
  if (kind === "reset") return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7V3m0 0h4M4.4 3.8A7 7 0 1 1 3 12" /></svg>;
  const flip = kind === "redo" ? { transform: "scaleX(-1)" } : undefined;
  return <svg viewBox="0 0 20 20" aria-hidden="true" style={flip}><path d="M8 5 3.5 9.5 8 14M4 9.5h7.5a5 5 0 0 1 5 5V16" /></svg>;
}

function ToolButton({ active, label, shortcut, tool, onClick }: {
  active: boolean;
  label: string;
  shortcut: string;
  tool: ScreenshotTool;
  onClick: () => void;
}) {
  return (
    <button className={`screenshot-tool ${active ? "screenshot-tool--active" : ""}`} aria-pressed={active} title={`${label} (${shortcut})`} onClick={onClick}>
      <ToolIcon tool={tool} /><span className="screenshot-tool__label">{label}</span><kbd>{shortcut}</kbd>
    </button>
  );
}

interface Props {
  canvasState: ScreenshotCanvasState;
  close: () => void;
  color: string;
  onColor: (color: string) => void;
  onRedo: () => void;
  onReset: () => void;
  onTool: (tool: ScreenshotTool) => void;
  onUndo: () => void;
  tool: ScreenshotTool;
}

export function ScreenshotEditorToolbar(props: Props) {
  return (
    <header className="screenshot-editor__toolbar">
      <button data-editor-close className="screenshot-close" title="Close editor (Esc)" onClick={props.close}>
        <CloseIcon size={15} /><span>Close</span><kbd>Esc</kbd>
      </button>
      <div className="screenshot-tools" aria-label="Screenshot tools">
        <ToolButton label="Crop" shortcut="1" tool="crop" active={props.tool === "crop"} onClick={() => props.onTool("crop")} />
        <ToolButton label="Rectangle" shortcut="2" tool="box" active={props.tool === "box"} onClick={() => props.onTool("box")} />
        <ToolButton label="Draw" shortcut="3" tool="pen" active={props.tool === "pen"} onClick={() => props.onTool("pen")} />
        {props.tool !== "crop" && <span className="screenshot-colors" aria-label="Annotation colour">{SCREENSHOT_COLORS.map((value) => (
          <button key={value} className="screenshot-color" style={{ "--shot-color": value } as CSSProperties} aria-label={`Use ${value}`} aria-pressed={props.color === value} onClick={() => props.onColor(value)} />
        ))}</span>}
      </div>
      <div className="screenshot-history" aria-label="Edit history">
        <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!props.canvasState.canUndo} onClick={props.onUndo}><HistoryIcon kind="undo" /></button>
        <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={!props.canvasState.canRedo} onClick={props.onRedo}><HistoryIcon kind="redo" /></button>
        <button className="icon-btn" title="Reset all edits" disabled={!props.canvasState.edited && !props.canvasState.selection} onClick={props.onReset}><HistoryIcon kind="reset" /></button>
      </div>
    </header>
  );
}

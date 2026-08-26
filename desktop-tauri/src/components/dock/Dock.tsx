import { useEffect, useState } from "react";
import type { CSSProperties, RefObject } from "react";

import {
  DOCK_COMPACT_MAX,
  DOCK_COMPACT_MIN,
  dockValue,
  dockWidth,
} from "../../lib/dockLayout";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { ChatPanel } from "../companion/ChatPanel";
import { MemoryPanel } from "../companion/MemoryPanel";
import { PreviewWorkspace } from "../preview/PreviewWorkspace";
import { ReviewPanel } from "../review/ReviewPanel";
import { FileTree } from "../rail/FileTree";
import { DockTabs } from "./DockTabs";
import { useDockResize } from "./useDockResize";

interface Props {
  projectId: string;
  root: string;
  /** The workspace box the dock floats inside — the grip measures against it. */
  host: RefObject<HTMLElement | null>;
}

/**
 * The workspace's right edge, as one floating panel.
 *
 * Replaces the pair that used to share this job: a preview pane inside the
 * stage grid and a separate companion aside, each with its own sizing model,
 * and a companion that disappeared entirely whenever the preview took the
 * stage. Preview is a tool here, not a place.
 *
 * The panel is absolutely positioned rather than a column in the shell row.
 * That is a performance decision as much as a visual one: its width no longer
 * participates in terminal layout, so dragging it refits no xterm at all until
 * the drag is released. No `backdrop-filter` anywhere on it — see the note at
 * the top of `chrome.css` for what that costs under WebKitGTK.
 */
export function Dock({ projectId, root, host }: Props) {
  const tool = useWorkspaceStore((s) => s.dockTool);
  const size = useWorkspaceStore((s) => s.dockSize);
  const compact = useWorkspaceStore((s) => s.dockCompactWidth);
  const ratio = useWorkspaceStore((s) => s.dockWideRatio);
  const setDockTool = useWorkspaceStore((s) => s.setDockTool);
  const setDockWidth = useWorkspaceStore((s) => s.setDockWidth);
  // Preview machinery is not started for someone who never opens it, but once
  // it has been opened it stays mounted for the rest of the project's session:
  // switching tools or shutting the dock must not restart a running dev server.
  const [previewTouched, setPreviewTouched] = useState(false);
  const resize = useDockResize(size, dockValue(size, compact, ratio), host, setDockWidth);

  useEffect(() => {
    setPreviewTouched(false);
  }, [projectId]);

  useEffect(() => {
    if (tool === "preview") setPreviewTouched(true);
  }, [tool, projectId]);

  const open = tool !== null;
  const compactGrip = size === "compact";

  return (
    <aside
      className={`dock ${open ? "" : "dock--off"}`}
      data-size={size}
      aria-label="Project dock"
      style={{ "--dock-w": dockWidth(size, resize.width) } as CSSProperties}
    >
      {size !== "full" && (
        <div
          className="dock__grip"
          role="separator"
          aria-label="Resize dock"
          aria-orientation="vertical"
          aria-valuemin={compactGrip ? DOCK_COMPACT_MIN : 25}
          aria-valuemax={compactGrip ? DOCK_COMPACT_MAX : 75}
          aria-valuenow={compactGrip ? Math.round(resize.width) : Math.round(resize.width * 100)}
          tabIndex={0}
          onPointerDown={resize.start}
          onKeyDown={resize.resizeWithKeyboard}
          onDoubleClick={resize.reset}
        />
      )}

      <header className="dock__head">
        <DockTabs tool={tool} onTool={setDockTool} />
      </header>

      <div
        className="dock__body"
        id="dock-panel"
        role="tabpanel"
        aria-labelledby={tool ? `dock-tab-${tool}` : undefined}
      >
        {previewTouched && (
          <div className={`dock__tool ${tool === "preview" ? "" : "dock__tool--off"}`}>
            <PreviewWorkspace key={projectId} projectId={projectId} root={root} />
          </div>
        )}
        {tool === "chat" && <ChatPanel />}
        {tool === "memory" && <MemoryPanel />}
        {tool === "review" && <ReviewPanel projectId={projectId} root={root} />}
        {tool === "files" && (
          <div className="companion-panel companion-panel--files">
            <FileTree />
          </div>
        )}
      </div>
    </aside>
  );
}

import { useEffect, useState } from "react";

import { setTerminalVisibility } from "../../ipc/terminal";
import {
  applyProjectVisibility,
  projectRuntimeTransitions,
  syncProjectVisibility,
} from "../../lib/projectTransitions";
import { previewVisible, terminalsVisible } from "../../lib/stageLayout";
import { useFocusVisibility } from "../../lib/useFocusVisibility";
import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { PreviewWorkspace } from "../preview/PreviewWorkspace";
import { TerminalStage } from "../terminal/TerminalStage";
import { StageSplit } from "./StageSplit";

export function ProjectWorkspace() {
  const activeId = useProjectStore((state) => state.activeId);
  const projects = useProjects();
  const layout = useWorkspaceStore((state) => state.stageLayout);
  const ratio = useWorkspaceStore((state) => state.stageRatio);
  const setStageRatio = useWorkspaceStore((state) => state.setStageRatio);
  const zoomedId = useTerminalStore((state) => state.zoomedId);
  // Preview machinery is not started for someone who never opens it, but once
  // it has been opened it stays mounted for the rest of the project's session:
  // dropping back to Terminals must not restart a running dev server.
  const [previewTouched, setPreviewTouched] = useState(false);
  // Hands the full native flush rate to whichever pane holds the keyboard.
  useFocusVisibility();
  const project = projects.find((entry) => entry.id === activeId);

  useEffect(() => {
    setPreviewTouched(false);
  }, [activeId]);

  useEffect(() => {
    if (previewVisible(layout)) setPreviewTouched(true);
  }, [layout, activeId]);

  useEffect(() => {
    if (!activeId) return;
    let current = true;
    void projectRuntimeTransitions.run(async () => {
      const project = useProjectStore.getState();
      const workspace = useWorkspaceStore.getState();
      if (
        !current ||
        project.view !== "project" ||
        project.activeId !== activeId ||
        workspace.stageLayout !== layout
      ) {
        return new Map();
      }
      // Full preview is the only layout where the terminals are genuinely off
      // screen; in a split they are visible and keep their delivery rate.
      return syncProjectVisibility(
        useTerminalStore.getState().panes,
        terminalsVisible(layout) ? activeId : null,
        setTerminalVisibility,
        useTerminalStore.getState().focusedId,
      );
    }).then((applied) => {
      if (!current || applied.size === 0) return;
      useTerminalStore.setState((state) => ({
        panes: applyProjectVisibility(state.panes, applied),
      }));
    });
    return () => {
      current = false;
    };
  }, [activeId, layout]);

  if (!project || !activeId) return null;

  const showPreview = previewTouched || previewVisible(layout);

  return (
    <main className="workspace project-workspace">
      <StageSplit
        layout={layout}
        ratio={ratio}
        onRatio={setStageRatio}
        terminals={<TerminalStage active={terminalsVisible(layout)} />}
        preview={
          showPreview ? (
            <PreviewWorkspace key={activeId} projectId={activeId} root={project.root} />
          ) : null
        }
      />

      {terminalsVisible(layout) && zoomedId !== null && (
        <button
          type="button"
          className="chip stage__zoom-exit"
          onClick={() => useTerminalStore.getState().toggleZoom(zoomedId)}
        >
          Exit zoom
        </button>
      )}
    </main>
  );
}

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { setTerminalVisibility } from "../../ipc/terminal";
import { DOCK_GAP_PX, dockReserve, dockValue, terminalsVisible } from "../../lib/dockLayout";
import {
  applyProjectVisibility,
  projectRuntimeTransitions,
  syncProjectVisibility,
} from "../../lib/projectTransitions";
import { useFocusVisibility } from "../../lib/useFocusVisibility";
import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { Dock } from "../dock/Dock";
import { TerminalStage } from "../terminal/TerminalStage";

export function ProjectWorkspace() {
  const activeId = useProjectStore((state) => state.activeId);
  const projects = useProjects();
  const tool = useWorkspaceStore((state) => state.dockTool);
  const size = useWorkspaceStore((state) => state.dockSize);
  const compact = useWorkspaceStore((state) => state.dockCompactWidth);
  const ratio = useWorkspaceStore((state) => state.dockWideRatio);
  const zoomedId = useTerminalStore((state) => state.zoomedId);
  const host = useRef<HTMLElement>(null);
  // Hands the full native flush rate to whichever pane holds the keyboard.
  useFocusVisibility();
  const project = projects.find((entry) => entry.id === activeId);
  const showTerminals = terminalsVisible(size, tool !== null);

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
        terminalsVisible(workspace.dockSize, workspace.dockTool !== null) !== showTerminals
      ) {
        return new Map();
      }
      // A full-size dock is the only state where the terminals are genuinely
      // off screen; at compact and wide they are beside it and keep their
      // delivery rate.
      return syncProjectVisibility(
        useTerminalStore.getState().panes,
        showTerminals ? activeId : null,
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
  }, [activeId, showTerminals]);

  if (!project || !activeId) return null;

  return (
    <main
      className="workspace project-workspace"
      ref={host}
      style={
        {
          "--dock-gap": `${DOCK_GAP_PX}px`,
          "--dock-reserve": dockReserve(size, tool !== null, dockValue(size, compact, ratio)),
        } as CSSProperties
      }
    >
      {/* Hidden, never unmounted: a full-size dock must not throw away a
          pane's scrollback, and the reserve is what keeps the grid out from
          under the dock at the other two sizes. */}
      <div className={`workspace__stage ${showTerminals ? "" : "workspace__stage--off"}`}>
        <TerminalStage active={showTerminals} />
      </div>

      <Dock projectId={activeId} root={project.root} host={host} />

      {showTerminals && zoomedId !== null && (
        <button
          type="button"
          className="chip workspace__zoom-exit"
          onClick={() => useTerminalStore.getState().toggleZoom(zoomedId)}
        >
          Exit zoom
        </button>
      )}
    </main>
  );
}
